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
  const s = String(raw).trim();
  const ymd = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (ymd) {
    const y = Number(ymd[1]);
    const m = Number(ymd[2]);
    const d = Number(ymd[3]);
    if (m < 1 || m > 12 || d < 1 || d > 31) return null;
    return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  const short = s.match(/^(\d{2})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (short) {
    const y = 2000 + Number(short[1]);
    const m = Number(short[2]);
    const d = Number(short[3]);
    if (m < 1 || m > 12 || d < 1 || d > 31) return null;
    return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  return null;
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

// short date input (YY.MM.DD) should be normalized as 20YY-MM-DD
const short = progressOnDate([{ importance: "high", completedAt: "26.09.24" }], "2026-09-24");
if (short !== 1) throw new Error(`short date expected 1 got ${short}`);

// legacy done checkbox still counts
const legacy = progressOnDate([{ importance: "high", done: true, completedAt: null }], "2026-09-20");
if (legacy !== 1) throw new Error(`legacy expected 1 got ${legacy}`);

console.log("PASS deliverable completedAt → 실적MH ratio");
