import { loadDataset } from "./db.js";

console.log("overview.js loaded ✅", location.href);

const PAGE_SIZE = 50;
const MIN_COL_WIDTH = 80;

const uiState = {
  datasetId: null,
  studies: [],
  decisions: {},      // row_id -> "keep"|"discard"
  sortKey: "accession_number",
  sortDir: "asc",
  page: 1,
  selected: new Set(),
  colWidths: {},      // colKey -> px width
  activeCellEl: null  // <td> currently “selected” via double click
};

function lastDatasetKey() {
  return "studyreview:lastDatasetId";
}
function decisionsKey(datasetId) {
  return `studyreview:decisions:${datasetId}`;
}

function loadDecisionsObj(datasetId) {
  try { return JSON.parse(localStorage.getItem(decisionsKey(datasetId)) || "{}"); }
  catch { return {}; }
}
function saveDecisionsObj(datasetId, obj) {
  localStorage.setItem(decisionsKey(datasetId), JSON.stringify(obj));
}

function display(v) {
  if (v === undefined || v === null || String(v).trim() === "") return "-";
  return String(v);
}

function isNumericColumn(key) {
  return ["parsed_patient_age", "study_count", "frames", "slices", "diffusion_bvalue", "slice_thickness"].includes(key);
}

function compare(a, b, key) {
  const av = a?.[key];
  const bv = b?.[key];

  if (isNumericColumn(key)) {
    const an = Number(av);
    const bn = Number(bv);
    const aOk = Number.isFinite(an);
    const bOk = Number.isFinite(bn);
    if (!aOk && !bOk) return 0;
    if (!aOk) return 1;
    if (!bOk) return -1;
    return an - bn;
  }

  return String(av ?? "").localeCompare(String(bv ?? ""), undefined, { sensitivity: "base" });
}

function sortedStudies() {
  const arr = [...uiState.studies];
  arr.sort((a, b) => {
    const c = compare(a, b, uiState.sortKey);
    return uiState.sortDir === "asc" ? c : -c;
  });
  return arr;
}

function currentPageRows(sorted) {
  const total = sorted.length;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  uiState.page = Math.min(uiState.page, pages);

  const start = (uiState.page - 1) * PAGE_SIZE;
  return { rows: sorted.slice(start, start + PAGE_SIZE), pages, total };
}

/**
 * Columns:
 * - report excluded (deid_english_report)
 */
function buildColumns() {
  const base = ["row_id", "accession_number", "patient_id"];
  const common = ["patient_sex", "parsed_patient_age", "modality", "body_part_examined", "study_date", "institution"];

  const exists = (k) => uiState.studies.some(r => r?.[k] !== undefined);

  const cols = [...base, ...common]
    .filter((k, i, a) => a.indexOf(k) === i)
    .filter(exists);

  return ["__select__", ...cols, "__decision__"];
}

function syncSelectAllCheckbox(pageRows) {
  const cb = document.getElementById("selectAllPage");
  if (!cb) return;

  const ids = pageRows.map(r => String(r.row_id ?? "").trim());
  cb.checked = ids.length > 0 && ids.every(id => uiState.selected.has(id));
}

function bulkSetDecision(value) {
  const ids = Array.from(uiState.selected);
  if (!ids.length) return;

  for (const id of ids) {
    if (!value) delete uiState.decisions[id];
    else uiState.decisions[id] = value;
  }
  saveDecisionsObj(uiState.datasetId, uiState.decisions);
  render();
}

function sortIconFor(colKey) {
  if (uiState.sortKey !== colKey) return "↕";
  return uiState.sortDir === "asc" ? "↑" : "↓";
}

/**
 * Select + copy full cell text on double click.
 * - Always selects text
 * - Attempts clipboard copy (may require https or user gesture permissions)
 */
async function selectAndCopyCellText(td) {
  const text = td.textContent || "";

  // Select
  const range = document.createRange();
  range.selectNodeContents(td);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);

  // Copy (best-effort)
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      document.execCommand?.("copy");
    }
  } catch {
    // ignore if clipboard blocked; selection still helps user copy manually
  }
}

/**
 * Maintain a persistent "cell selected" UI until next click.
 * - Clears previous active cell highlight
 * - Sets new cell highlight
 */
