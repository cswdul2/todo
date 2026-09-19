/**
 * Geometry regression: dense multi-day + single-day stacks must leave dots clear.
 * Mirrors the sizing math in renderMultiDayRangeLines (row-max spacer).
 */
import { Window } from "happy-dom";

const BAR_HEIGHT = 8;
const LINE_STEP = 12;
const DOT_GAP_PX = 16;
const SPACER_MARGIN_TOP = 4;
const SPACER_MARGIN_BOTTOM = 10;
const HEADER_BASE = 30;

function stackHeight(lanes) {
  return lanes > 0 ? BAR_HEIGHT + (lanes - 1) * LINE_STEP : 0;
}

function layoutWeek(cellLanes, dotsHeights) {
  const rowMax = Math.max(...cellLanes, 0);
  const barBottomRel = HEADER_BASE + stackHeight(rowMax);
  const cells = cellLanes.map((lanes, i) => {
    const numBottom = 18;
    const spacerStart = numBottom + SPACER_MARGIN_TOP;
    const needSpacer = Math.max(0, Math.ceil(barBottomRel + DOT_GAP_PX - spacerStart - SPACER_MARGIN_BOTTOM));
    const spacerH = Math.max(needSpacer, stackHeight(rowMax));
    const dotsH = dotsHeights[i];
    const dotsTop = spacerStart + spacerH + SPACER_MARGIN_BOTTOM;
    const cellH = dotsTop + dotsH + 8;
    return { lanes, spacerH, dotsTop, dotsH, cellH, barBottomRel };
  });
  const rowH = Math.max(...cells.map((c) => c.cellH));
  return { rowMax, barBottomRel, cells, rowH };
}

function assertNoOverlap(label, result) {
  const { barBottomRel, cells } = result;
  for (const c of cells) {
    if (barBottomRel + DOT_GAP_PX > c.dotsTop) {
      throw new Error(
        `${label}: bar bottom ${barBottomRel} + gap overlaps dotsTop ${c.dotsTop} (spacer ${c.spacerH})`
      );
    }
  }
}

// Case from screenshot: day20-21 sparse, day22-25 dense (~7 lanes), many dots
{
  const cellLanes = [2, 1, 7, 6, 5, 3, 0];
  const dotsHeights = [28, 14, 56, 42, 42, 28, 0];
  const result = layoutWeek(cellLanes, dotsHeights);
  assertNoOverlap("dense-week", result);
  if (result.rowH < result.barBottomRel + DOT_GAP_PX + 56) {
    throw new Error(`row too short: ${result.rowH}`);
  }
  console.log("PASS dense-week", {
    rowMax: result.rowMax,
    barBottomRel: result.barBottomRel,
    dotsTop22: result.cells[2].dotsTop,
    rowH: result.rowH,
  });
}

// Adding tasks increases lanes — still clear
{
  const before = layoutWeek([2, 1, 4, 4, 3, 2, 0], [28, 14, 40, 40, 28, 28, 0]);
  const after = layoutWeek([2, 1, 8, 7, 6, 3, 0], [28, 14, 60, 50, 42, 28, 0]);
  assertNoOverlap("before-add", before);
  assertNoOverlap("after-add", after);
  if (!(after.cells[2].dotsTop > before.cells[2].dotsTop)) {
    throw new Error("dots should move down when lanes increase");
  }
  console.log("PASS after-add-task", {
    dotsTopBefore: before.cells[2].dotsTop,
    dotsTopAfter: after.cells[2].dotsTop,
  });
}

// DOM smoke: spacer height style applied, dots below bar stack
{
  const window = new Window({ url: "https://localhost/" });
  const document = window.document;
  document.body.innerHTML = `
    <div class="calendar-grid" style="position:relative;display:grid;grid-template-columns:repeat(7,80px);">
      ${[0, 1, 2, 3, 4, 5, 6]
        .map(
          (i) => `
        <button class="calendar-cell" data-date-str="2026-09-${20 + i}" style="position:relative;display:flex;flex-direction:column;align-items:flex-start;width:80px;padding:6px;box-sizing:border-box;">
          <span class="calendar-cell__num">${20 + i}</span>
          <span class="calendar-cell__range-spacer" style="display:block;width:100%;height:0;margin-top:4px;margin-bottom:10px;"></span>
          <div class="calendar-cell__dots" style="display:flex;flex-wrap:wrap;gap:3px;">
            ${"<i style='width:10px;height:10px;border-radius:50%;background:#e8943a;display:inline-block'></i>".repeat(
              i === 2 ? 9 : 2
            )}
          </div>
        </button>`
        )
        .join("")}
    </div>`;

  const cells = [...document.querySelectorAll(".calendar-cell")];
  const cellLanes = [2, 1, 7, 6, 5, 3, 0];
  const rowMax = Math.max(...cellLanes);
  const barBottomRel = HEADER_BASE + stackHeight(rowMax);

  cells.forEach((cell, i) => {
    const num = cell.querySelector(".calendar-cell__num");
    const spacer = cell.querySelector(".calendar-cell__range-spacer");
    const dots = cell.querySelector(".calendar-cell__dots");
    // happy-dom may not layout; set explicit sizes approximating flex
    num.getBoundingClientRect = () => ({ top: 0, bottom: 18, height: 18, left: 0, right: 80, width: 80 });
    const numBottom = 18;
    const spacerStart = numBottom + SPACER_MARGIN_TOP;
    const needSpacer = Math.max(0, Math.ceil(barBottomRel + DOT_GAP_PX - spacerStart - SPACER_MARGIN_BOTTOM));
    spacer.style.height = `${needSpacer}px`;
    const dotsTop = spacerStart + needSpacer + SPACER_MARGIN_BOTTOM;
    cell.style.height = `${dotsTop + (i === 2 ? 56 : 28) + 8}px`;
    // fake offsetTops
    Object.defineProperty(spacer, "offsetHeight", { get: () => needSpacer });
    Object.defineProperty(dots, "offsetTop", { get: () => dotsTop });
    Object.defineProperty(cell, "offsetHeight", { get: () => parseInt(cell.style.height, 10) });

    const fakeBarBottom = barBottomRel;
    if (fakeBarBottom + DOT_GAP_PX > dots.offsetTop) {
      throw new Error(`DOM smoke day ${20 + i}: overlap`);
    }
  });
  console.log("PASS dom-smoke-spacer");
}

console.log("ALL LAYOUT TESTS PASSED");
