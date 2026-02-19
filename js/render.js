import { state, displayValue, rawValue } from "./state.js";
import { renderChips, renderReportInto } from "./highlights.js";

/**
 * Render counters: reviewed/keep/discard/unreviewed
 */
function updateCounters() {
  const total = state.studies.length;
  let keep = 0, discard = 0;

  for (const [, v] of state.decisions) {
    if (v.decision === "keep") keep++;
    if (v.decision === "discard") discard++;
  }

  const reviewed = state.decisions.size;
  const unreviewed = total - reviewed;

  setText("cReviewed", String(reviewed));
  setText("cKeep", String(keep));
  setText("cDiscard", String(discard));
  setText("cUnreviewed", String(unreviewed));
}

/**
 * Header progress + progress bar
 */
function updateHeader() {
  const total = state.studies.length;
  setText("pos", total ? String(state.currentIndex + 1) : "-");
  setText("total", total ? String(total) : "-");

  const pct = total ? ((state.currentIndex + 1) / total) * 100 : 0;
  const bar = document.getElementById("bar");
  if (bar) bar.style.width = pct.toFixed(2) + "%";

  updateCounters();
}

/**
 * Decision pill in report header
 */
function updateDecisionPill(rowId) {
  const pill = document.getElementById("decisionPill");
  const txt = document.getElementById("decisionText");
  if (!pill || !txt) return;

  const entry = state.decisions.get(rowId);
  pill.classList.remove("keep", "discard", "none");

  if (!entry) {
    pill.classList.add("none");
    txt.textContent = "Unreviewed";
    return;
  }

  if (entry.decision === "keep") {
    pill.classList.add("keep");
    txt.textContent = "KEEP";
  } else {
    pill.classList.add("discard");
    txt.textContent = "DISCARD";
  }
}

function updateNavButtons() {
  const prevBtn = document.getElementById("prevBtn");
  const nextBtn = document.getElementById("nextBtn");
  if (!prevBtn || !nextBtn) return;

  prevBtn.disabled = state.currentIndex <= 0;
  nextBtn.disabled = state.currentIndex >= state.studies.length - 1;
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

/**
 * Main render: render the currently selected study into the UI.
 * Optional fields show "-" due to displayValue().
 */
export function renderCurrentStudy() {
  if (!state.studies.length) return;

  const row = state.studies[state.currentIndex];

  // Required (but still displayed through displayValue for consistency)
  setText("accessionTitle", displayValue(row, "accession_number"));

  // Optional context fields (show "-" if missing/empty)
  setText("institution", displayValue(row, "institution"));
  setText("sex", displayValue(row, "patient_sex"));
  setText("age", displayValue(row, "parsed_patient_age"));
  setText("modality", displayValue(row, "modality"));
  setText("bodyPart", displayValue(row, "body_part_examined"));
  setText("date", displayValue(row, "study_date"));

  const rowId = rawValue(row, "row_id");
  updateDecisionPill(rowId);

  updateHeader();
  updateNavButtons();

  // Sync "Go to" input
  const goto = document.getElementById("goto");
  if (goto) goto.value = String(state.currentIndex + 1);

  // Keyword chips + report highlighting
  renderChips();
  const reportEl = document.getElementById("report");
  renderReportInto(reportEl, row?.deid_english_report ?? "");
}