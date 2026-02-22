console.log("main.js loaded ✅", location.href);
import { state, rawValue } from "./state.js";
import { parseCsvFile, exportAllCsv, downloadTextFile } from "./csv.js";
import { addHighlightRule } from "./highlights.js";
import { renderCurrentStudy } from "./render.js";
import { saveDataset, loadDataset } from "./db.js";

/**
 * -----------------------------
 * Storage keys / helpers
 * -----------------------------
 */
function lastDatasetKey() {
  return "studyreview:lastDatasetId";
}
function decisionsKey(datasetId) {
  return `studyreview:decisions:${datasetId}`;
}
function indexKey(datasetId) {
  return `studyreview:index:${datasetId}`;
}

function newDatasetId() {
  return (crypto?.randomUUID?.() ?? `ds_${Date.now()}`);
}

function loadDecisionsObj(datasetId) {
  try {
    return JSON.parse(localStorage.getItem(decisionsKey(datasetId)) || "{}");
  } catch {
    return {};
  }
}

function saveDecisionsObj(datasetId, obj) {
  localStorage.setItem(decisionsKey(datasetId), JSON.stringify(obj));
}

function decisionsObjToMap(obj) {
  const m = new Map();
  for (const [rowId, decision] of Object.entries(obj || {})) {
    if (decision === "keep" || decision === "discard") {
      m.set(rowId, { decision });
    }
  }
  return m;
}

function decisionsMapToObj(map) {
  const obj = {};
  for (const [rowId, v] of map.entries()) {
    if (v?.decision === "keep" || v?.decision === "discard") obj[rowId] = v.decision;
  }
  return obj;
}

function loadIndex(datasetId) {
  const n = Number(localStorage.getItem(indexKey(datasetId)));
  return Number.isFinite(n) ? n : 0;
}

function saveIndex(datasetId, idx) {
  localStorage.setItem(indexKey(datasetId), String(idx));
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

/**
 * -----------------------------
 * Boot / wiring
 * -----------------------------
 */
document.addEventListener("DOMContentLoaded", async () => {
  wireUpload();
  wireNavigation();
  wireDecisions();
  wireGoto();
  wireExport();
  wireKeywordHighlight();
  wireKeyboardShortcuts();

  // Auto-load last dataset if present (so refresh/back works)
  await tryAutoLoadLastDataset();

  // If decisions change in another tab/page (e.g. overview), refresh decisions here
  window.addEventListener("storage", (e) => {
    if (!state.datasetId) return;
    if (e.key === decisionsKey(state.datasetId)) {
      const obj = loadDecisionsObj(state.datasetId);
      state.decisions = decisionsObjToMap(obj);
      renderCurrentStudy();
    }
    if (e.key === indexKey(state.datasetId)) {
      // optional: if overview or another tab changes index in the future
      const idx = clamp(loadIndex(state.datasetId), 0, state.studies.length - 1);
      state.currentIndex = idx;
      renderCurrentStudy();
    }
  });
});

/**
 * -----------------------------
 * Auto-load last dataset
 * -----------------------------
 */
async function tryAutoLoadLastDataset() {
  const datasetId = localStorage.getItem(lastDatasetKey());
  if (!datasetId) return;

  try {
    const ds = await loadDataset(datasetId);
    if (!ds?.studies?.length) return;

    state.datasetId = datasetId;
    state.studies = ds.studies;

    // Restore last index (where user left off)
    state.currentIndex = clamp(loadIndex(datasetId), 0, ds.studies.length - 1);

    // Restore decisions
    state.decisions = decisionsObjToMap(loadDecisionsObj(datasetId));

    // Show app and render
    document.getElementById("app").style.display = "block";
    renderCurrentStudy();
  } catch {
    // If IndexedDB is blocked/unavailable, fail silently.
  }
}

/**
 * -----------------------------
 * Upload / parse CSV
 * -----------------------------
 */
function wireUpload() {
  const fileInput = document.getElementById("file");
  if (!fileInput) return;

  fileInput.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    showLoadError("");

    try {
const data = await parseCsvFile(file);

// Create datasetId and set it immediately
const datasetId = newDatasetId();
localStorage.setItem(lastDatasetKey(), datasetId);

// Now persist dataset
await saveDataset({ datasetId, studies: data });

      // Reset decisions/index for this dataset
      saveDecisionsObj(datasetId, {});
      saveIndex(datasetId, 0);

      // Update in-memory state
      state.datasetId = datasetId;
      state.studies = data;
      state.currentIndex = 0;
      state.decisions = new Map();

      document.getElementById("app").style.display = "block";
      renderCurrentStudy();
    } catch (err) {
      showLoadError(err?.message || String(err));
    }
  });
}

function showLoadError(msg) {
  const el = document.getElementById("loadError");
  if (!el) return;
  if (!msg) {
    el.style.display = "none";
    el.textContent = "";
  } else {
    el.style.display = "block";
    el.textContent = msg;
  }
}

