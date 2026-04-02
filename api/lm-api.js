export function collectCustomPropertyNames(devices = []) {
  const names = new Set();

  for (const device of devices) {
    for (const prop of device?.customProperties || []) {
      if (prop?.name) names.add(prop.name);
    }
  }

  return Array.from(names).sort((a, b) => a.localeCompare(b));
}

export function flattenDeviceToPropertyRow(device, propertyNames = []) {
  const row = {
    id: device?.id ?? "",
    ip_dns_name: device?.name ?? "",
    display_name: device?.displayName ?? device?.display_name ?? "",
  };

  const props = Object.fromEntries(
    (device?.customProperties || []).map((prop) => [prop.name, prop.value ?? ""])
  );

  for (const propertyName of propertyNames) {
    row[propertyName] = props[propertyName] ?? "";
  }

  return row;
}

export function flattenDevicesToPropertyRows(devices = [], propertyNames = undefined) {
  const resolvedPropertyNames = propertyNames || collectCustomPropertyNames(devices);
  return devices.map((device) => flattenDeviceToPropertyRow(device, resolvedPropertyNames));
}

export function rowToCustomProperties(row, options = {}) {
  const excludedFields = new Set([
    "id",
    "ip_dns_name",
    "display_name",
    ...(options.excludedFields || []),
  ]);

  return Object.keys(row || {})
    .filter((key) => !excludedFields.has(key) && !key.startsWith("__"))
    .map((key) => ({
      name: key,
      value: row[key] ?? "",
    }));
}

export function diffCustomProperties(currentProperties = [], desiredProperties = [], options = {}) {
  const includeRemoved = options.includeRemoved !== false;

  const currentMap = new Map(
    (currentProperties || []).map((prop) => [prop.name, prop.value ?? ""])
  );
  const desiredMap = new Map(
    (desiredProperties || []).map((prop) => [prop.name, prop.value ?? ""])
  );

  const changed = [];

  for (const [name, value] of desiredMap.entries()) {
    if (!currentMap.has(name) || currentMap.get(name) !== value) {
      changed.push({ name, value });
    }
  }

  if (includeRemoved) {
    for (const [name] of currentMap.entries()) {
      if (!desiredMap.has(name)) {
        changed.push({ name, value: "" });
      }
    }
  }

  return changed;
}

export function indexDevicesById(devices = []) {
  return new Map((devices || []).map((device) => [String(device.id), device]));
}

export function buildBulkPropertyColumns(propertyNames = [], options = {}) {
  const fixedColumns = options.fixedColumns || [
    {
      title: "id",
      field: "id",
      editable: false,
      frozen: true,
      cssClass: "readonly-column",
    },
    {
      title: "ip_dns_name",
      field: "ip_dns_name",
      editable: false,
      frozen: true,
      cssClass: "readonly-column",
    },
    {
      title: "display_name",
      field: "display_name",
      editable: false,
      frozen: true,
      cssClass: "readonly-column",
    },
  ];

  const propertyColumns = propertyNames.map((name) => ({
    title: name,
    field: name,
    editable: true,
  }));

  return [...fixedColumns, ...propertyColumns];
}

export function normalizeImportedRows(rows = []) {
  return (rows || []).map((row) => {
    const normalized = {};

    for (const [key, value] of Object.entries(row || {})) {
      if (typeof value === "string") {
        const trimmed = value.trim();
        const lower = trimmed.toLowerCase();

        if (lower === "true" || lower === "false") {
          normalized[key] = lower;
        } else {
          normalized[key] = value;
        }
      } else {
        normalized[key] = value ?? "";
      }
    }

    return normalized;
  });
}

export function collectPropertyNamesFromRows(rows = [], options = {}) {
  const excludedFields = new Set([
    "id",
    "ip_dns_name",
    "display_name",
    ...(options.excludedFields || []),
  ]);

  const names = new Set();

  for (const row of rows || []) {
    for (const key of Object.keys(row || {})) {
      if (!excludedFields.has(key) && !key.startsWith("__")) {
        names.add(key);
      }
    }
  }

  return Array.from(names).sort((a, b) => a.localeCompare(b));
}
