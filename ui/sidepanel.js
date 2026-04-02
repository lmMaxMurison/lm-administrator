async function lmBridge(action, payload = {}) {
    return chrome.runtime.sendMessage({
        type: "LM_BRIDGE",
        action,
        ...payload
    });
}

async function listPortals() {
    const resp = await lmBridge("listPortals");
    if (!resp?.ok) throw new Error(resp?.error || "listPortals failed");
    return resp.portals || [];
}

async function lmApiRequest(tabId, request) {
    const resp = await lmBridge("lmApiRequest", { tabId, request });
    return resp; // {ok,status,body,...} from lm-content.js
}

// Example: load portals and hit an endpoint
(async () => {
    const portals = await listPortals();
    console.log("Portals:", portals);

    if (portals[0]?.tabId) {
        const r = await lmApiRequest(portals[0].tabId, {
            path: "/device/devices",
            method: "GET"
        });
        console.log("API response:", r);
    }
})();