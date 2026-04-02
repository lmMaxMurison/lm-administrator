// lm-content.js
// Runs on: https://*.logicmonitor.com/santaba/*

(() => {
  let csrfToken = null;
  let csrfLastFetched = 0;
  const CSRF_TTL_MS = 5 * 60 * 1000; // 5 minutes, tweak as needed
  let csrfRefreshInProgress = null;

  function log(...args) {
    console.log("[LM Portal Bridge]", ...args);
  }

  async function fetchCsrfToken() {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.timeout = 5000;
      xhr.open("GET", "/santaba/rest/functions/dummy", true);
      xhr.setRequestHeader("X-CSRF-Token", "Fetch");
      xhr.setRequestHeader("X-version", "3");

      xhr.onreadystatechange = function () {
        if (xhr.readyState === 4) {
          if (xhr.status === 200) {
            const token = xhr.getResponseHeader("X-CSRF-Token");
            if (token) {
              resolve(token);
            } else {
              reject(new Error("No X-CSRF-Token header in response"));
            }
          } else {
            reject(new Error("Failed CSRF dummy request: " + xhr.status));
          }
        }
      };

      xhr.onerror = () => reject(new Error("XHR error during CSRF fetch"));
      xhr.ontimeout = () => reject(new Error("XHR timeout during CSRF fetch"));

      xhr.send();
    });
  }

  async function ensureCsrfToken() {
    const now = Date.now();
    if (csrfToken && now - csrfLastFetched < CSRF_TTL_MS) {
      return csrfToken;
    }

    if (csrfRefreshInProgress) {
      return csrfRefreshInProgress;
    }

    csrfRefreshInProgress = (async () => {
      try {
        const token = await fetchCsrfToken();
        csrfToken = token;
        csrfLastFetched = Date.now();
        log("CSRF token updated");
        return csrfToken;
      } finally {
        csrfRefreshInProgress = null;
      }
    })();

    return csrfRefreshInProgress;
  }

  async function handleLmApiRequest(request) {
    const { path, method = "GET", headers = {}, body } = request || {};

    if (!path) {
      throw new Error("Missing path in LM API request");
    }

    const csrf = await ensureCsrfToken();

    const finalHeaders = {
      "X-version": "3",
      ...headers,
      "X-CSRF-Token": csrf,
    };

    let payload = body;
    const upperMethod = (method || "GET").toUpperCase();

    if (payload && typeof payload === "object" && !finalHeaders["Content-Type"]) {
      finalHeaders["Content-Type"] = "application/json";
      payload = JSON.stringify(payload);
    }

    // ✅ FIXED NORMALIZATION:
    // - Accept:
    //   - "/rest/xxx"          → "/santaba/rest/xxx"
    //   - "/santaba/rest/xxx" → unchanged
    //   - "/device/devices"   → "/santaba/rest/device/devices"  (if you want that behavior)
    let normalizedPath = path;

    if (!normalizedPath.startsWith("/")) {
      normalizedPath = "/" + normalizedPath;
    }

    if (normalizedPath.startsWith("/santaba/rest")) {
      // already fully qualified, do nothing
    } else if (normalizedPath.startsWith("/rest")) {
      // prepend /santaba
      normalizedPath = "/santaba" + normalizedPath;
    } else if (!normalizedPath.startsWith("/santaba")) {
      // treat as v3 path relative to /santaba/rest
      normalizedPath = "/santaba/rest" + normalizedPath;
    }

    const url = window.location.origin + normalizedPath;

    const resp = await fetch(url, {
      method: upperMethod,
      headers: finalHeaders,
      credentials: "include",
      body: upperMethod === "GET" || upperMethod === "HEAD" ? undefined : payload,
    });

    const contentType = resp.headers.get("content-type") || "";
    const isJson = contentType.includes("application/json");
    let respBody = null;

    try {
      respBody = isJson ? await resp.json() : await resp.text();
    } catch (e) {
      // ignore parse errors
    }

    return {
      ok: resp.ok,
      status: resp.status,
      statusText: resp.statusText,
      isJson,
      headers: { "content-type": contentType },
      body: respBody,
    };
  }

  // Listen for requests from background
  chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
    if (!req || req.type !== "LM_PORTAL_API") return;

    (async () => {
      try {
        const response = await handleLmApiRequest(req.request);
        sendResponse(response);
      } catch (e) {
        console.error("[LM Portal Bridge] LM API error", e);
        sendResponse({ ok: false, error: String(e) });
      }
    })();

    return true; // async
  });

  log("LM portal bridge content script loaded");
})();
