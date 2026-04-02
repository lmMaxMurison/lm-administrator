// lm-api.js
//
// Thin SDK for talking to the LM portal through the extension bridge.
// Uses background.js -> lm-content.js to execute authenticated requests
// inside the active LogicMonitor tab.

async function lmBridge(action, payload = {}) {
  const resp = await chrome.runtime.sendMessage({
    type: "LM_BRIDGE",
    action,
    ...payload,
  });

  if (!resp) {
    throw new Error(`No response for LM bridge action "${action}"`);
  }

  return resp;
}

export async function listPortals() {
  const resp = await lmBridge("listPortals");

  if (!resp.ok) {
    throw new Error(resp.error || "listPortals failed");
  }

  return resp.portals || [];
}

export async function getDefaultPortal() {
  const portals = await listPortals();

  if (!portals.length) {
    throw new Error("No LogicMonitor portal tabs found");
  }

  return portals[0];
}

export async function lmApiRequest(request, options = {}) {
  const portal = options.portal || null;
  const tabId = options.tabId ?? portal?.tabId;

  const resp = await lmBridge("lmApiRequest", {
    tabId,
    request,
  });

  if (!resp) {
    throw new Error("No response from lmApiRequest");
  }

  return resp;
}

async function lmJsonRequest(request, options = {}) {
  const resp = await lmApiRequest(request, options);

  if (!resp.ok) {
    const errorMessage =
      resp?.body?.errmsg ||
      resp?.body?.errorMessage ||
      resp?.error ||
      `${resp.status || "Unknown"} ${resp.statusText || "request failed"}`;

    const error = new Error(errorMessage);
    error.response = resp;
    throw error;
  }

  return resp.body;
}

function buildQueryString(params = {}) {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;

    if (Array.isArray(value)) {
      for (const item of value) {
        if (item !== undefined && item !== null && item !== "") {
          searchParams.append(key, String(item));
        }
      }
      continue;
    }

    searchParams.append(key, String(value));
  }

  const query = searchParams.toString();
  return query ? `?${query}` : "";
}

function extractItems(body) {
  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.items)) return body.items;
  if (Array.isArray(body?.data?.items)) return body.data.items;
  if (Array.isArray(body?.data)) return body.data;
  return [];
}

function extractTotal(body, fallbackCount = 0) {
  return (
    body?.total ??
    body?.data?.total ??
    body?.pagination?.total ??
    fallbackCount
  );
}

export async function getDevices(options = {}) {
  const {
    tabId,
    portal,
    autoPaginate = true,
    size = 100,
    fields,
    sort,
    filter,
    groupId,
    extraParams = {},
  } = options;

  const baseParams = {
    size,
    ...(fields ? { fields } : {}),
    ...(sort ? { sort } : {}),
    ...(filter ? { filter } : {}),
    ...extraParams,
  };

  // Add group filter if provided.
  // Adjust this if your preferred LM filter syntax differs.
  if (groupId !== undefined && groupId !== null && groupId !== "") {
    const existingFilter = baseParams.filter ? `${baseParams.filter},` : "";
    baseParams.filter = `${existingFilter}systemProperties.name:"system.groups",systemProperties.value~"${groupId}"`;
  }

  if (!autoPaginate) {
    const query = buildQueryString({
      ...baseParams,
      offset: options.offset ?? 0,
    });

    const body = await lmJsonRequest(
      {
        path: `/device/devices${query}`,
        method: "GET",
      },
      { tabId, portal }
    );

    return {
      items: extractItems(body),
      total: extractTotal(body, extractItems(body).length),
      raw: body,
    };
  }

  let offset = options.offset ?? 0;
  const allItems = [];
  let total = null;

  while (true) {
    const query = buildQueryString({
      ...baseParams,
      offset,
    });

    const body = await lmJsonRequest(
      {
        path: `/device/devices${query}`,
        method: "GET",
      },
      { tabId, portal }
    );

    const items = extractItems(body);
    const pageTotal = extractTotal(body, items.length);

    if (total === null) total = pageTotal;
    allItems.push(...items);

    if (!items.length) break;
    if (items.length < size) break;
    if (allItems.length >= pageTotal) break;

    offset += size;
  }

  return {
    items: allItems,
    total: total ?? allItems.length,
  };
}

export async function getDevice(deviceId, options = {}) {
  if (deviceId === undefined || deviceId === null || deviceId === "") {
    throw new Error("getDevice requires a deviceId");
  }

  const body = await lmJsonRequest(
    {
      path: `/device/devices/${encodeURIComponent(deviceId)}`,
      method: "GET",
    },
    options
  );

  return body?.data ?? body;
}

export async function updateDevice(deviceId, patch, options = {}) {
  if (deviceId === undefined || deviceId === null || deviceId === "") {
    throw new Error("updateDevice requires a deviceId");
  }

  if (!patch || typeof patch !== "object") {
    throw new Error("updateDevice requires a patch object");
  }

  const body = await lmJsonRequest(
    {
      path: `/device/devices/${encodeURIComponent(deviceId)}`,
      method: "PATCH",
      body: patch,
    },
    options
  );

  return body?.data ?? body;
}

export async function updateDeviceProperties(deviceId, properties = [], options = {}) {
  if (deviceId === undefined || deviceId === null || deviceId === "") {
    throw new Error("updateDeviceProperties requires a deviceId");
  }

  if (!Array.isArray(properties)) {
    throw new Error("updateDeviceProperties requires properties to be an array");
  }

  return updateDevice(
    deviceId,
    {
      customProperties: properties,
    },
    options
  );
}

export async function testConnection(options = {}) {
  const result = await getDevices({
    ...options,
    autoPaginate: false,
    size: 1,
  });

  return {
    ok: true,
    count: result.items.length,
    total: result.total,
  };
}