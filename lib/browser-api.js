/* FigProxyWEB cross-browser shim (zero dependencies).
 *
 * Exposes a tiny unified surface on `globalThis.f2sExt` so the same code
 * runs on Chrome (`chrome.*`) and Firefox (`browser.*`).
 * Load this file BEFORE any other extension script (see manifest).
 *
 * Why not mozilla/webextension-polyfill? Chrome >= 121 supports promises
 * natively and our API surface is tiny (tabs, runtime, storage, a
 * non-blocking webRequest observer). This shim avoids a vendored dependency
 * while staying compatible with the polyfill if you add it later.
 */
(function () {
  "use strict";
  if (globalThis.f2sExt) return;

  const api = globalThis.browser || globalThis.chrome;
  const isFirefox =
    typeof globalThis.browser !== "undefined" &&
    !!globalThis.browser &&
    !!globalThis.browser.runtime;

  function consumeLastError() {
    try {
      return api && api.runtime && api.runtime.lastError;
    } catch {
      return undefined;
    }
  }

  // tabs.sendMessage that never throws unhandled rejections
  // (e.g. content script not listening on that tab yet).
  function sendMessageToTab(tabId, message) {
    if (tabId == null || tabId < 0 || !api || !api.tabs) return;
    try {
      const res = api.tabs.sendMessage(tabId, message);
      if (res && typeof res.catch === "function") {
        res.catch(() => consumeLastError());
      } else if (res === undefined && api.runtime && api.runtime.lastError !== undefined) {
        // Legacy callback-style Chrome: retry with a no-op callback.
        try {
          api.tabs.sendMessage(tabId, message, () => consumeLastError());
        } catch {
          /* ignore */
        }
      }
    } catch {
      /* tab gone or messaging unavailable */
    }
  }

  async function queryActiveTab() {
    const tabs = await api.tabs.query({ active: true, currentWindow: true });
    return tabs && tabs[0];
  }

  globalThis.f2sExt = { api, isFirefox, sendMessageToTab, queryActiveTab };
})();
