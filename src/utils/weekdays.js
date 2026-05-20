const DAY_LABELS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const DAY_CODES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function normalizeDayLabel(value) {
  if (!value) return null;
  const normalized = String(value).trim().toLowerCase();
  const codeIndex = DAY_CODES.findIndex((item) => item.toLowerCase() === normalized);
  if (codeIndex >= 0) return DAY_LABELS[codeIndex];
  const label = DAY_LABELS.find((item) => item.toLowerCase() === normalized);
  return label || String(value).trim();
}

function normalizeDayLabels(values = []) {
  const seen = new Set();
  return (Array.isArray(values) ? values : [])
    .map(normalizeDayLabel)
    .filter(Boolean)
    .filter((value) => {
      if (seen.has(value)) return false;
      seen.add(value);
      return true;
    });
}

module.exports = {
  DAY_LABELS,
  DAY_CODES,
  normalizeDayLabel,
  normalizeDayLabels
};
