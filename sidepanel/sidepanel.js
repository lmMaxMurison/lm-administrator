import {
  listPortals,
  getDevices,
  updateDeviceProperties,
} from "../api/lm-api.js";

import {
  collectCustomPropertyNames,
  flattenDevicesToPropertyRows,
  rowToCustomProperties,
  normalizeImportedRows,
  collectPropertyNamesFromRows,
} from "../utils/lm-device-utils.js";

const state = {
  portals: [],
  selectedTabId: "",
  devices: [],
  rows: [],
  originalRows: [],
  propertyNames: [],
  filterText: "",
};

const els = {
  portalSelect: document.querySelector("#portalSelect"),
  groupFilterInput: document.querySelector("#groupFilterInput"),
  pageSizeInput: document.querySelector("#pageSizeInput"),
  refreshPortalsBtn: document.querySelector("#refreshPortalsBtn"),
  loadDevicesBtn: document.querySelector("#loadDevicesBtn"),
  resetBtn: document.querySelector("#resetBtn"),
  csvInput: document.querySelector("#csvInput"),
  addColumnBtn: document.querySelector("#addColumnBtn"),
  exportCsvBtn: document.querySelector("#exportCsvBtn"),
  saveBtn: document.querySelector("#saveBtn"),
  searchInput: document.querySelector("#searchInput"),
  summaryText: document.querySelector("#summaryText"),
  statusText: document.querySelector("#statusText"),
  output: document.querySelector("#output"),
  tableHead: document.querySelector("#editorTable thead"),
  tableBody: document.querySelector("#editorTable tbody"),
};

function cloneRows(rows = []) {
  return rows.map((row) => ({ ...row }));
}

