// host-content.js
// Runs on: https://*.logicmonitor.com/santaba/* (all frames)

(() => {
  const allowedOrigins = [window.location.origin];

  function log(...args) {
    console.log("[LM Host Bridge]", ...args);
  }

  function injectBridge() {
    const script = document.createElement("script");
    script.src = chrome.runtime.getURL("bridge.js");
    script.type = "text/javascript";
    (document.head || document.documentElement).appendChild(script);
    script.onload = () => {
      script.remove();
      log("bridge.js injected into", window.location.href);
    };
  }

  injectBridge();

  // Relay messages between page (bridge.js / widget) and background
  window.addEventListener("message", (ev) => {
    const data = ev.data;
    if (!data || data.type !== "LMBridge") return;
    if (!allowedOrigins.includes(ev.origin)) return;

    const { action } = data;

    if (action === "listPortals") {
      chrome.runtime.sendMessage(
        {
          type: "LM_BRIDGE",
          action: "listPortals"
        },
        (resp) => {
          window.postMessage(
            {
              type: "LMBridgeResponse",
              action: "listPortals",
              response: resp
            },
            ev.origin
          );
        }
      );
      return;
    }

    if (action === "lmApiRequest") {
      const { tabId, request } = data;
      chrome.runtime.sendMessage(
        {
          type: "LM_BRIDGE",
          action: "lmApiRequest",
          tabId,
          request
        },
        (resp) => {
          window.postMessage(
            {
              type: "LMBridgeResponse",
              action: "lmApiRequest",
              response: resp
            },
            ev.origin
          );
        }
      );
      return;
    }
  });
})();
