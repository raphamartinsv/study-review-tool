import { state, rawValue } from "./state.js";
import { parseCsvFile, exportAllCsv, downloadTextFile } from "./csv.js";
import { addHighlightRule } from "./highlights.js";
import { renderCurrentStudy } from "./render.js";

/**
 * Entry point: wire up all event listeners.
 * Keep main.js as "glue code" only.
 */
document.addEventListener("DOMContentLoaded", () => {
  wireUpload();
  wireNavigation();
  wireDecisions();
  wireGoto();
  wireExport();
  wireKeywordHighlight();
  wireKeyboardShortcuts();
});

function wireUpload() {
  const fileInput = document.getElementById("file");
  if (!fileInput) return;

  fileInput.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    showLoadError("");

    try {
      const data = await parseCsvFile(file);

      state.studies = data;
      state.currentIndex = 0;
      state.decisions = new Map(); // reset decisions on new upload

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

function wireNavigation() {
  const prevBtn = document.getElementById("prevBtn");
  const nextBtn = document.getElementById("nextBtn");

  prevBtn?.addEventListener("click", () => {
    state.currentIndex = clamp(state.currentIndex - 1, 0, state.studies.length - 1);
    renderCurrentStudy();
  });

  nextBtn?.addEventListener("click", () => {
    state.currentIndex = clamp(state.currentIndex + 1, 0, state.studies.length - 1);
    renderCurrentStudy();
  });
}

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
  if (!rowId) return; // required, but defensive

  state.decisions.set(rowId, { decision });

  // Auto-advance if not at end
  if (state.currentIndex < state.studies.length - 1) {
    state.currentIndex++;
  }

  renderCurrentStudy();
}

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
  renderCurrentStudy();

  function showGotoError(msg) {
    if (!err) return;
    err.textContent = msg;
    err.style.display = "block";
  }
}

function wireExport() {
  const exportBtn = document.getElementById("exportBtn");
  exportBtn?.addEventListener("click", () => {
    const csv = exportAllCsv(state.studies, state.decisions);
    downloadTextFile("study_review_export_all.csv", csv, "text/csv;charset=utf-8;");
  });
}

function wireKeywordHighlight() {
  const addBtn = document.getElementById("kwAddBtn");
  const input = document.getElementById("kwInput");
  const color = document.getElementById("kwColor");

  addBtn?.addEventListener("click", () => {
    addHighlightRule(input?.value || "", color?.value || "yellow");
    if (input) input.value = "";
    renderCurrentStudy(); // ensures report reflects new highlights
  });

  input?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addBtn?.click();
    }
  });
}

function wireKeyboardShortcuts() {
  document.addEventListener("keydown", (e) => {
    // Avoid interfering with typing in inputs
    const tag = (document.activeElement?.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select") return;

    if (e.key === "ArrowLeft") {
      state.currentIndex = clamp(state.currentIndex - 1, 0, state.studies.length - 1);
      renderCurrentStudy();
    } else if (e.key === "ArrowRight") {
      state.currentIndex = clamp(state.currentIndex + 1, 0, state.studies.length - 1);
      renderCurrentStudy();
    } else if (e.key === "y" || e.key === "Y") {
      setDecisionAndMaybeAdvance("keep");
    } else if (e.key === "n" || e.key === "N") {
      setDecisionAndMaybeAdvance("discard");
    }
  });
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}
