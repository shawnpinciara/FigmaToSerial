/* FigProxyWEB — content script (runs on Figma prototype/design pages).
 *
 * - Owns the Web Serial connection (needs a user gesture + secure context,
 *   both available here). Works on Chrome >= 89 and Firefox >= 151.
 * - Receives F2S_EVENT messages from background (Figma -> Arduino) and
 *   writes them to the serial port (newline-terminated lines).
 * - Reads lines from Arduino and re-dispatches them into the page
 *   (Arduino -> Figma): a `f2s-serial` CustomEvent for user code plus a
 *   legacy single-character synthetic keypress.
 *
 * NOTE: `chrome.debugger`-driven "trusted" input was removed. Driving
 * trusted input requires the `debugger` permission + an intrusive infobar
 * and fails Chrome Web Store review for most use cases. It can come back
 * as an explicit opt-in in background.js if ever needed.
 */
(() => {
  "use strict";

  const ext =
    (globalThis.f2sExt && globalThis.f2sExt.api) ||
    globalThis.browser ||
    globalThis.chrome;

  const DEFAULT_BAUD = 9600;
  const SLIDER_COALESCE_MS = 30; // collapse slider bursts, send latest only
  const LOG_KEEP = 30;

  const state = {
    port: null,
    writer: null,
    connected: false,
    baudRate: DEFAULT_BAUD,
    pendingSlider: null,
    pendingTimer: 0,
    badgeEl: null,
    autoConnectArmed: false,
    knownPorts: [], // Port objects from getPorts()/requestPort() (not serializable)
    lastError: null,
  };

  const log = (...args) => console.log("[F2S]", ...args);

  /* ---------------- storage helpers ---------------- */

  async function storageGet(keys) {
    try {
      return (await ext.storage.local.get(keys)) || {};
    } catch {
      return {};
    }
  }

  async function storageSet(items) {
    try {
      await ext.storage.local.set(items);
    } catch {
      /* ignore */
    }
  }

  function notifyStatus(extra) {
    const msg = Object.assign(
      { type: "F2S_STATUS", connected: state.connected, baudRate: state.baudRate },
      extra || {}
    );
    try {
      const res = ext.runtime.sendMessage(msg);
      if (res && typeof res.catch === "function") res.catch(() => {});
    } catch {
      /* background asleep; popup falls back to storage */
    }
    storageSet({
      f2sStatus: { connected: state.connected, baudRate: state.baudRate },
    });
  }

  async function pushLog(direction, text) {
    const { f2sLog = [] } = await storageGet({ f2sLog: [] });
    f2sLog.push({ t: Date.now(), dir: direction, text: String(text).slice(0, 200) });
    await storageSet({ f2sLog: f2sLog.slice(-LOG_KEEP) });
  }

  /* ---------------- serial ---------------- */

  /* ---------------- port listing / picking ----------------
   * Privacy rule of Web Serial: a page can only SEE ports the user already
   * granted to this origin (getPorts()). New ports need requestPort(),
   * which shows the browser picker and requires a real user gesture.
   */

  function portLabel(port, index) {
    try {
      const info = port.getInfo();
      if (info && info.usbVendorId != null) {
        const vid = info.usbVendorId.toString(16).padStart(4, "0");
        const pid = (info.usbProductId || 0).toString(16).padStart(4, "0");
        return "USB " + vid + ":" + pid + " (#" + (index + 1) + ")";
      }
      if (info && info.bluetoothServiceClassId != null) return "Bluetooth (#" + (index + 1) + ")";
    } catch {
      /* fall through */
    }
    return "Serial port " + (index + 1);
  }

  function portListMessage() {
    return state.knownPorts.map((p, i) => ({ index: i, label: portLabel(p, i) }));
  }

  async function refreshKnownPorts() {
    if (!("serial" in navigator)) {
      state.knownPorts = [];
      return [];
    }
    try {
      state.knownPorts = await navigator.serial.getPorts();
    } catch (err) {
      log("getPorts failed:", err);
      state.knownPorts = [];
    }
    return portListMessage();
  }

  // Shows the browser port picker. MUST run off a real user gesture
  // (in-page badge click); calls triggered from the popup may be rejected.
  async function pickNewPort() {
    const port = await navigator.serial.requestPort();
    await refreshKnownPorts();
    let index = state.knownPorts.indexOf(port);
    if (index < 0) {
      state.knownPorts.push(port);
      index = state.knownPorts.length - 1;
    }
    return { index, ports: portListMessage() };
  }

  async function connectSerial(baudRate, portIndex) {
    if (state.connected) return true;
    if (!("serial" in navigator)) {
      state.lastError = "Web Serial is not supported in this browser.";
      log(state.lastError);
      notifyStatus({ error: state.lastError });
      return false;
    }
    try {
      let port = null;
      if (portIndex != null && state.knownPorts[portIndex]) {
        port = state.knownPorts[portIndex]; // already granted: no picker needed
      } else {
        await refreshKnownPorts();
        if (portIndex != null && state.knownPorts[portIndex]) {
          port = state.knownPorts[portIndex];
        } else {
          port = await navigator.serial.requestPort(); // browser picker
          await refreshKnownPorts();
        }
      }
      await port.open({ baudRate: baudRate || state.baudRate });
      state.port = port;
      state.writer = port.writable.getWriter();
      state.connected = true;
      state.baudRate = baudRate || state.baudRate;
      state.lastError = null;
      renderBadge();
      notifyStatus();
      log("Serial connected at", state.baudRate, "baud.");
      readLoop().catch((err) => log("Read loop ended:", err));
      return true;
    } catch (err) {
      state.lastError = String((err && err.message) || err);
      log("Serial connect failed:", err);
      state.connected = false;
      renderBadge();
      // Picker blocked for missing user gesture? Flash the in-page badge:
      // clicking IT is a valid gesture, so it shows the user where to click.
      if (/user activation|user gesture/i.test(state.lastError)) flashBadge();
      notifyStatus({ error: state.lastError });
      return false;
    }
  }

  async function disconnectSerial() {
    state.pendingSlider = null;
    if (state.pendingTimer) {
      clearTimeout(state.pendingTimer);
      state.pendingTimer = 0;
    }
    try {
      if (state.writer) {
        state.writer.releaseLock();
        state.writer = null;
      }
    } catch {
      /* ignore */
    }
    try {
      if (state.port) await state.port.close();
    } catch {
      /* already closed */
    }
    state.port = null;
    state.connected = false;
    renderBadge();
    notifyStatus();
    log("Serial disconnected.");
  }

  async function writeNow(text) {
    if (!state.connected || !state.writer) return false;
    try {
      await state.writer.write(new TextEncoder().encode(text + "\n"));
      pushLog("tx", text);
      return true;
    } catch (err) {
      log("Write failed:", err);
      await disconnectSerial();
      return false;
    }
  }

  function flushSlider() {
    state.pendingTimer = 0;
    const text = state.pendingSlider;
    state.pendingSlider = null;
    if (text != null) writeNow(text);
  }

  /** Figma -> Arduino. Slider-like values (`F2S:SLIDER:…`) arrive in bursts
   * while dragging: keep only the latest per window instead of flooding USB.
   */
  function writeText(text) {
    if (/^F2S:SLIDER:/i.test(text)) {
      state.pendingSlider = text;
      if (!state.pendingTimer) {
        state.pendingTimer = setTimeout(flushSlider, SLIDER_COALESCE_MS);
      }
      return true;
    }
    return writeNow(text);
  }

  async function readLoop() {
    const decoder = new TextDecoderStream();
    state.port.readable.pipeTo(decoder.writable);
    const reader = decoder.readable.getReader();
    let buffer = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      if (!value) continue;
      buffer += value;
      let idx;
      while ((idx = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);
        if (line) handleArduinoLine(line);
      }
    }
  }

  /** Arduino -> Figma. */
  function handleArduinoLine(line) {
    log("rx:", line);
    pushLog("rx", line);
    try {
      const res = ext.runtime.sendMessage({ type: "F2S_RX", data: line });
      if (res && typeof res.catch === "function") res.catch(() => {});
    } catch {
      /* background asleep; storage log still updated */
    }
    // Generic hook for page-level integrations (sliders, toggles, …):
    document.dispatchEvent(new CustomEvent("f2s-serial", { detail: line }));
    // Legacy behaviour: single characters act as keypresses.
    if (line.length === 1) dispatchSyntheticKey(line);
  }

  function dispatchSyntheticKey(key) {
    const code = key.toUpperCase().charCodeAt(0);
    const event = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key,
      code: "Key" + String.fromCharCode(code),
      keyCode: code,
      which: code,
    });
    document.body.dispatchEvent(event);
  }

  /* ---------------- messages (background / popup) ---------------- */

  ext.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || typeof msg.type !== "string") return undefined;
    if (msg.type === "F2S_EVENT" && typeof msg.data === "string") {
      writeText(msg.data);
    } else if (msg.type === "CMD_LIST_PORTS") {
      refreshKnownPorts().then((ports) => {
        try {
          sendResponse({ ports });
        } catch {
          /* channel closed */
        }
      });
      return true;
    } else if (msg.type === "CMD_PICK_PORT") {
      pickNewPort().then(
        (res) => {
          try {
            sendResponse({ ok: true, index: res.index, ports: res.ports });
          } catch {
            /* channel closed */
          }
        },
        (err) => {
          state.lastError = String((err && err.message) || err);
          log("Port picker failed:", err);
          if (/user activation|user gesture/i.test(state.lastError)) flashBadge();
          try {
            sendResponse({ ok: false, error: state.lastError });
          } catch {
            /* channel closed */
          }
        }
      );
      return true;
    } else if (msg.type === "CMD_CONNECT") {
      connectSerial(msg.baudRate || DEFAULT_BAUD, msg.portIndex).then((ok) => {
        try {
          sendResponse({ ok, error: ok ? null : state.lastError });
        } catch {
          /* channel closed */
        }
      });
      return true; // async sendResponse
    } else if (msg.type === "CMD_DISCONNECT") {
      disconnectSerial().then(() => {
        try {
          sendResponse({ ok: true });
        } catch {
          /* channel closed */
        }
      });
      return true;
    } else if (msg.type === "STATUS_REQUEST") {
      try {
        sendResponse({
          connected: state.connected,
          baudRate: state.baudRate,
          error: state.lastError,
        });
      } catch {
        /* ignore */
      }
    }
    return undefined;
  });

  /* ---------------- tiny status badge ---------------- */

  function renderBadge() {
    if (!state.badgeEl) {
      const el = document.createElement("button");
      el.id = "f2s-badge";
      el.title = "FigProxyWEB: click to connect";
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        if (state.connected) disconnectSerial();
        else connectSerial();
      });
      document.documentElement.appendChild(el);
      state.badgeEl = el;
    }
    state.badgeEl.textContent = state.connected ? "● F2S" : "○ F2S";
    state.badgeEl.dataset.connected = String(state.connected);
  }

  const badgeCSS =
    "#f2s-badge{position:fixed;right:12px;bottom:12px;z-index:2147483647;" +
    "font:11px/1 system-ui,sans-serif;padding:6px 10px;border-radius:20px;" +
    "border:1px solid #ccc;background:#fff;opacity:.75;cursor:pointer}" +
    "#f2s-badge[data-connected='true']{border-color:#1a7f37;color:#1a7f37;opacity:1}" +
    "#f2s-badge.f2s-flash{animation:f2s-pulse .6s ease-in-out 6;border-color:#b45309;color:#b45309;opacity:1}" +
    "@keyframes f2s-pulse{50%{transform:scale(1.25)}}" ;

  function injectBadgeCSS() {
    const style = document.createElement("style");
    style.textContent = badgeCSS;
    document.documentElement.appendChild(style);
  }

  // Briefly pulse the badge to draw attention (e.g. "click me, I'm a gesture").
  function flashBadge() {
    if (!state.badgeEl) return;
    state.badgeEl.classList.remove("f2s-flash");
    void state.badgeEl.offsetWidth; // restart animation
    state.badgeEl.classList.add("f2s-flash");
    setTimeout(() => state.badgeEl && state.badgeEl.classList.remove("f2s-flash"), 4000);
  }

  /* ---------------- init ---------------- */

  (async function init() {
    log("Content script running. Serial supported:", "serial" in navigator);
    injectBadgeCSS();
    renderBadge();
    await refreshKnownPorts();

    // Keep the cached list fresh when devices are plugged/unplugged.
    try {
      navigator.serial.addEventListener("connect", () => refreshKnownPorts());
      navigator.serial.addEventListener("disconnect", () => refreshKnownPorts());
    } catch {
      /* older implementations */
    }

    // Opt-in only: connect on first click inside Figma when enabled in popup.
    // Enabled by default so the first click also counts as the user gesture
    // that Web Serial requires to show the port picker.
    const { f2sAutoConnect = true } = await storageGet({ f2sAutoConnect: true });
    if (f2sAutoConnect && !state.autoConnectArmed) {
      state.autoConnectArmed = true;
      document.body.addEventListener(
        "pointerdown",
        () => {
          if (!state.connected) connectSerial();
        },
        { once: true }
      );
    }
  })();
})();
