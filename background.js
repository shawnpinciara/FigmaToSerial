/* FigProxyWEB — background context.
 *
 * Chrome MV3: runs as a service worker  ("background.service_worker").
 * Firefox MV3: runs as a background page   ("background.scripts").
 * Keep this file free of DOM APIs so it works in both.
 *
 * Role: observe Figma "exit" navigations (NON-blocking) and forward the
 * payload to the tab's content script, which owns the serial connection.
 * Actually cancelling/redirecting the navigation is done by
 * declarativeNetRequest (rules/figma-exit.json) — no `webRequestBlocking`,
 * no third-party redirects, no local HTTP server.
 */
try {
  if (typeof importScripts === "function") importScripts("lib/browser-api.js");
} catch (_) {
  /* Firefox loads the shim via manifest instead */
}

(function () {
  "use strict";

  const shim = globalThis.f2sExt || {};
  const ext = shim.api || globalThis.browser || globalThis.chrome;

  function safeDecode(s) {
    try {
      return decodeURIComponent(s);
    } catch {
      return s;
    }
  }

  /** Extract the payload text from a Figma exit URL.
   * Figma wraps prototype link actions as:
   *   https://www.figma.com/exit?url=<url-encoded target>
   * Legacy behaviour: the last path segment of the target is the payload.
   * New protocol (sliders & co, see README): targets starting with "F2S:"
   * pass through untouched, e.g. "F2S:SLIDER:volume:512".
   */
  function extractF2SPayload(exitUrl) {
    try {
      const raw = new URL(exitUrl).searchParams.get("url") || exitUrl;
      const decoded = safeDecode(raw);
      if (/^F2S:/i.test(decoded)) return decoded;
      return decoded.split("/").pop().split("?")[0] || decoded;
    } catch {
      return exitUrl;
    }
  }

  async function appendLog(direction, text) {
    try {
      const { f2sLog = [] } = await ext.storage.local.get({ f2sLog: [] });
      f2sLog.push({ t: Date.now(), dir: direction, text: String(text).slice(0, 200) });
      await ext.storage.local.set({ f2sLog: f2sLog.slice(-30) });
    } catch {
      /* storage unavailable (e.g. shutting down) */
    }
  }

  // Non-blocking observer (MV3-compliant): capture the payload and hand it
  // to the content script. No "blocking" extraInfoSpec anywhere.
  if (ext.webRequest && ext.webRequest.onBeforeRequest) {
    ext.webRequest.onBeforeRequest.addListener(
      (details) => {
        if (details.tabId == null || details.tabId < 0) return;
        const payload = extractF2SPayload(details.url);
        appendLog("tx", payload);
        if (shim.sendMessageToTab) {
          shim.sendMessageToTab(details.tabId, { type: "F2S_EVENT", data: payload });
        } else if (ext.tabs) {
          try {
            const res = ext.tabs.sendMessage(details.tabId, {
              type: "F2S_EVENT",
              data: payload,
            });
            if (res && typeof res.catch === "function") res.catch(() => {});
          } catch {
            /* tab gone */
          }
        }
      },
      { urls: ["*://*.figma.com/exit*"] }
    );
  }

  // Central event log for the popup (content script forwards Arduino lines).
  ext.runtime.onMessage.addListener((msg) => {
    if (msg && msg.type === "F2S_RX" && typeof msg.data === "string") {
      appendLog("rx", msg.data);
    }
  });
})();
