/**
 * 실적MH: (예상MH / 중요도합) × 그날 완료 산출물 중요도 (완료일에만)
 */
function importanceWeight(importance) {
  if (importance === "high") return 3;
  if (importance === "low") return 1;
  return 2;
}

function spentOnDate(totalMh, rows, dateStr) {
  const totalWeight = rows.reduce((a, r) => a + importanceWeight(r.importance), 0);
  let spent = 0;
  rows.forEach((row) => {
    if (row.completedAt !== dateStr) return;
    spent += (totalMh / totalWeight) * importanceWeight(row.importance);
  });
  return spent;
}

const rows = [
  { importance: "high", completedAt: "2026-09-27" },
  { importance: "high", completedAt: "2026-09-27" },
  { importance: "medium", completedAt: "2026-09-27" },
  { importance: "medium", completedAt: null },
];
const totalMh = 20;
const days = 4;
const dailyExpected = totalMh / days; // 5

const oneHigh = spentOnDate(totalMh, [rows[0], rows[3], { importance: "high", completedAt: null }, { importance: "medium", completedAt: null }], "2026-09-27");
// wait - for formula demo with all 4 in total weight:
const onlyOneHighDone = [
  { importance: "high", completedAt: "2026-09-27" },
  { importance: "high", completedAt: null },
  { importance: "medium", completedAt: null },
  { importance: "medium", completedAt: null },
];
const s = spentOnDate(20, onlyOneHighDone, "2026-09-27");
if (Math.abs(s - 6) > 1e-9) throw new Error(`expected 6 got ${s}`);
if (Math.abs(dailyExpected - 5) > 1e-9) throw new Error("daily expected");

const threeDone = spentOnDate(20, rows, "2026-09-27");
if (Math.abs(threeDone - 16) > 1e-9) throw new Error(`expected 16 got ${threeDone}`);

const otherDay = spentOnDate(20, rows, "2026-09-28");
if (otherDay !== 0) throw new Error(`expected 0 on other day got ${otherDay}`);

console.log("PASS spent MH formula", { oneHigh: s, threeDone, dailyExpected });
