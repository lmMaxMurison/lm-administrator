// bridge.js
// Runs in MAIN world on your host site.
// Exposes window.LMPortalBridge

(() => {
  if (window.LMPortalBridge) return;

  function once(type, predicate) {
    return new Promise((resolve) => {
      function handler(ev) {
        const data = ev.data;
        if (data && data.type === type && (!predicate || predicate(data))) {
          window.removeEventListener("message", handler);
          resolve(data);
        }
      }
      window.addEventListener("message", handler);
    });
  }

  async function listPortals() {
    window.postMessage(
      {
        type: "LMBridge",
        action: "listPortals",
      },
      window.origin
    );

    const { response } = await once(
      "LMBridgeResponse",
      (d) => d.action === "listPortals"
    );
    return response;
  }

  async function apiRequest({ tabId, path, method = "GET", headers = {}, body }) {
    window.postMessage(
      {
        type: "LMBridge",
        action: "lmApiRequest",
        tabId,
        request: { path, method, headers, body },
      },
      window.origin
    );

    const { response } = await once(
      "LMBridgeResponse",
      (d) => d.action === "lmApiRequest"
    );
    return response;
  }

  window.LMPortalBridge = {
    listPortals,
    apiRequest,
  };

  console.log("[LMPortalBridge] Installed");
})();
