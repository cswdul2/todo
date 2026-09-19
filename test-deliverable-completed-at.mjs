/**
 * Unit checks for deliverable completedAt → 실적MH ratio.
 */
function importanceWeight(importance) {
  if (importance === "high") return 3;
  if (importance === "low") return 1;
  return 2;
}
function normalizeCompletedAtDate(raw) {
  if (raw == null) return null;
  const s = String(raw).trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}
function isDeliverableCompleteOnDate(row, dateStr) {
  const completedAt = normalizeCompletedAtDate(row.completedAt);
  if (completedAt) return !dateStr || completedAt <= dateStr;
  return !!row.done;
}
function progressOnDate(rows, dateStr) {
  const total = rows.reduce((a, r) => a + importanceWeight(r.importance), 0);
  if (total <= 0) return 0;
  const done = rows
    .filter((r) => isDeliverableCompleteOnDate(r, dateStr))
    .reduce((a, r) => a + importanceWeight(r.importance), 0);
  return done / total;
}

const rows = [
  { importance: "high", completedAt: "2026-09-22" }, // 3
  { importance: "medium", completedAt: null }, // 2
  { importance: "low", completedAt: "2026-09-24" }, // 1
];

const r21 = progressOnDate(rows, "2026-09-21");
const r22 = progressOnDate(rows, "2026-09-22");
const r24 = progressOnDate(rows, "2026-09-24");
if (r21 !== 0) throw new Error(`21 expected 0 got ${r21}`);
if (Math.abs(r22 - 3 / 6) > 1e-9) throw new Error(`22 expected 0.5 got ${r22}`);
if (Math.abs(r24 - 4 / 6) > 1e-9) throw new Error(`24 expected 4/6 got ${r24}`);

// legacy done checkbox still counts
const legacy = progressOnDate([{ importance: "high", done: true, completedAt: null }], "2026-09-20");
if (legacy !== 1) throw new Error(`legacy expected 1 got ${legacy}`);

console.log("PASS deliverable completedAt → 실적MH ratio");
