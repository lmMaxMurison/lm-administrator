// background.js

// Discover LM portals: tabs with LM URLs
async function listPortals() {
  const tabs = await chrome.tabs.query({
    url: "https://*.logicmonitor.com/santaba*",
  });

  return tabs.map((tab) => {
    let domain = null;
    try {
      if (tab.url) domain = new URL(tab.url).hostname;
    } catch (e) {}

    return {
      tabId: tab.id,
      domain,
      title: tab.title || tab.url || domain,
    };
  });
}

// Forward a request to a specific LM tab
function forwardLmRequestToTab(tabId, request) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, { type: "LM_PORTAL_API", request }, (resp) => {
      if (chrome.runtime.lastError) {
        console.warn(
            "[LM Bridge] Error sending message to LM tab:",
            chrome.runtime.lastError.message
        );
        resolve({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }
      resolve(resp);
    });
  });
}

chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
  (async () => {
    if (!req || req.type !== "LM_BRIDGE") return;

    const { action } = req;

    if (action === "listPortals") {
      try {
        const portals = await listPortals();
        sendResponse({ ok: true, portals });
      } catch (e) {
        console.error("[LM Bridge] listPortals error", e);
        sendResponse({ ok: false, error: String(e) });
      }
      return;
    }

    // OPTION A: infer tabId from sender.tab.id when not provided
    if (action === "lmApiRequest") {
      try {
        const { request } = req;

        // Use explicitly provided tabId OR fall back to the sender tab
        const effectiveTabId = req.tabId ?? sender?.tab?.id;

        if (!effectiveTabId) {
          sendResponse({
            ok: false,
            error: "No tabId provided and sender.tab is unavailable for lmApiRequest",
          });
          return;
        }

        const resp = await forwardLmRequestToTab(effectiveTabId, request);
        sendResponse(resp);
      } catch (e) {
        console.error("[LM Bridge] lmApiRequest error", e);
        sendResponse({ ok: false, error: String(e) });
      }
      return;
    }
  })();

  // async
  return true;
});