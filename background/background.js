// background.js

chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error("[LM Bridge] setPanelBehavior error", error));

async function enableSidePanelForTab(tabId) {
  if (!tabId) return;

  try {
    await chrome.sidePanel.setOptions({
      tabId,
      path: "sidepanel/sidepanel.html",
      enabled: true,
    });
  } catch (e) {
    console.error("[LM Bridge] enableSidePanelForTab error", e);
  }
}

chrome.tabs.onUpdated.addListener(async (tabId, info, tab) => {
  if (!tab.url) return;

  const isLm = /^https:\/\/[^/]+\.logicmonitor\.com\//i.test(tab.url);

  try {
    if (isLm) {
      await enableSidePanelForTab(tabId);
    } else {
      await chrome.sidePanel.setOptions({
        tabId,
        enabled: false,
      });
    }
  } catch (e) {
    console.error("[LM Bridge] tabs.onUpdated side panel error", e);
  }
});

async function openSidePanelForTab(tabId) {
  if (!tabId) {
    return { ok: false, error: "No tabId available for opening side panel" };
  }

  try {
    await chrome.sidePanel.setOptions({
      tabId,
      path: "sidepanel/sidepanel.html",
      enabled: true,
    });

    await chrome.sidePanel.open({ tabId });

    return { ok: true };
  } catch (e) {
    console.error("[LM Bridge] openSidePanel error", e);
    return { ok: false, error: String(e) };
  }
}

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
      if (req?.type === "LMDA_OPEN_PANEL") {
      try {
        const tabId = sender?.tab?.id;
        const resp = await openSidePanelForTab(tabId);
        sendResponse(resp);
      } catch (e) {
        console.error("[LM Bridge] LMDA_OPEN_PANEL error", e);
        sendResponse({ ok: false, error: String(e) });
      }
      return;
    }  
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