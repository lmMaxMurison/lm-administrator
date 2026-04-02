// overlay-content.js
(function () {
    if (window.__LMDA_OVERLAY__) return; // prevent duplicate injection
    window.__LMDA_OVERLAY__ = true;

    const root = document.createElement("div");
    root.id = "lmda-overlay";
    root.innerHTML = `
    <div class="lmda-card">
      <div class="lmda-title">LMDA Test</div>

      <div class="lmda-row">
        <button id="lmda-open-panel">Open Panel</button>
        <button id="lmda-test-api">Test API</button>
      </div>

      <pre id="lmda-output">Ready.</pre>
    </div>
  `;

    document.documentElement.appendChild(root);

    const output = root.querySelector("#lmda-output");

    function setOutput(obj) {
        if (typeof obj === "string") {
            output.textContent = obj;
        } else {
            output.textContent = JSON.stringify(obj, null, 2);
        }
    }

    // 🔹 Open Side Panel
    root.querySelector("#lmda-open-panel").addEventListener("click", async () => {
        setOutput(
            'Use the LMDA extension toolbar icon to open the side panel.'
        );
    });

    // 🔹 Test API call (NO tabId — background will infer it)
    root.querySelector("#lmda-test-api").addEventListener("click", async () => {
        setOutput("Calling API...");

        try {
            const resp = await chrome.runtime.sendMessage({
                type: "LM_BRIDGE",
                action: "lmApiRequest",
                request: {
                    path: "/device/devices",   // safe test endpoint
                    method: "GET"
                }
            });

            setOutput(resp);
        } catch (e) {
            setOutput({ ok: false, error: String(e) });
        }
    });
})();