function setActiveCell(td) {
  if (uiState.activeCellEl && uiState.activeCellEl !== td) {
    uiState.activeCellEl.classList.remove("cellSelected");
  }
  uiState.activeCellEl = td;
  td.classList.add("cellSelected");
}

/**
 * Clear active cell highlight (called on any click elsewhere)
 */
function clearActiveCell() {
  if (uiState.activeCellEl) {
    uiState.activeCellEl.classList.remove("cellSelected");
    uiState.activeCellEl = null;
  }
}

/**
 * Column resizing via COLGROUP (robust + Excel-like)
 */
function attachResizer(th, colKey) {
  if (colKey === "__select__" || colKey === "__decision__") return;

  const handle = document.createElement("div");
  handle.className = "resizer";
  th.appendChild(handle);

  let startX = 0;
  let startWidth = 0;

  const onMouseMove = (e) => {
    const dx = e.clientX - startX;
    const next = Math.max(MIN_COL_WIDTH, startWidth + dx);
    uiState.colWidths[colKey] = next;
    applyColgroupWidths();
  };

  const onMouseUp = () => {
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);
    document.body.style.cursor = "";
  };

  handle.addEventListener("mousedown", (e) => {
    e.preventDefault();
    e.stopPropagation(); // avoid triggering sort
    startX = e.clientX;
    startWidth = th.getBoundingClientRect().width;
    document.body.style.cursor = "col-resize";
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  });
}

function applyColgroupWidths() {
  const columns = buildColumns();
  const colgroup = document.getElementById("colgroup");
  if (!colgroup) return;

  const cols = colgroup.querySelectorAll("col");
  cols.forEach((colEl, i) => {
    const key = columns[i];
    if (!key) return;

    if (key === "__select__") colEl.style.width = "44px";
    else if (key === "__decision__") colEl.style.width = "130px";
    else if (uiState.colWidths[key]) colEl.style.width = uiState.colWidths[key] + "px";
    else colEl.style.width = "180px"; // default width (spreadsheet feel)
  });
}

