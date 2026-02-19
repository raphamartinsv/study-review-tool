import { REQUIRED_COLUMNS, rawValue } from "./state.js";

/**
 * Parse a CSV file into rows (objects), using PapaParse (global `Papa`).
 * - validates required headers exist
 */
export function parseCsvFile(file) {
  return new Promise((resolve, reject) => {
    if (!window.Papa) {
      reject(new Error("PapaParse not loaded. Check your script include."));
      return;
    }

    window.Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: false,
      complete: (results) => {
        const data = results.data || [];
        if (!data.length) {
          reject(new Error("CSV parsed, but no rows were found."));
          return;
        }

        const missing = validateRequiredHeaders(data[0]);
        if (missing.length) {
          reject(new Error("Missing required columns: " + missing.join(", ")));
          return;
        }

        resolve(data);
      },
      error: (err) => reject(err)
    });
  });
}

function validateRequiredHeaders(firstRowObj) {
  return REQUIRED_COLUMNS.filter(c => !(c in firstRowObj));
}

/**
 * Export ALL studies to CSV:
 * - always includes the identifiers + decision
 * - optional institution included (blank if missing)
 *
 * Columns:
 * row_id, patient_id, accession_number, institution, decision
 */
export function exportAllCsv(studies, decisions) {
  if (!window.Papa) throw new Error("PapaParse not loaded.");

  const rows = studies.map(r => {
    const rowId = rawValue(r, "row_id");
    const entry = decisions.get(rowId);
    return {
      row_id: rawValue(r, "row_id"),
      patient_id: rawValue(r, "patient_id"),
      accession_number: rawValue(r, "accession_number"),
      institution: rawValue(r, "institution"),
      decision: entry ? entry.decision : ""
    };
  });

  return window.Papa.unparse(rows, { quotes: true, newline: "\n" });
}

export function downloadTextFile(filename, contents, mimeType = "text/plain;charset=utf-8;") {
  const blob = new Blob([contents], { type: mimeType });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