function setOutput(value) {
  els.output.textContent =
    typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

function setStatus(message, variant = "") {
  els.statusText.textContent = message;
  els.statusText.className = `status${variant ? ` ${variant}` : ""}`;
}

function getSelectedTabId() {
  return Number(els.portalSelect.value || state.selectedTabId || 0);
}

function getVisibleRows() {
  const query = state.filterText.trim().toLowerCase();
  if (!query) return state.rows;

  return state.rows.filter((row) =>
    Object.values(row).some((value) =>
      String(value ?? "").toLowerCase().includes(query)
    )
  );
}

function getColumns() {
  return ["id", "ip_dns_name", "display_name", ...state.propertyNames];
}

function getOriginalRowMap() {
  return new Map(state.originalRows.map((row) => [String(row.id), row]));
}

function rowsEqualForSave(a, b) {
  if (!a || !b) return false;

  if (
    String(a.id ?? "") !== String(b.id ?? "") ||
    String(a.ip_dns_name ?? "") !== String(b.ip_dns_name ?? "") ||
    String(a.display_name ?? "") !== String(b.display_name ?? "")
  ) {
    return false;
  }

  const aProps = normalizePropertyArray(rowToCustomProperties(a));
  const bProps = normalizePropertyArray(rowToCustomProperties(b));

  if (aProps.length !== bProps.length) return false;

  for (let i = 0; i < aProps.length; i += 1) {
    if (aProps[i].name !== bProps[i].name || aProps[i].value !== bProps[i].value) {
      return false;
    }
  }

  return true;
}

function normalizePropertyArray(properties = []) {
  return [...properties]
    .map((prop) => ({
      name: String(prop.name ?? ""),
      value: String(prop.value ?? ""),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function countDirtyRows() {
  const originalMap = getOriginalRowMap();

  return state.rows.filter((row) => {
    if (!row?.id) return false;
    const original = originalMap.get(String(row.id));
    return original && !rowsEqualForSave(row, original);
  }).length;
}

function updateSummary() {
  const dirtyCount = countDirtyRows();
  const unmatchedCount = state.rows.filter((row) => row.__unmatched).length;

  els.summaryText.textContent =
    `${state.rows.length} rows · ${state.propertyNames.length} property columns · ` +
    `${dirtyCount} changed rows` +
    (unmatchedCount ? ` · ${unmatchedCount} unmatched import rows` : "");
}

function renderPortalOptions() {
  const current = state.selectedTabId || state.portals[0]?.tabId || "";

  els.portalSelect.innerHTML = "";

  if (!state.portals.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No LM portal tabs found";
    els.portalSelect.appendChild(option);
    state.selectedTabId = "";
    return;
  }

  for (const portal of state.portals) {
    const option = document.createElement("option");
    option.value = String(portal.tabId);
    option.textContent = portal.title || portal.domain || `Tab ${portal.tabId}`;
    if (String(portal.tabId) === String(current)) option.selected = true;
    els.portalSelect.appendChild(option);
  }

  state.selectedTabId = Number(els.portalSelect.value);
}

function renderTable() {
  const columns = getColumns();
  const visibleRows = getVisibleRows();
  const originalMap = getOriginalRowMap();

  els.tableHead.innerHTML = "";
  els.tableBody.innerHTML = "";

  const headRow = document.createElement("tr");
  for (const column of columns) {
    const th = document.createElement("th");
    th.textContent = column;
    headRow.appendChild(th);
  }
  els.tableHead.appendChild(headRow);

  for (const row of visibleRows) {
    const tr = document.createElement("tr");

    const originalRow = row.id ? originalMap.get(String(row.id)) : null;
    if (row.__unmatched) tr.classList.add("unmatched-row");
    if (originalRow && !rowsEqualForSave(row, originalRow)) tr.classList.add("dirty-row");

    for (const column of columns) {
      const td = document.createElement("td");
      const input = document.createElement("input");
      const isReadonly =
        column === "id" || column === "ip_dns_name" || column === "display_name";

      input.className = `cell-input${isReadonly ? " readonly" : ""}`;
      input.value = row[column] ?? "";
      input.dataset.rowId = String(row.id ?? "");
      input.dataset.column = column;
      input.readOnly = isReadonly;

      if (isReadonly) {
        td.classList.add("readonly-cell");
      } else {
        input.addEventListener("input", (event) => {
          row[column] = event.target.value;
          updateSummary();
          renderTable();
        });
      }

      td.appendChild(input);
      tr.appendChild(td);
    }

    els.tableBody.appendChild(tr);
  }

  updateSummary();
}

async function refreshPortals() {
  setStatus("Refreshing portals...");
  state.portals = await listPortals();
  renderPortalOptions();
  setStatus("Portals loaded.", "success");
}

async function loadDevices() {
  const tabId = getSelectedTabId();
  const groupId = els.groupFilterInput.value.trim();
  const size = Number(els.pageSizeInput.value || 200);

  if (!tabId) {
    throw new Error("Select a LogicMonitor portal tab first.");
  }

  setStatus("Loading devices...");
  setOutput("Loading devices from portal...");

  const result = await getDevices({
    tabId,
    autoPaginate: true,
    size,
    ...(groupId ? { groupId } : {}),
  });

  state.devices = result.items || [];
  state.propertyNames = collectCustomPropertyNames(state.devices);
  state.rows = flattenDevicesToPropertyRows(state.devices, state.propertyNames);
  state.originalRows = cloneRows(state.rows);

  renderTable();
  setOutput({
    loadedDevices: state.devices.length,
    total: result.total,
    propertyColumns: state.propertyNames.length,
  });
  setStatus("Devices loaded.", "success");
}

function resetEdits() {
  state.rows = cloneRows(state.originalRows);
  renderTable();
  setStatus("Edits reset.", "success");
  setOutput("Reverted rows to the last loaded device state.");
}

function addColumn() {
  const name = window.prompt("New custom property name");
  if (!name) return;

  const trimmed = name.trim();
  if (!trimmed) return;

  if (!state.propertyNames.includes(trimmed)) {
    state.propertyNames.push(trimmed);
    state.propertyNames.sort((a, b) => a.localeCompare(b));

    for (const row of state.rows) {
      if (!(trimmed in row)) row[trimmed] = "";
    }
    for (const row of state.originalRows) {
      if (!(trimmed in row)) row[trimmed] = "";
    }
  }

  renderTable();
  setStatus(`Added column "${trimmed}".`, "success");
}

function parseCsv(text) {
  const rows = [];
  let current = "";
  let row = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(current);
      current = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(current);
      if (row.some((cell) => cell !== "")) rows.push(row);
      row = [];
      current = "";
      continue;
    }

    current += char;
  }

  row.push(current);
  if (row.some((cell) => cell !== "")) rows.push(row);

  if (!rows.length) return [];

  const headers = rows[0].map((header) => header.trim());
  return rows.slice(1).map((cells) => {
    const obj = {};
    headers.forEach((header, index) => {
      obj[header] = cells[index] ?? "";
    });
    return obj;
  });
}

async function importCsv(file) {
  if (!file) return;

  const text = await file.text();
  const importedRows = normalizeImportedRows(parseCsv(text));

  if (!importedRows.length) {
    throw new Error("No CSV rows found.");
  }

  const mergedRows = cloneRows(state.rows);
  const byId = new Map(mergedRows.map((row) => [String(row.id), row]));
  const byDisplayName = new Map(
    mergedRows.map((row) => [String(row.display_name || ""), row])
  );

  const unmatched = [];

  for (const importedRow of importedRows) {
    const match =
      (importedRow.id && byId.get(String(importedRow.id))) ||
      (importedRow.display_name &&
        byDisplayName.get(String(importedRow.display_name)));

    if (match) {
      for (const [key, value] of Object.entries(importedRow)) {
        if (key.startsWith("__")) continue;
        match[key] = value ?? "";
      }
    } else {
      unmatched.push({
        ...importedRow,
        __unmatched: true,
      });
    }
  }

  const importedPropertyNames = collectPropertyNamesFromRows(importedRows);
  const nextPropertyNames = Array.from(
    new Set([...state.propertyNames, ...importedPropertyNames])
  ).sort((a, b) => a.localeCompare(b));

  for (const row of mergedRows) {
    for (const propertyName of nextPropertyNames) {
      if (!(propertyName in row)) row[propertyName] = "";
    }
  }

  for (const row of unmatched) {
    for (const propertyName of nextPropertyNames) {
      if (!(propertyName in row)) row[propertyName] = "";
    }
    row.id = row.id ?? "";
    row.ip_dns_name = row.ip_dns_name ?? "";
    row.display_name = row.display_name ?? "";
  }

  state.propertyNames = nextPropertyNames;
  state.rows = [...mergedRows, ...unmatched];

  renderTable();
  setStatus("CSV imported for review.", "success");
  setOutput({
    importedRows: importedRows.length,
    unmatchedRows: unmatched.length,
  });

  els.csvInput.value = "";
}

function escapeCsvValue(value) {
  const text = String(value ?? "");
  if (text.includes(",") || text.includes('"') || text.includes("\n")) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function exportCsv() {
  const columns = getColumns();
  const lines = [
    columns.join(","),
    ...state.rows.map((row) =>
      columns.map((column) => escapeCsvValue(row[column] ?? "")).join(",")
    ),
  ];

  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "lm-bulk-property-editor.csv";
  a.click();

  URL.revokeObjectURL(url);
  setStatus("CSV exported.", "success");
}

async function saveChanges() {
  const tabId = getSelectedTabId();
  if (!tabId) {
    throw new Error("Select a LogicMonitor portal tab first.");
  }

  const originalMap = getOriginalRowMap();
  const changedRows = state.rows.filter((row) => {
    if (!row?.id || row.__unmatched) return false;
    const original = originalMap.get(String(row.id));
    return original && !rowsEqualForSave(row, original);
  });

  if (!changedRows.length) {
    setStatus("No changes to save.", "success");
    setOutput("Nothing to update.");
    return;
  }

  setStatus(`Saving ${changedRows.length} changed rows...`);
  setOutput({ savingRows: changedRows.length });

  const results = [];

  for (const row of changedRows) {
    try {
      const desiredProperties = rowToCustomProperties(row);

      await updateDeviceProperties(row.id, desiredProperties, { tabId });

      results.push({
        id: row.id,
        display_name: row.display_name,
        ok: true,
      });
    } catch (error) {
      results.push({
        id: row.id,
        display_name: row.display_name,
        ok: false,
        error: String(error?.message || error),
      });
    }
  }

  const failed = results.filter((result) => !result.ok);

  if (failed.length) {
    setStatus(
      `Saved with errors. ${results.length - failed.length} succeeded, ${failed.length} failed.`,
      "error"
    );
  } else {
    setStatus(`Saved ${results.length} rows.`, "success");
  }

  setOutput(results);

  if (!failed.length) {
    state.originalRows = cloneRows(
      state.rows.filter((row) => !row.__unmatched)
    );
  } else {
    const successfulIds = new Set(
      results.filter((result) => result.ok).map((result) => String(result.id))
    );

    state.originalRows = cloneRows(
      state.rows
        .filter((row) => !row.__unmatched)
        .map((row) => (successfulIds.has(String(row.id)) ? { ...row } : row))
    );
  }

  renderTable();
}

function bindEvents() {
  els.portalSelect.addEventListener("change", () => {
    state.selectedTabId = Number(els.portalSelect.value || 0);
  });

  els.refreshPortalsBtn.addEventListener("click", async () => {
    try {
      await refreshPortals();
    } catch (error) {
      setStatus("Failed to refresh portals.", "error");
      setOutput(String(error?.message || error));
    }
  });

  els.loadDevicesBtn.addEventListener("click", async () => {
    try {
      await loadDevices();
    } catch (error) {
      setStatus("Failed to load devices.", "error");
      setOutput(String(error?.message || error));
    }
  });

  els.resetBtn.addEventListener("click", () => {
    resetEdits();
  });

  els.addColumnBtn.addEventListener("click", () => {
    addColumn();
  });

  els.exportCsvBtn.addEventListener("click", () => {
    exportCsv();
  });

  els.saveBtn.addEventListener("click", async () => {
    try {
      await saveChanges();
    } catch (error) {
      setStatus("Save failed.", "error");
      setOutput(String(error?.message || error));
    }
  });

  els.csvInput.addEventListener("change", async (event) => {
    try {
      const file = event.target.files?.[0];
      await importCsv(file);
    } catch (error) {
      setStatus("CSV import failed.", "error");
      setOutput(String(error?.message || error));
    }
  });

  els.searchInput.addEventListener("input", (event) => {
    state.filterText = event.target.value || "";
    renderTable();
  });
}

async function init() {
  bindEvents();

  try {
    await refreshPortals();
    setOutput("Ready.");
  } catch (error) {
    setStatus("Startup failed.", "error");
    setOutput(String(error?.message || error));
  }
}

init();