function render() {
  const sorted = sortedStudies();
  const { rows, pages, total } = currentPageRows(sorted);

  const pageInfo = document.getElementById("pageInfo");
  if (pageInfo) pageInfo.textContent = `Page ${uiState.page} / ${pages} • ${total} studies`;

  const columns = buildColumns();

  // Build COLGROUP with default widths (forces horizontal scroll instead of squeezing)
  const colgroup = document.getElementById("colgroup");
  colgroup.innerHTML = "";
  for (const key of columns) {
    const c = document.createElement("col");
    if (key === "__select__") c.style.width = "44px";
    else if (key === "__decision__") c.style.width = "130px";
    else c.style.width = (uiState.colWidths[key] || 180) + "px";
    colgroup.appendChild(c);
  }

  // THEAD
  const thead = document.getElementById("thead");
  thead.innerHTML = "";
  const trh = document.createElement("tr");

  for (const colKey of columns) {
    const th = document.createElement("th");

    if (colKey === "__select__") {
      th.className = "nowrap colSelect";
      th.textContent = "";
    } else if (colKey === "__decision__") {
      th.className = "colDecision";
      th.textContent = "Decision";
    } else {
      th.className = "sortable";
      if (uiState.sortKey === colKey) th.classList.add("sorted");

      const wrap = document.createElement("span");
      wrap.className = "thLabel";

      const name = document.createElement("span");
      name.textContent = colKey;

      const icon = document.createElement("span");
      icon.className = "sortIcon";
      icon.textContent = sortIconFor(colKey);

      wrap.appendChild(name);
      wrap.appendChild(icon);
      th.appendChild(wrap);

      th.title = "Click to sort";
      th.addEventListener("click", () => {
        if (uiState.sortKey === colKey) uiState.sortDir = uiState.sortDir === "asc" ? "desc" : "asc";
        else { uiState.sortKey = colKey; uiState.sortDir = "asc"; }
        render();
      });

      attachResizer(th, colKey);
    }

    trh.appendChild(th);
  }
  thead.appendChild(trh);

  // TBODY
  const tbody = document.getElementById("tbody");
  tbody.innerHTML = "";

  for (const row of rows) {
    const rowId = String(row.row_id ?? "").trim();
    const tr = document.createElement("tr");

    if (uiState.selected.has(rowId)) tr.classList.add("selectedRow");

    for (const colKey of columns) {
      const td = document.createElement("td");

      // Clicking any cell clears "active cell" highlight (Sheets-like),
      // except if it's the cell we just set as active.
      td.addEventListener("mousedown", () => {
        // if you click another cell, clear the previously active cell highlight
        if (uiState.activeCellEl && uiState.activeCellEl !== td) {
          clearActiveCell();
        }
      });

      // dblclick: select + copy full cell and keep highlight until next click
      td.addEventListener("dblclick", async () => {
        setActiveCell(td);
        await selectAndCopyCellText(td);
      });

      if (colKey === "__select__") {
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.className = "rowCheck";
        cb.checked = uiState.selected.has(rowId);

        cb.addEventListener("change", () => {
          if (cb.checked) uiState.selected.add(rowId);
          else uiState.selected.delete(rowId);

          if (uiState.selected.has(rowId)) tr.classList.add("selectedRow");
          else tr.classList.remove("selectedRow");

          syncSelectAllCheckbox(rows);
        });

        td.appendChild(cb);

      } else if (colKey === "__decision__") {
        const sel = document.createElement("select");
        const current = uiState.decisions[rowId] || "";
        sel.innerHTML = `
          <option value="">(blank)</option>
          <option value="keep">keep</option>
          <option value="discard">discard</option>
        `;
        sel.value = current;

        sel.addEventListener("change", () => {
          if (!sel.value) delete uiState.decisions[rowId];
          else uiState.decisions[rowId] = sel.value;
          saveDecisionsObj(uiState.datasetId, uiState.decisions);
        });

        td.appendChild(sel);

      } else {
        const txt = display(row[colKey]);
        td.textContent = txt;
        td.title = txt;
      }

      tr.appendChild(td);
    }

    tbody.appendChild(tr);
  }

  syncSelectAllCheckbox(rows);
  applyColgroupWidths();

  // If the previously active cell no longer exists due to pagination/rerender, clear it
  if (uiState.activeCellEl && !document.body.contains(uiState.activeCellEl)) {
    uiState.activeCellEl = null;
  }
}

async function init() {
  uiState.datasetId = localStorage.getItem(lastDatasetKey());

  if (!uiState.datasetId) {
    alert("No dataset found. Go to Review page, upload a CSV, then return here.");
    window.location.href = "./index.html";
    return;
  }

  const ds = await loadDataset(uiState.datasetId);

  if (!ds?.studies?.length) {
    alert("Dataset not found in browser storage. Re-upload the CSV in Review page.");
    window.location.href = "./index.html";
    return;
  }

  uiState.studies = ds.studies;
  uiState.decisions = loadDecisionsObj(uiState.datasetId);

  document.getElementById("prevPage").addEventListener("click", () => {
    uiState.page = Math.max(1, uiState.page - 1);
    clearActiveCell();
    render();
  });

  document.getElementById("nextPage").addEventListener("click", () => {
    uiState.page = uiState.page + 1;
    clearActiveCell();
    render();
  });

  document.getElementById("selectAllPage").addEventListener("change", (e) => {
    const sorted = sortedStudies();
    const { rows } = currentPageRows(sorted);
    const ids = rows.map(r => String(r.row_id ?? "").trim());

    if (e.target.checked) ids.forEach(id => uiState.selected.add(id));
    else ids.forEach(id => uiState.selected.delete(id));

    render();
  });

  document.getElementById("bulkKeep").addEventListener("click", () => bulkSetDecision("keep"));
  document.getElementById("bulkDiscard").addEventListener("click", () => bulkSetDecision("discard"));

  // Clear active cell highlight when clicking anywhere outside the table cells
  document.addEventListener("mousedown", (e) => {
    const td = e.target?.closest?.("td");
    if (!td) clearActiveCell();
  });

  // Sync decision edits from other tab/page
  window.addEventListener("storage", (e) => {
    if (e.key === decisionsKey(uiState.datasetId)) {
      uiState.decisions = loadDecisionsObj(uiState.datasetId);
      render();
    }
  });

  render();
}

init();