/**
 * -----------------------------
 * Navigation
 * -----------------------------
 */
function wireNavigation() {
  const prevBtn = document.getElementById("prevBtn");
  const nextBtn = document.getElementById("nextBtn");

  prevBtn?.addEventListener("click", () => {
    state.currentIndex = clamp(state.currentIndex - 1, 0, state.studies.length - 1);
    if (state.datasetId) saveIndex(state.datasetId, state.currentIndex);
    renderCurrentStudy();
  });

  nextBtn?.addEventListener("click", () => {
    state.currentIndex = clamp(state.currentIndex + 1, 0, state.studies.length - 1);
    if (state.datasetId) saveIndex(state.datasetId, state.currentIndex);
    renderCurrentStudy();
  });
}

/**
 * -----------------------------
 * Decisions (Keep/Discard)
 * -----------------------------
 */
function wireDecisions() {
  const keepBtn = document.getElementById("keepBtn");
  const discardBtn = document.getElementById("discardBtn");

  keepBtn?.addEventListener("click", () => setDecisionAndMaybeAdvance("keep"));
  discardBtn?.addEventListener("click", () => setDecisionAndMaybeAdvance("discard"));
}

function setDecisionAndMaybeAdvance(decision) {
  if (!state.studies.length) return;

  const row = state.studies[state.currentIndex];
  const rowId = rawValue(row, "row_id");
  if (!rowId) return;

  state.decisions.set(rowId, { decision });

  // Persist decisions so Overview sees them
  if (state.datasetId) {
    saveDecisionsObj(state.datasetId, decisionsMapToObj(state.decisions));
  }

  // Auto-advance
  if (state.currentIndex < state.studies.length - 1) {
    state.currentIndex++;
  }

  // Persist index so returning to page resumes correctly
  if (state.datasetId) saveIndex(state.datasetId, state.currentIndex);

  renderCurrentStudy();
}

/**
 * -----------------------------
 * Go to index
 * -----------------------------
 */
function wireGoto() {
  const goBtn = document.getElementById("goBtn");
  const gotoInput = document.getElementById("goto");

  goBtn?.addEventListener("click", () => gotoIndex(gotoInput?.value));

  gotoInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") gotoIndex(gotoInput.value);
  });
}

function gotoIndex(oneBasedVal) {
  const total = state.studies.length;
  const err = document.getElementById("gotoError");
  if (err) { err.style.display = "none"; err.textContent = ""; }

  const n = Number(oneBasedVal);
  if (!Number.isFinite(n) || n % 1 !== 0) return showGotoError("Please enter a whole number.");
  if (n < 1 || n > total) return showGotoError(`Out of range. Enter a number from 1 to ${total}.`);

  state.currentIndex = n - 1;
  if (state.datasetId) saveIndex(state.datasetId, state.currentIndex);
  renderCurrentStudy();

  function showGotoError(msg) {
    if (!err) return;
    err.textContent = msg;
    err.style.display = "block";
  }
}

/**
 * -----------------------------
 * Export
 * -----------------------------
 */
function wireExport() {
  const exportBtn = document.getElementById("exportBtn");
  exportBtn?.addEventListener("click", () => {
    const csv = exportAllCsv(state.studies, state.decisions);
    downloadTextFile("study_review_export_all.csv", csv, "text/csv;charset=utf-8;");
  });
}

/**
 * -----------------------------
 * Keyword highlight
 * -----------------------------
 */
function wireKeywordHighlight() {
  const addBtn = document.getElementById("kwAddBtn");
  const input = document.getElementById("kwInput");
  const color = document.getElementById("kwColor");

  addBtn?.addEventListener("click", () => {
    addHighlightRule(input?.value || "", color?.value || "yellow");
    if (input) input.value = "";
    renderCurrentStudy();
  });

  input?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addBtn?.click();
    }
  });
}

/**
 * -----------------------------
 * Keyboard shortcuts
 * -----------------------------
 */
function wireKeyboardShortcuts() {
  document.addEventListener("keydown", (e) => {
    const tag = (document.activeElement?.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select") return;

    if (e.key === "ArrowLeft") {
      state.currentIndex = clamp(state.currentIndex - 1, 0, state.studies.length - 1);
      if (state.datasetId) saveIndex(state.datasetId, state.currentIndex);
      renderCurrentStudy();
    } else if (e.key === "ArrowRight") {
      state.currentIndex = clamp(state.currentIndex + 1, 0, state.studies.length - 1);
      if (state.datasetId) saveIndex(state.datasetId, state.currentIndex);
      renderCurrentStudy();
    } else if (e.key === "y" || e.key === "Y") {
      setDecisionAndMaybeAdvance("keep");
    } else if (e.key === "n" || e.key === "N") {
      setDecisionAndMaybeAdvance("discard");
    }
  });
}