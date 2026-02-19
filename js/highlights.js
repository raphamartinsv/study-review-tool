import { state } from "./state.js";
import { renderCurrentStudy } from "./render.js";

/**
 * Keyword highlight palette (requested).
 */
export const COLOR_MAP = {
  yellow: "rgba(253, 224, 71, 0.65)",
  green:  "rgba(34, 197, 94, 0.55)",
  red:    "rgba(239, 68, 68, 0.55)",
  purple: "rgba(168, 85, 247, 0.50)",
  blue:   "rgba(59, 130, 246, 0.50)"
};

const MAX_KEYWORDS = 5;

/**
 * Regex cache:
 * We rebuild the combined regex only when highlightRules change.
 */
let cachedKey = "";
let cachedRegex = null;

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeTerm(s) {
  return String(s || "").trim();
}

function computeCacheKey(rules) {
  // stable key ignoring case differences
  return rules
    .map(r => `${r.term}`.trim().toLowerCase() + "::" + r.color)
    .sort()
    .join("||");
}

function ensureRegexUpToDate() {
  const key = computeCacheKey(state.highlightRules);
  if (key === cachedKey) return;

  cachedKey = key;
  cachedRegex = null;

  const terms = state.highlightRules
    .map(r => r.term)
    .filter(Boolean)
    .sort((a, b) => b.length - a.length); // prefer longer matches when overlapping

  if (!terms.length) return;

  const pattern = terms.map(escapeRegExp).join("|");
  if (!pattern) return;

  cachedRegex = new RegExp(pattern, "gi");
}

export function addHighlightRule(term, color) {
  const hint = document.getElementById("kwHint");
  const t = normalizeTerm(term);

  if (!t) { hint.textContent = "Enter a keyword."; return; }
  if (state.highlightRules.length >= MAX_KEYWORDS) { hint.textContent = "Limit reached: max 5 keywords."; return; }

  const exists = state.highlightRules.some(h => h.term.toLowerCase() === t.toLowerCase());
  if (exists) { hint.textContent = "Keyword already added."; return; }

  state.highlightRules.push({ term: t, color });
  hint.textContent = `${state.highlightRules.length}/5 keywords active.`;

  cachedKey = ""; // force rebuild
  renderChips();
}

export function removeHighlightRule(term) {
  state.highlightRules = state.highlightRules.filter(h => h.term.toLowerCase() !== term.toLowerCase());
  cachedKey = "";
  renderChips();
}

export function renderChips() {
  const wrap = document.getElementById("kwChips");
  const hint = document.getElementById("kwHint");
  if (!wrap || !hint) return;

  wrap.innerHTML = "";

  if (!state.highlightRules.length) hint.textContent = "No active keywords.";
  else hint.textContent = `${state.highlightRules.length}/5 keywords active.`;

  for (const h of state.highlightRules) {
    const chip = document.createElement("div");
    chip.className = "chip";
    chip.title = `Color: ${h.color}`;

    const swatch = document.createElement("span");
    swatch.style.display = "inline-block";
    swatch.style.width = "10px";
    swatch.style.height = "10px";
    swatch.style.borderRadius = "999px";
    swatch.style.background = COLOR_MAP[h.color] || COLOR_MAP.yellow;

    const label = document.createElement("span");
    label.textContent = h.term;

    const x = document.createElement("button");
    x.className = "x";
    x.textContent = "×";
x.addEventListener("click", () => {
  removeHighlightRule(h.term);
  renderCurrentStudy();   // <-- re-render immediately
});


    chip.appendChild(swatch);
    chip.appendChild(label);
    chip.appendChild(x);
    wrap.appendChild(chip);
  }
}

/**
 * Render report text into a container, applying highlight rules.
 * Uses DOM text nodes (safe), not innerHTML.
 */
export function renderReportInto(containerEl, reportText) {
  if (!containerEl) return;

  // Clear existing nodes
  containerEl.innerHTML = "";

  const text = String(reportText || "");
  if (!text.trim()) {
    containerEl.textContent = "-";
    return;
  }

  if (!state.highlightRules.length) {
    containerEl.textContent = text;
    return;
  }

  ensureRegexUpToDate();
  if (!cachedRegex) {
    containerEl.textContent = text;
    return;
  }

  let lastIndex = 0;
  let m;

  while ((m = cachedRegex.exec(text)) !== null) {
    const start = m.index;
    const end = start + m[0].length;

    if (start > lastIndex) {
      containerEl.appendChild(document.createTextNode(text.slice(lastIndex, start)));
    }

    const matched = text.slice(start, end);
    const matchedLower = matched.toLowerCase();

    // choose color by exact term match (case-insensitive), prefer longer term
    const chosen = state.highlightRules
      .slice()
      .sort((a, b) => b.term.length - a.term.length)
      .find(h => h.term.toLowerCase() === matchedLower) || state.highlightRules[0];

    const mark = document.createElement("mark");
    mark.className = "hl";
    mark.style.background = COLOR_MAP[chosen.color] || COLOR_MAP.yellow;
    mark.textContent = matched;

    containerEl.appendChild(mark);
    lastIndex = end;
  }

  if (lastIndex < text.length) {
    containerEl.appendChild(document.createTextNode(text.slice(lastIndex)));
  }
}
