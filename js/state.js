/**
 * Central, minimal state container.
 */
export const state = {
  datasetId: null,             // current datasetId (shared between pages)
  studies: [],                 // Array<object> parsed from CSV or loaded from IndexedDB
  currentIndex: 0,             // 0-based index into studies
  decisions: new Map(),        // row_id -> { decision: "keep" | "discard" }
  highlightRules: []           // [{ term, color }] max 5
};

/**
 * Required CSV columns (headers).
 * All other fields are optional and display "-" in the UI when missing.
 */
export const REQUIRED_COLUMNS = [
  "row_id",
  "accession_number",
  "patient_id",
  "deid_english_report"
];

/**
 * Display helper: return "-" for undefined/null/empty.
 */
export function displayValue(row, key) {
  const v = row?.[key];
  if (v === undefined || v === null || String(v).trim() === "") return "-";
  return String(v);
}

/**
 * Raw helper: used for keys and exports. Returns "" if missing/empty.
 */
export function rawValue(row, key) {
  const v = row?.[key];
  if (v === undefined || v === null) return "";
  const s = String(v).trim();
  return s ? s : "";
}