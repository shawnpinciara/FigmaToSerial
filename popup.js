/* FigProxyWEB popup — asks the content script (serial owner) to
 * connect/disconnect and renders status + recent events from storage. */
(function () {
  "use strict";

  const ext =
    (globalThis.f2sExt && globalThis.f2sExt.api) ||
    globalThis.browser ||
    globalThis.chrome;

  const $ = (id) => document.getElementById(id);

  async function sendToActiveTab(message) {
    try {
      const tabs = await ext.tabs.query({ active: true, currentWindow: true });
      const tab = tabs && tabs[0];
      if (!tab || tab.id == null) return null;
      return await ext.tabs.sendMessage(tab.id, message);
    } catch {
      return null;
    }
  }

  function renderPortOptions(ports, selectedIndex) {
    const sel = $("port");
    sel.textContent = "";
    if (!ports || !ports.length) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "No granted ports yet";
      sel.appendChild(opt);
      return;
    }
    for (const p of ports) {
      const opt = document.createElement("option");
      opt.value = String(p.index);
      opt.textContent = p.label;
      sel.appendChild(opt);
    }
    if (selectedIndex != null) sel.value = String(selectedIndex);
  }

  async function loadPorts(selectedIndex) {
    const res = await sendToActiveTab({ type: "CMD_LIST_PORTS" });
    renderPortOptions(res && res.ports, selectedIndex);
    return res && res.ports;
  }

  async function render() {
    const statusEl = $("status");
    const live = await sendToActiveTab({ type: "STATUS_REQUEST" });
    let connected = live && live.connected;
    let baud = (live && live.baudRate) || $("baud").value;

    if (!live) {
      try {
        const { f2sStatus } = await ext.storage.local.get({ f2sStatus: null });
        if (f2sStatus) {
          connected = f2sStatus.connected;
          baud = f2sStatus.baudRate || baud;
        }
      } catch {
        /* ignore */
      }
    }

    statusEl.textContent = connected
      ? "● Connected (" + baud + " baud)"
      : "○ Not connected" + (live && live.error ? " — " + live.error : "");
    statusEl.dataset.connected = String(!!connected);
    $("baud").value = String(baud);

    try {
      const { f2sAutoConnect = true } = await ext.storage.local.get({
        f2sAutoConnect: true,
      });
      $("autoconnect").checked = !!f2sAutoConnect;
    } catch {
      /* ignore */
    }

    const list = $("log");
    list.textContent = "";
    try {
      const { f2sLog = [] } = await ext.storage.local.get({ f2sLog: [] });
      for (const entry of f2sLog.slice(-8).reverse()) {
        const li = document.createElement("li");
        const arrow = entry.dir === "rx" ? "←" : "→";
        li.textContent = arrow + " " + entry.text;
        list.appendChild(li);
      }
      if (!f2sLog.length) {
        const li = document.createElement("li");
        li.textContent = "No events yet.";
        list.appendChild(li);
      }
    } catch {
      /* ignore */
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    render();
    loadPorts();
    $("connect").addEventListener("click", async () => {
      $("status").textContent = "Requesting port…";
      $("porthint").textContent = "";
      const portIndex =
        $("port").value === "" ? null : parseInt($("port").value, 10);
      const res = await sendToActiveTab({
        type: "CMD_CONNECT",
        baudRate: parseInt($("baud").value, 10),
        portIndex,
      });
      if (res && !res.ok && res.error) {
        $("status").textContent = "○ Not connected — " + res.error;
        if (/user activation|user gesture/i.test(res.error)) {
          $("porthint").textContent =
            "The browser needs a real click inside the Figma page " +
            "(the ○ F2S badge is flashing there): click it and pick " +
            "your Arduino in the browser picker. Afterwards the port " +
            "stays in the dropdown above.";
        }
      } else {
        setTimeout(render, 500);
      }
    });
    $("disconnect").addEventListener("click", async () => {
      await sendToActiveTab({ type: "CMD_DISCONNECT" });
      setTimeout(render, 300);
    });
    $("refresh").addEventListener("click", async () => {
      $("porthint").textContent = "";
      await loadPorts();
    });
    $("newport").addEventListener("click", async () => {
      $("porthint").textContent = "Waiting for the browser picker…";
      const res = await sendToActiveTab({ type: "CMD_PICK_PORT" });
      if (res && res.ok) {
        $("porthint").textContent = "";
        await loadPorts(res.index);
      } else {
        $("porthint").textContent =
          "The browser blocked the picker from the popup (" +
          ((res && res.error) || "no user gesture") +
          "). Click the ○ F2S badge inside the Figma page instead: " +
          "that click counts as a gesture and the picker will appear.";
      }
    });
    $("autoconnect").addEventListener("change", (e) => {
      try {
        ext.storage.local.set({ f2sAutoConnect: e.target.checked });
      } catch {
        /* ignore */
      }
    });
  });
})();
