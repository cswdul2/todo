/**
 * Unit checks: 1MD = 24MH conversion is applied in effort math.
 */
function parseDateStr(s) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function diffDaysInclusive(startStr, endStr) {
  const ms = parseDateStr(endStr).getTime() - parseDateStr(startStr).getTime();
  return Math.max(1, Math.floor(ms / 86400000) + 1);
}

function taskTotalMh(task) {
  const raw = Number(task.effortValue);
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  return task.effortUnit === "MD" ? raw * 24 : raw;
}

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

function taskDailyMhOnDate(task, dateStr) {
  if (dateStr < task.startDate || dateStr > task.endDate) return 0;
  const totalMh = taskTotalMh(task);
  if (!totalMh) return 0;
  return totalMh / diffDaysInclusive(task.startDate, task.endDate);
}

function taskSpentDailyMhOnDate(task, dateStr) {
  if (dateStr < task.startDate || dateStr > task.endDate) return 0;
  const totalMh = taskTotalMh(task);
  if (!totalMh) return 0;
  const rows = task.deliverables || [];
  const totalWeight = rows.reduce((acc, row) => acc + importanceWeight(row.importance), 0);
  if (totalWeight <= 0) return 0;
  let spent = 0;
  rows.forEach((row) => {
    const completedAt = normalizeCompletedAtDate(row.completedAt);
    if (completedAt !== dateStr) return;
    spent += (totalMh / totalWeight) * importanceWeight(row.importance);
  });
  return spent;
}

function formatEffortInputValue(v) {
  if (!Number.isFinite(v) || v <= 0) return "";
  const rounded = Math.round(v * 10000) / 10000;
  return String(rounded).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}

function convertEffortInputValue(valueRaw, fromUnit, toUnit) {
  const raw = Number(valueRaw);
  if (!Number.isFinite(raw) || raw <= 0 || fromUnit === toUnit) return String(valueRaw);
  const mh = fromUnit === "MD" ? raw * 24 : raw;
  const next = toUnit === "MD" ? mh / 24 : mh;
  return formatEffortInputValue(next);
}

// 1MD = 24MH (total)
{
  const mdTask = { effortValue: 1, effortUnit: "MD" };
  const mhTask = { effortValue: 24, effortUnit: "MH" };
  if (taskTotalMh(mdTask) !== 24) throw new Error("1MD must equal 24MH");
  if (taskTotalMh(mdTask) !== taskTotalMh(mhTask)) throw new Error("MD/MH total mismatch");
}

// Daily planned MH must divide by duration with MD converted first
{
  const task = {
    effortValue: 2,
    effortUnit: "MD", // 48MH
    startDate: "2026-09-20",
    endDate: "2026-09-23", // 4 days
  };
  const daily = taskDailyMhOnDate(task, "2026-09-21");
  if (Math.abs(daily - 12) > 1e-9) throw new Error(`daily expected 12MH, got ${daily}`);
}

// Spent MH allocation by deliverable weight must also use converted total MH
{
  const task = {
    effortValue: 1, // 24MH
    effortUnit: "MD",
    startDate: "2026-09-20",
    endDate: "2026-09-21",
    deliverables: [
      { importance: "high", completedAt: "2026-09-20" }, // weight 3
      { importance: "medium", completedAt: "2026-09-21" }, // weight 2
      { importance: "low", completedAt: null }, // weight 1
    ],
  };
  const spent20 = taskSpentDailyMhOnDate(task, "2026-09-20");
  const spent21 = taskSpentDailyMhOnDate(task, "2026-09-21");
  if (Math.abs(spent20 - 12) > 1e-9) throw new Error(`spent20 expected 12MH, got ${spent20}`);
  if (Math.abs(spent21 - 8) > 1e-9) throw new Error(`spent21 expected 8MH, got ${spent21}`);
}

// Unit switch should convert entered value while preserving MH amount
{
  const toMd = convertEffortInputValue("24", "MH", "MD");
  const toMh = convertEffortInputValue("1", "MD", "MH");
  if (toMd !== "1") throw new Error(`24MH -> MD expected 1, got ${toMd}`);
  if (toMh !== "24") throw new Error(`1MD -> MH expected 24, got ${toMh}`);
}

console.log("PASS MD↔MH conversion checks");
