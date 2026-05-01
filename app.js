(function () {
  "use strict";

  const STORAGE_KEY_V2 = "calendar-app-tasks-v2";
  const STORAGE_KEY_V1 = "calendar-app-tasks-v1";

  /**
   * @typedef {Object} Task
   * @property {string} id
   * @property {string} title
   * @property {string} description
   * @property {string} status
   * @property {string} startDate
   * @property {string} endDate
   * @property {'none'|'daily'|'weekly'|'monthly'} recurrence
   * @property {string | null} recurrenceUntil
   * @property {'high'|'medium'|'low'} importance
  * @property {number | null} effortValue
  * @property {'MH'|'MD'} effortUnit
  * @property {Array<{id: string, name: string, importance: 'high'|'medium'|'low', done: boolean, createdAt?: number | null}>} deliverables
 * @property {Record<string, Record<string, boolean>> | undefined} recurrenceProgress
 * @property {string[] | undefined} recurrenceSkipStarts
   */

  /** @type {Task[]} */
  let tasks = [];
  /** @type {Task[][]} */
  let undoStack = [];
  /** @type {Task[][]} */
  let redoStack = [];

  let viewYear = new Date().getFullYear();
  let viewMonth = new Date().getMonth();

  let selectedDateStr = null;
  /** @type {string | null} */
  let editingId = null;

  /** 새 일정(날짜만 연 경우)은 흰색 테마 유지, 항목 선택·상태 변경 시에는 상태색 */
  let modalDefaultWhite = true;

  const monthTitle = document.getElementById("monthTitle");
  const calendarGrid = document.getElementById("calendarGrid");
  const prevMonth = document.getElementById("prevMonth");
  const nextMonth = document.getElementById("nextMonth");
  const btnToday = document.getElementById("btnToday");

  const searchInput = document.getElementById("searchInput");
  const searchStatus = document.getElementById("searchStatus");
  const searchResults = document.getElementById("searchResults");
  const searchCount = document.getElementById("searchCount");
  const searchResultsList = document.getElementById("searchResultsList");

  const modalBackdrop = document.getElementById("modalBackdrop");
  const taskModal = document.getElementById("taskModal");
  const modalInner = document.getElementById("modalInner");
  const modalDateHint = document.getElementById("modalDateHint");
  const taskTitle = document.getElementById("taskTitle");
  const quickStatusGroup = document.getElementById("quickStatusGroup");
  const quickImportanceGroup = document.getElementById("quickImportanceGroup");
  const taskDescription = document.getElementById("taskDescription");
  const taskEffortValue = document.getElementById("taskEffortValue");
  const taskEffortUnit = document.getElementById("taskEffortUnit");
  const taskActualEffortValue = document.getElementById("taskActualEffortValue");
  const deliverableNameInput = document.getElementById("deliverableNameInput");
  const deliverableImportanceInput = document.getElementById("deliverableImportanceInput");
  const btnAddDeliverable = document.getElementById("btnAddDeliverable");
  const deliverableEditorHead = document.getElementById("deliverableEditorHead");
  const deliverableList = document.getElementById("deliverableList");
  const taskStart = document.getElementById("taskStart");
  const taskEnd = document.getElementById("taskEnd");
  const taskRecurrence = document.getElementById("taskRecurrence");
  const modalTodayDisplay = document.getElementById("modalTodayDisplay");
  const btnUndo = document.getElementById("btnUndo");
  const btnSave = document.getElementById("btnSave");
  const btnDelete = document.getElementById("btnDelete");
  const existingTasksWrap = document.getElementById("existingTasksWrap");
  const existingTasksList = document.getElementById("existingTasksList");
  const btnNewTask = document.getElementById("btnNewTask");
  const btnExport = document.getElementById("btnExport");
  const btnImport = document.getElementById("btnImport");
  const importFileInput = document.getElementById("importFileInput");

  const btnOpenOcr = document.getElementById("btnOpenOcr");
  const btnOpenCamera = document.getElementById("btnOpenCamera");
  const cameraFileInput = document.getElementById("cameraFileInput");
  const ocrBackdrop = document.getElementById("ocrBackdrop");
  const ocrModal = document.getElementById("ocrModal");
  const geminiApiKeyInput = document.getElementById("geminiApiKey");
  const btnSaveGeminiKey = document.getElementById("btnSaveGeminiKey");
  const ocrFileInput = document.getElementById("ocrFileInput");
  const ocrDropZone = document.getElementById("ocrDropZone");
  const ocrPreviewWrap = document.getElementById("ocrPreviewWrap");
  const ocrPreviewImg = document.getElementById("ocrPreviewImg");
  const ocrStatus = document.getElementById("ocrStatus");
  const btnOcrRun = document.getElementById("btnOcrRun");
  const ocrResults = document.getElementById("ocrResults");
  const ocrDraftList = document.getElementById("ocrDraftList");
  const btnOcrApply = document.getElementById("btnOcrApply");
  const btnOcrClose = document.getElementById("btnOcrClose");
  const confirmBackdrop = document.getElementById("confirmBackdrop");
  const confirmPop = document.getElementById("confirmPop");
  const confirmTitle = document.getElementById("confirmTitle");
  const confirmMessage = document.getElementById("confirmMessage");
  const confirmCancel = document.getElementById("confirmCancel");
  const confirmOk = document.getElementById("confirmOk");

  const GEMINI_KEY_STORAGE = "calendar-app-gemini-api-key";
  const FIREBASE_CONFIG = {
    apiKey: "AIzaSyCflqSWWtIz-h79w4lfBTP3cQNIMwmH01s",
    authDomain: "todo-8f9cb.firebaseapp.com",
    databaseURL: "https://todo-8f9cb-default-rtdb.firebaseio.com",
    projectId: "todo-8f9cb",
    storageBucket: "todo-8f9cb.firebasestorage.app",
    messagingSenderId: "1058024138992",
    appId: "1:1058024138992:web:fcf942bf37c050f5b93a35",
    measurementId: "G-WLYZYNY1DW",
  };
  const FIREBASE_TASKS_PATH = "shared-calendar/tasks";
  const FIREBASE_META_PATH = "shared-calendar/meta";
  /** 선호 모델 순서 (실제 가용 모델과 교집합으로 선택) */
  const GEMINI_MODEL_PREFER = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"];

  /** @type {Array<{ title: string, description: string, status: string, importance: string, startDate: string, endDate: string, effortValue: number | null, effortUnit: 'MH'|'MD', recurrence: 'none', recurrenceUntil: null, confidence?: number }>} */
  let ocrDraftRows = [];
  /** 새 일정 작성용 임시 상태/중요도 */
  let draftStatus = "ready";
  let draftImportance = "medium";
  /** @type {string | null} */
  let ocrPendingBase64 = null;
  /** @type {string} */
  let ocrPendingMime = "image/jpeg";
  let geminiKeyCache = "";
  let firebaseDb = null;
  let firebaseTasksRef = null;
  let barDotLayoutFixAttempts = 0;
  let rangeTooltipEl = null;
  let rangeTooltipHideTimer = null;
  let rangeTooltipAutoHideTimer = null;
  let rangeTooltipWatchTimer = null;
  let rangeTooltipOpenHandler = null;
  let rangeTooltipAnchorEl = null;
  let rangeTooltipHovering = false;
  let rangeTooltipTransitUntil = 0;
  let rangeTooltipGlobalGuardBound = false;
  let lastPointerClientX = -1;
  let lastPointerClientY = -1;
  let suppressRangeClickTaskId = null;
  let suppressRangeClickUntil = 0;
  /** @type {null | { tasks: Task[], selectedDateStr: string | null, editingId: string | null, modalDefaultWhite: boolean, form: { title: string, description: string, effortValue: string, effortUnit: string, startDate: string, endDate: string, recurrence: 'none'|'daily'|'weekly'|'monthly', status: string, importance: string, deliverables: Array<{id: string, name: string, importance: 'high'|'medium'|'low', done: boolean, createdAt?: number | null}>, deliverableName: string, deliverableImportance: string } }} */
  let modalSessionSnapshot = null;
  const RECURRENCE_ALERT_STATE_KEY = "calendar-app-recurrence-alert-state-v1";
  let recurrenceWatchTimer = null;
  // 이전 실행에서 남아있을 수 있는 커스텀 툴팁 노드 정리
  document.querySelectorAll(".range-line-tooltip").forEach((el) => el.remove());

  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function toDateStr(y, m, d) {
    return `${y}-${pad2(m + 1)}-${pad2(d)}`;
  }

  /** @param {Date} d */
  function toDateStrFromDate(d) {
    return toDateStr(d.getFullYear(), d.getMonth(), d.getDate());
  }

  function parseDateStr(s) {
    const [y, m, d] = s.split("-").map(Number);
    return new Date(y, m - 1, d);
  }

  function startOfDay(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  function todayStart() {
    return startOfDay(new Date());
  }

  function ensureRangeTooltip() {
    // 핫리로드/스크립트 재실행 등으로 남은 오래된 툴팁 노드를 정리
    const stale = document.querySelectorAll(".range-line-tooltip");
    if (stale.length > 1) {
      stale.forEach((el, idx) => {
        if (!(el instanceof HTMLElement)) return;
        if (idx === stale.length - 1) return;
        el.remove();
      });
    }
    if (rangeTooltipEl && document.body.contains(rangeTooltipEl)) return rangeTooltipEl;
    const existing = document.querySelector(".range-line-tooltip");
    if (existing instanceof HTMLElement) {
      rangeTooltipEl = existing;
      return rangeTooltipEl;
    }
    const tip = document.createElement("div");
    tip.className = "range-line-tooltip";
    tip.hidden = true;
    tip.tabIndex = 0;
    tip.innerHTML = `<span class="range-line-tooltip__imp" aria-hidden="true"></span><span class="range-line-tooltip__text"></span>`;
    tip.addEventListener("mouseenter", () => {
      rangeTooltipHovering = true;
      if (rangeTooltipHideTimer) {
        clearTimeout(rangeTooltipHideTimer);
        rangeTooltipHideTimer = null;
      }
      tip.classList.add("range-line-tooltip--pop");
    });
    tip.addEventListener("mouseleave", (e) => {
      rangeTooltipHovering = false;
      const next = /** @type {Element | null} */ (e.relatedTarget instanceof Element ? e.relatedTarget : null);
      if (rangeTooltipAnchorEl && next && rangeTooltipAnchorEl.contains(next)) return;
      hideRangeTooltipNow();
    });
    tip.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (typeof rangeTooltipOpenHandler === "function") rangeTooltipOpenHandler();
      hideRangeTooltipNow();
    });
    tip.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      if (typeof rangeTooltipOpenHandler === "function") rangeTooltipOpenHandler();
      hideRangeTooltipNow();
    });
    document.body.appendChild(tip);
    rangeTooltipEl = tip;
    if (!rangeTooltipGlobalGuardBound) {
      document.addEventListener(
        "mousemove",
        (e) => {
          lastPointerClientX = e.clientX;
          lastPointerClientY = e.clientY;
          const target = /** @type {Element | null} */ (e.target instanceof Element ? e.target : null);
          const hoveredLine = target ? target.closest(".calendar-range-line") : null;
          // 요구사항: 수평바 영역 밖이면 마지막 툴팁 포함 전부 즉시 제거
          if (!hoveredLine) {
            hideRangeTooltipNow();
            return;
          }
          if (!rangeTooltipEl || rangeTooltipEl.hidden || !rangeTooltipAnchorEl) return;
          if (hoveredLine !== rangeTooltipAnchorEl) hideRangeTooltipNow();
        },
        true
      );
      rangeTooltipGlobalGuardBound = true;
    }
    return tip;
  }

  function hideRangeTooltipNow() {
    document.querySelectorAll(".range-line-tooltip").forEach((el) => {
      if (!(el instanceof HTMLElement)) return;
      el.hidden = true;
      el.classList.remove("range-line-tooltip--pop");
    });
    if (!rangeTooltipEl) return;
    if (rangeTooltipHideTimer) {
      clearTimeout(rangeTooltipHideTimer);
      rangeTooltipHideTimer = null;
    }
    if (rangeTooltipAutoHideTimer) {
      clearTimeout(rangeTooltipAutoHideTimer);
      rangeTooltipAutoHideTimer = null;
    }
    if (rangeTooltipWatchTimer) {
      clearInterval(rangeTooltipWatchTimer);
      rangeTooltipWatchTimer = null;
    }
    rangeTooltipEl.hidden = true;
    rangeTooltipEl.classList.remove("range-line-tooltip--pop");
    rangeTooltipAnchorEl = null;
    rangeTooltipOpenHandler = null;
    rangeTooltipHovering = false;
  }

  function scheduleRangeTooltipHide(delayMs = 120) {
    if (rangeTooltipHideTimer) clearTimeout(rangeTooltipHideTimer);
    rangeTooltipTransitUntil = Date.now() + Math.max(220, delayMs + 120);
    rangeTooltipHideTimer = setTimeout(() => {
      hideRangeTooltipNow();
      rangeTooltipHideTimer = null;
    }, delayMs);
  }

  function showRangeTooltip(
    anchorEl,
    text,
    statusKey,
    impKey,
    onActivate,
    pointerX = null,
    pointerY = null,
    autoHideIfNotHoveredMs = 0
  ) {
    if (!anchorEl || !anchorEl.matches(":hover")) return;
    const tip = ensureRangeTooltip();
    if (rangeTooltipHideTimer) {
      clearTimeout(rangeTooltipHideTimer);
      rangeTooltipHideTimer = null;
    }
    if (rangeTooltipAutoHideTimer) {
      clearTimeout(rangeTooltipAutoHideTimer);
      rangeTooltipAutoHideTimer = null;
    }
    rangeTooltipOpenHandler = onActivate;
    rangeTooltipAnchorEl = anchorEl;
    rangeTooltipHovering = false;
    tip.className = "range-line-tooltip";
    tip.classList.add("range-line-tooltip--pop", `range-line-tooltip--${statusKey}`, `range-line-tooltip--imp-${impKey}`);
    const textEl = tip.querySelector(".range-line-tooltip__text");
    if (textEl) textEl.textContent = text || "";
    tip.hidden = false;
    if (pointerX != null && pointerY != null) {
      tip.style.left = `${Math.round(window.scrollX + pointerX + 10)}px`;
      tip.style.top = `${Math.round(window.scrollY + pointerY)}px`;
    } else {
      const r = anchorEl.getBoundingClientRect();
      tip.style.left = `${Math.round(window.scrollX + r.right + 10)}px`;
      tip.style.top = `${Math.round(window.scrollY + r.top + r.height / 2)}px`;
    }
    if (autoHideIfNotHoveredMs > 0) {
      rangeTooltipAutoHideTimer = setTimeout(() => {
        if (!rangeTooltipHovering) hideRangeTooltipNow();
        rangeTooltipAutoHideTimer = null;
      }, autoHideIfNotHoveredMs);
    }
    if (rangeTooltipWatchTimer) {
      clearInterval(rangeTooltipWatchTimer);
      rangeTooltipWatchTimer = null;
    }
    // 이벤트 누락과 무관하게 "수평바를 벗어나면 즉시 숨김"을 강제한다.
    rangeTooltipWatchTimer = setInterval(() => {
      if (!rangeTooltipEl || rangeTooltipEl.hidden || !rangeTooltipAnchorEl) return;
      if (!rangeTooltipAnchorEl.matches(":hover")) {
        hideRangeTooltipNow();
        return;
      }
      const r = rangeTooltipAnchorEl.getBoundingClientRect();
      const insideByCoords =
        lastPointerClientX >= r.left &&
        lastPointerClientX <= r.right &&
        lastPointerClientY >= r.top &&
        lastPointerClientY <= r.bottom;
      if (!insideByCoords) hideRangeTooltipNow();
    }, 50);
  }

  function bindRangeLineTooltip(
    lineEl,
    text,
    statusKey,
    impKey,
    onActivate,
    hideImmediatelyOnLeave = false,
    showDelayMs = 0,
    autoHideIfNotHoveredMs = 0
  ) {
    let showTimer = null;
    let lastX = null;
    let lastY = null;
    const scheduleShow = () => {
      if (showTimer) {
        clearTimeout(showTimer);
        showTimer = null;
      }
      showTimer = setTimeout(() => {
        if (!lineEl.matches(":hover")) {
          showTimer = null;
          return;
        }
        showRangeTooltip(lineEl, text, statusKey, impKey, onActivate, lastX, lastY, autoHideIfNotHoveredMs);
        showTimer = null;
      }, Math.max(0, showDelayMs));
    };
    lineEl.addEventListener("mouseenter", (e) => {
      const mx = e instanceof MouseEvent ? e.clientX : null;
      const my = e instanceof MouseEvent ? e.clientY : null;
      lastX = mx;
      lastY = my;
      scheduleShow();
    });
    lineEl.addEventListener("mousemove", (e) => {
      const mx = e instanceof MouseEvent ? e.clientX : null;
      const my = e instanceof MouseEvent ? e.clientY : null;
      lastX = mx;
      lastY = my;
      scheduleShow();
    });
    lineEl.addEventListener("mouseleave", () => {
      if (showTimer) {
        clearTimeout(showTimer);
        showTimer = null;
      }
      // 요구사항: 수평바 영역을 벗어나면 즉시 숨김
      hideRangeTooltipNow();
    });
    lineEl.addEventListener("focus", () => {
      showRangeTooltip(lineEl, text, statusKey, impKey, onActivate, null, null, autoHideIfNotHoveredMs);
    });
    lineEl.addEventListener("blur", () => {
      scheduleRangeTooltipHide();
    });
  }

  function addDaysStr(dateStr, delta) {
    const d = parseDateStr(dateStr);
    d.setDate(d.getDate() + delta);
    return toDateStrFromDate(d);
  }

  function diffDaysStr(fromDateStr, toDateStrValue) {
    const a = parseDateStr(fromDateStr).getTime();
    const b = parseDateStr(toDateStrValue).getTime();
    return Math.round((b - a) / 86400000);
  }

  function dateStrFromPoint(clientX, clientY) {
    if (!calendarGrid) return null;
    const cells = [...calendarGrid.querySelectorAll(".calendar-cell[data-date-str]")];
    for (const cell of cells) {
      if (!(cell instanceof HTMLElement)) continue;
      const r = cell.getBoundingClientRect();
      const inside = clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom;
      if (inside) return cell.dataset.dateStr || null;
    }
    // fallback: 좌표가 셀 경계선 위에 걸친 경우 보조 판정
    const el = document.elementFromPoint(clientX, clientY);
    if (!(el instanceof Element)) return null;
    const cell = el.closest(".calendar-cell[data-date-str]");
    if (!(cell instanceof HTMLElement)) return null;
    return cell.dataset.dateStr || null;
  }

  function bindRangeDrag(lineEl, task, anchorDateStr) {
    lineEl.addEventListener("pointerdown", (e) => {
      if (!(e instanceof PointerEvent) || e.button !== 0) return;
      e.preventDefault();
      const startX = e.clientX;
      const startY = e.clientY;
      let moved = false;
      let ghost = null;
      const lineRect = lineEl.getBoundingClientRect();
      const grabOffsetX = Math.max(0, Math.min(lineRect.width, e.clientX - lineRect.left));
      const grabOffsetY = Math.max(0, Math.min(lineRect.height, e.clientY - lineRect.top));

      const createGhost = () => {
        if (ghost) return;
        ghost = document.createElement("div");
        ghost.className = "calendar-range-drag-ghost";
        ghost.style.width = `${Math.max(22, Math.round(lineRect.width))}px`;
        ghost.style.height = `${Math.max(6, Math.round(lineRect.height || 6))}px`;
        ghost.style.background = lineEl.style.background || getComputedStyle(lineEl).background;
        document.body.appendChild(ghost);
      };

      const placeGhost = (clientX, clientY) => {
        if (!ghost) return;
        ghost.style.left = `${Math.round(clientX - grabOffsetX)}px`;
        ghost.style.top = `${Math.round(clientY - grabOffsetY)}px`;
      };

      const onMove = (ev) => {
        if (!(ev instanceof PointerEvent)) return;
        ev.preventDefault();
        if (!moved && Math.hypot(ev.clientX - startX, ev.clientY - startY) >= 4) {
          moved = true;
          lineEl.classList.add("calendar-range-line--dragging");
          createGhost();
          document.body.classList.add("calendar-dragging");
          lineEl.classList.add("calendar-range-line--drag-origin");
        }
        if (moved) {
          placeGhost(ev.clientX, ev.clientY);
        }
      };

      const cleanup = () => {
        window.removeEventListener("pointermove", onMove, true);
        window.removeEventListener("pointerup", onUp, true);
        window.removeEventListener("pointercancel", onCancel, true);
        lineEl.classList.remove("calendar-range-line--dragging");
        lineEl.classList.remove("calendar-range-line--drag-origin");
        document.body.classList.remove("calendar-dragging");
        if (ghost) {
          ghost.remove();
          ghost = null;
        }
        try {
          lineEl.releasePointerCapture(e.pointerId);
        } catch {}
      };

      const finishMove = async (ev, cancelled) => {
        cleanup();
        if (cancelled || !moved) return;
        const targetDateStr = dateStrFromPoint(ev.clientX, ev.clientY);
        if (!targetDateStr) return;
        const delta = diffDaysStr(anchorDateStr, targetDateStr);
        if (!Number.isFinite(delta) || delta === 0) return;
        pushUndoSnapshot();

        // 드래그 드롭 직후 발생하는 click 이벤트를 먼저 억제한다.
        suppressRangeClickTaskId = task.id;
        suppressRangeClickUntil = Date.now() + 450;

        const patch = {
          startDate: addDaysStr(task.startDate, delta),
          endDate: addDaysStr(task.endDate, delta),
        };
        if (task.recurrenceUntil) patch.recurrenceUntil = addDaysStr(task.recurrenceUntil, delta);

        try {
          await firebaseUpdateTask(task.id, patch);
        } catch (err) {
          const idx = tasks.findIndex((x) => x.id === task.id);
          if (idx >= 0) Object.assign(tasks[idx], patch);
          await saveTasks();
        }
        renderCalendar();
      };

      const onUp = (ev) => {
        if (!(ev instanceof PointerEvent)) return;
        void finishMove(ev, false);
      };
      const onCancel = (ev) => {
        if (!(ev instanceof PointerEvent)) return;
        void finishMove(ev, true);
      };

      window.addEventListener("pointermove", onMove, true);
      window.addEventListener("pointerup", onUp, true);
      window.addEventListener("pointercancel", onCancel, true);
      try {
        lineEl.setPointerCapture(e.pointerId);
      } catch {}
    });
  }

  function addMonthsStr(dateStr, delta) {
    const d = parseDateStr(dateStr);
    d.setMonth(d.getMonth() + delta);
    return toDateStrFromDate(d);
  }

  function dateInRange(dateStr, startStr, endStr) {
    const t = parseDateStr(dateStr).getTime();
    const a = parseDateStr(startStr).getTime();
    const b = parseDateStr(endStr).getTime();
    return t >= a && t <= b;
  }

  /**
   * @param {Task} task
   * @param {string} s
   * @param {string} e
   */
  function advanceOccurrence(task, s, e) {
    switch (task.recurrence) {
      case "daily":
        return { start: addDaysStr(s, 1), end: addDaysStr(e, 1) };
      case "weekly":
        return { start: addDaysStr(s, 7), end: addDaysStr(e, 7) };
      case "monthly":
        return { start: addMonthsStr(s, 1), end: addMonthsStr(e, 1) };
      default:
        return null;
    }
  }

  /** @param {Partial<Task> & { startDate: string, endDate: string, recurrence?: string, recurrenceUntil?: string | null }} task */
  function getRecurrenceCap(task) {
    return task.recurrenceUntil && task.recurrenceUntil.length ? task.recurrenceUntil : "9999-12-31";
  }

  function normalizeRecurrenceSkipStarts(rawList) {
    if (!Array.isArray(rawList)) return [];
    const set = new Set();
    rawList.forEach((v) => {
      if (typeof v !== "string") return;
      if (/^\d{4}-\d{2}-\d{2}$/.test(v)) set.add(v);
    });
    return Array.from(set).sort();
  }

  function isOccurrenceSkipped(task, occStart) {
    if (!task || !Array.isArray(task.recurrenceSkipStarts) || !occStart) return false;
    return task.recurrenceSkipStarts.includes(occStart);
  }

  function endOfWeekStr(dateStr) {
    const d = parseDateStr(dateStr);
    const delta = 6 - d.getDay();
    return toDateStrFromDate(new Date(d.getFullYear(), d.getMonth(), d.getDate() + delta));
  }

  function endOfMonthStr(dateStr) {
    const d = parseDateStr(dateStr);
    return toDateStr(d.getFullYear(), d.getMonth() + 1, 0);
  }

  function endOfYearStr(dateStr) {
    const d = parseDateStr(dateStr);
    return `${d.getFullYear()}-12-31`;
  }

  function getRecurrenceWindowEnd(rec, baseDateStr) {
    if (rec === "daily") return endOfWeekStr(baseDateStr);
    if (rec === "weekly") return endOfMonthStr(baseDateStr);
    if (rec === "monthly") return endOfYearStr(baseDateStr);
    return null;
  }

  function getRecurrenceCloneCount(rec) {
    if (rec === "daily") return 7;
    if (rec === "weekly") return 4;
    if (rec === "monthly") return 12;
    return 1;
  }

  function buildConcreteTasksFromRecurrence(payload, firstTaskId = null) {
    const rec = payload && payload.recurrence ? payload.recurrence : "none";
    if (rec === "none") {
      return [normalizeTask({ id: firstTaskId || uuid(), ...payload })];
    }
    const count = getRecurrenceCloneCount(rec);
    const out = [];
    let occStart = payload.startDate;
    let occEnd = payload.endDate;
    for (let idx = 0; idx < count; idx++) {
      out.push(
        normalizeTask({
          id: idx === 0 && firstTaskId ? firstTaskId : uuid(),
          ...payload,
          startDate: occStart,
          endDate: occEnd,
          recurrence: "none",
          recurrenceUntil: null,
          recurrenceProgress: {},
          recurrenceSkipStarts: [],
        })
      );
      const next = advanceOccurrence({ recurrence: rec }, occStart, occEnd);
      if (!next) break;
      occStart = next.start;
      occEnd = next.end;
    }
    return out;
  }

  function updateTopbarDatePill() {
    if (!(modalTodayDisplay instanceof HTMLElement)) return;
    const base = selectedDateStr || toDateStrFromDate(new Date());
    modalTodayDisplay.textContent = base;
  }

  /**
   * @param {Task | Partial<Task> & { startDate: string, endDate: string }} task
   * @param {string} dateStr
   */
  function taskCoversDate(task, dateStr) {
    const rec = task.recurrence || "none";
    if (rec === "none") {
      return dateInRange(dateStr, task.startDate, task.endDate);
    }
    const until = getRecurrenceCap(task);
    let s = task.startDate;
    let e = task.endDate;
    for (let i = 0; i < 8000; i++) {
      if (s > until) break;
      if (!isOccurrenceSkipped(task, s) && dateInRange(dateStr, s, e)) return true;
      const next = advanceOccurrence(/** @type {Task} */ (task), s, e);
      if (!next) break;
      s = next.start;
      e = next.end;
      if (s > until) break;
    }
    return false;
  }

  /**
   * @returns {{ start: string, end: string } | null}
   */
  function getOccurrenceContaining(task, dateStr) {
    const rec = task.recurrence || "none";
    if (rec === "none") {
      if (dateInRange(dateStr, task.startDate, task.endDate)) {
        return { start: task.startDate, end: task.endDate };
      }
      return null;
    }
    const until = getRecurrenceCap(task);
    let s = task.startDate;
    let e = task.endDate;
    for (let i = 0; i < 8000; i++) {
      if (s > until) break;
      if (!isOccurrenceSkipped(task, s) && dateInRange(dateStr, s, e)) return { start: s, end: e };
      const next = advanceOccurrence(task, s, e);
      if (!next) break;
      s = next.start;
      e = next.end;
      if (s > until) break;
    }
    return null;
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

  const DELIVERABLE_NAME_MAX_LINES = 5;

  /** @returns {'high'|'medium'|'low'} */
  function deliverableNormalizedImportance(importanceRaw) {
    return importanceRaw === "high" || importanceRaw === "low" ? importanceRaw : "medium";
  }

  /**
   * @param {HTMLElement} el
   * @param {'high'|'medium'|'low'} imp
   */
  function applyDeliverableImpBand(el, imp) {
    if (!(el instanceof HTMLElement)) return;
    el.classList.remove("deliverable-imp-band--high", "deliverable-imp-band--medium", "deliverable-imp-band--low");
    el.classList.add(`deliverable-imp-band--${deliverableNormalizedImportance(imp)}`);
  }

  /** @param {HTMLTextAreaElement} ta */
  function approximateTextareaLineHeightPx(ta) {
    const cs = window.getComputedStyle(ta);
    const lhRaw = cs.lineHeight;
    const lhNum = parseFloat(lhRaw);
    if (Number.isFinite(lhNum) && lhNum > 0) return lhNum;
    const fs = parseFloat(cs.fontSize);
    const base = Number.isFinite(fs) && fs > 0 ? fs : 16;
    return Math.round(base * 1.4);
  }

  /** `.deliverable-editor`의 `--deliverable-row-h`와 동일한 바깥 높이(px). select/입력행 높이와 맞춤. */
  function getDeliverableRowOuterHeightPx(ta) {
    const ed = ta.closest(".deliverable-editor");
    if (!ed) return null;
    const raw = getComputedStyle(ed).getPropertyValue("--deliverable-row-h").trim();
    if (!raw) return null;
    const remMatch = raw.match(/^([\d.]+)\s*rem$/i);
    if (remMatch) {
      const rem = parseFloat(remMatch[1]);
      const rootFs = parseFloat(getComputedStyle(document.documentElement).fontSize);
      if (Number.isFinite(rem) && Number.isFinite(rootFs) && rootFs > 0) return rem * rootFs;
    }
    const pxMatch = raw.match(/^([\d.]+)\s*px$/i);
    if (pxMatch) {
      const px = parseFloat(pxMatch[1]);
      return Number.isFinite(px) ? px : null;
    }
    return null;
  }

  /** 산출물명: 줄바꿈 자동 높이, 최대 5줄 후 스크롤 */
  function fitDeliverableNameField(ta) {
    if (!(ta instanceof HTMLTextAreaElement)) return;
    ta.style.overflowY = "hidden";
    const cs = window.getComputedStyle(ta);
    const lh = approximateTextareaLineHeightPx(ta);
    const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    const bt = parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth);
    const rowOuterPx = getDeliverableRowOuterHeightPx(ta);
    const fallbackMin = lh + padY + bt;
    const minH = rowOuterPx != null && rowOuterPx > 0 ? rowOuterPx : fallbackMin;
    const maxH = lh * DELIVERABLE_NAME_MAX_LINES + padY + bt;
    ta.style.minHeight = `${minH}px`;
    ta.style.maxHeight = `${maxH}px`;
    ta.style.height = "0px";
    const need = ta.scrollHeight;
    const clamped = Math.min(Math.max(need, minH), maxH);
    ta.style.height = `${clamped}px`;
    ta.style.overflowY = need > maxH + 0.5 ? "auto" : "hidden";
  }

  /** @param {HTMLTextAreaElement} ta */
  /** 입력행(머리줄): 등급 띠 + 산출물명 높이 */
  function refreshDeliverableHeaderUI() {
    syncDeliverableHeadImpBandFromSelect();
    if (deliverableNameInput instanceof HTMLTextAreaElement) {
      queueMicrotask(() => fitDeliverableNameField(deliverableNameInput));
    }
  }

  function bindDeliverableNameTextareaBehavior(ta) {
    ta.addEventListener("input", () => {
      fitDeliverableNameField(ta);
      updateActualEffortPreview();
    });
    ta.addEventListener("paste", () => {
      queueMicrotask(() => {
        fitDeliverableNameField(ta);
        updateActualEffortPreview();
      });
    });
    ta.addEventListener(
      "keydown",
      /** @param {KeyboardEvent} e */
      (e) => {
        if (e.key !== "Enter" || e.ctrlKey || e.altKey || e.metaKey) return;
        if (e.shiftKey) return;
        e.preventDefault();
      }
    );
  }

  function syncDeliverableHeadImpBandFromSelect() {
    if (!(deliverableEditorHead instanceof HTMLElement)) return;
    deliverableEditorHead.classList.remove(
      "deliverable-imp-band--high",
      "deliverable-imp-band--medium",
      "deliverable-imp-band--low"
    );
  }

  function normalizeDeliverableCreatedAt(rawCreatedAt, id) {
    const n = Number(rawCreatedAt);
    if (Number.isFinite(n) && n > 0) return Math.floor(n);
    if (typeof id === "string") {
      const m = id.match(/^d-(\d+)-/);
      if (m) {
        const fromId = Number(m[1]);
        if (Number.isFinite(fromId) && fromId > 0) return Math.floor(fromId);
      }
    }
    return null;
  }

  function sortDeliverablesForView(rows) {
    return rows
      .map((row, idx) => ({ ...row, __idx: idx }))
      .sort((a, b) => {
        const impDiff = (IMP_ORDER[a.importance] ?? 1) - (IMP_ORDER[b.importance] ?? 1);
        if (impDiff !== 0) return impDiff;
        const aCreated = Number.isFinite(a.createdAt) ? Number(a.createdAt) : null;
        const bCreated = Number.isFinite(b.createdAt) ? Number(b.createdAt) : null;
        if (aCreated != null && bCreated != null && aCreated !== bCreated) return aCreated - bCreated;
        return a.__idx - b.__idx;
      })
      .map(({ __idx, ...row }) => row);
  }

  function normalizeDeliverables(rawList) {
    if (!Array.isArray(rawList)) return [];
    return rawList
      .map((row, idx) => {
        const name = row && row.name != null ? String(row.name).trim() : "";
        if (!name) return null;
        const importance = row && (row.importance === "high" || row.importance === "low") ? row.importance : "medium";
        const id = row && row.id ? String(row.id) : `d-${Date.now()}-${idx}`;
        return {
          id,
          name,
          importance,
          done: !!(row && row.done),
          createdAt: normalizeDeliverableCreatedAt(row && row.createdAt, id),
        };
      })
      .filter(Boolean);
  }

  function cloneRecurrenceProgress(progressRaw) {
    if (!progressRaw || typeof progressRaw !== "object") return {};
    /** @type {Record<string, Record<string, boolean>>} */
    const out = {};
    Object.entries(progressRaw).forEach(([occStart, row]) => {
      if (!row || typeof row !== "object") return;
      const item = {};
      Object.entries(row).forEach(([id, done]) => {
        item[String(id)] = !!done;
      });
      if (Object.keys(item).length) out[String(occStart)] = item;
    });
    return out;
  }

  function taskProgressRatioOnDate(task, dateStr) {
    const rows = normalizeDeliverables(task.deliverables);
    if (!rows.length) return task.status === "done" ? 1 : 0;
    let viewRows = rows;
    if (task.recurrence && task.recurrence !== "none" && dateStr) {
      const occ = getOccurrenceContaining(task, dateStr);
      if (occ && occ.start !== task.startDate) {
        const progress = cloneRecurrenceProgress(task.recurrenceProgress);
        const rowState = progress[occ.start] || {};
        viewRows = rows.map((r) => ({ ...r, done: !!rowState[r.id] }));
      }
    }
    const totalWeight = viewRows.reduce((acc, row) => acc + importanceWeight(row.importance), 0);
    if (totalWeight <= 0) return 0;
    const doneWeight = viewRows.filter((row) => row.done).reduce((acc, row) => acc + importanceWeight(row.importance), 0);
    return Math.max(0, Math.min(1, doneWeight / totalWeight));
  }

  function taskProgressRatio(task) {
    const rows = normalizeDeliverables(task.deliverables);
    if (!rows.length) return task.status === "done" ? 1 : 0;
    const totalWeight = rows.reduce((acc, row) => acc + importanceWeight(row.importance), 0);
    if (totalWeight <= 0) return 0;
    const doneWeight = rows.filter((row) => row.done).reduce((acc, row) => acc + importanceWeight(row.importance), 0);
    return Math.max(0, Math.min(1, doneWeight / totalWeight));
  }

  function taskSpentMh(task) {
    return taskTotalMh(task) * taskProgressRatio(task);
  }

  function taskDailyMhOnDate(task, dateStr) {
    const occ = getOccurrenceContaining(task, dateStr);
    if (!occ) return 0;
    const totalMh = taskTotalMh(task);
    if (!totalMh) return 0;
    const days = diffDaysInclusive(occ.start, occ.end);
    return totalMh / days;
  }

  function taskSpentDailyMhOnDate(task, dateStr) {
    const occ = getOccurrenceContaining(task, dateStr);
    if (!occ) return 0;
    const spentMh = taskTotalMh(task) * taskProgressRatioOnDate(task, dateStr);
    if (!spentMh) return 0;
    const days = diffDaysInclusive(occ.start, occ.end);
    return spentMh / days;
  }

  function isNonInitialRecurrenceOccurrence(task, dateStr) {
    if (!task || !dateStr) return false;
    if (!task.recurrence || task.recurrence === "none") return false;
    const occ = getOccurrenceContaining(task, dateStr);
    return !!(occ && occ.start !== task.startDate);
  }

  function getModalDeliverablesForDate(task, dateStr) {
    const rows = normalizeDeliverables(task ? task.deliverables : []);
    if (!task || !isNonInitialRecurrenceOccurrence(task, dateStr)) return rows;
    const occ = getOccurrenceContaining(task, dateStr);
    if (!occ) return rows.map((row) => ({ ...row, done: false }));
    const progress = cloneRecurrenceProgress(task.recurrenceProgress);
    const rowState = progress[occ.start] || {};
    return rows.map((row) => ({ ...row, done: !!rowState[row.id] }));
  }

  function formatMh(v) {
    const n = Math.round(v * 10) / 10;
    return Number.isInteger(n) ? String(n) : n.toFixed(1);
  }

  function isOverdueOccurrence(endDateStr, status) {
    if (status === "done") return false;
    return startOfDay(parseDateStr(endDateStr)) < todayStart();
  }

  /**
   * @param {Task} task
   * @param {string} dateStr
   */
  function isTaskOverdueOnDate(task, dateStr) {
    const occ = getOccurrenceContaining(task, dateStr);
    if (!occ) return false;
    return isOverdueOccurrence(occ.end, task.status);
  }

  const STATUS_ORDER = { ready: 0, "on-going": 1, done: 2 };
  const IMP_ORDER = { high: 0, medium: 1, low: 2 };
  const KR_FIXED_HOLIDAYS = [
    { md: "01-01", name: "신정", substitute: true },
    { md: "03-01", name: "삼일절", substitute: true },
    { md: "05-05", name: "어린이날", substitute: true },
    { md: "06-06", name: "현충일", substitute: true },
    { md: "08-15", name: "광복절", substitute: true },
    { md: "10-03", name: "개천절", substitute: true },
    { md: "10-09", name: "한글날", substitute: true },
    { md: "12-25", name: "성탄절", substitute: true },
  ];

  function sortTasksForDots(list) {
    return [...list].sort((a, b) => {
      const oa = STATUS_ORDER[a.status] ?? 9;
      const ob = STATUS_ORDER[b.status] ?? 9;
      if (oa !== ob) return oa - ob;
      const ia = IMP_ORDER[a.importance] ?? 1;
      const ib = IMP_ORDER[b.importance] ?? 1;
      if (ia !== ib) return ia - ib;
      return taskLabel(a).localeCompare(taskLabel(b), "ko");
    });
  }

  const MAX_CALENDAR_DOTS = 8;

  /**
   * 달력 셀 동그라미와 동일한 목록·순서(최대 MAX_CALENDAR_DOTS).
   * @param {string} dateStr
   * @returns {Task[]}
   */
  function getVisibleTasksForCalendarDay(dateStr) {
    const list = tasks.filter((t) => taskCoversDate(t, dateStr));
    return sortTasksForDots(list).slice(0, MAX_CALENDAR_DOTS);
  }

  function toDateStrFromYmd(y, m, d) {
    return `${y}-${pad2(m)}-${pad2(d)}`;
  }

  function mdFromDateStr(dateStr) {
    return dateStr.slice(5);
  }

  function weekdayFromDateStr(dateStr) {
    return parseDateStr(dateStr).getDay();
  }

  function buildKrFixedSubstituteMap(year) {
    /** @type {Map<string, string>} */
    const out = new Map();
    const fixedSet = new Set(KR_FIXED_HOLIDAYS.map((h) => toDateStrFromYmd(year, Number(h.md.slice(0, 2)), Number(h.md.slice(3, 5)))));
    KR_FIXED_HOLIDAYS.forEach((h) => {
      if (!h.substitute) return;
      const base = toDateStrFromYmd(year, Number(h.md.slice(0, 2)), Number(h.md.slice(3, 5)));
      const wd = weekdayFromDateStr(base);
      if (wd !== 0 && wd !== 6) return;
      let cand = addDaysStr(base, 1);
      while (true) {
        const cW = weekdayFromDateStr(cand);
        const blocked = cW === 0 || cW === 6 || fixedSet.has(cand) || out.has(cand);
        if (!blocked) break;
        cand = addDaysStr(cand, 1);
      }
      out.set(cand, `${h.name} 대체휴일`);
    });
    return out;
  }

  function getKoreanHolidayName(dateStr) {
    const y = Number(dateStr.slice(0, 4));
    const md = mdFromDateStr(dateStr);
    const fixed = KR_FIXED_HOLIDAYS.find((h) => h.md === md);
    if (fixed) return fixed.name;
    const subMap = buildKrFixedSubstituteMap(y);
    return subMap.get(dateStr) || "";
  }

  function importanceLabel(imp) {
    if (imp === "high") return "상";
    if (imp === "low") return "하";
    return "중";
  }

  function recurrenceLabel(rec) {
    if (rec === "daily") return "매일";
    if (rec === "weekly") return "매주";
    if (rec === "monthly") return "매월";
    return "반복 없음";
  }

  /** 달력: 바깥 링 = 중요도(크기), 안쪽 점 = 진행 상태 색 */
  function importanceWrapClass(imp) {
    if (imp === "high") return "calendar-cell__dot-wrap calendar-cell__dot-wrap--high";
    if (imp === "low") return "calendar-cell__dot-wrap calendar-cell__dot-wrap--low";
    return "calendar-cell__dot-wrap calendar-cell__dot-wrap--medium";
  }

  function statusDotClass(status) {
    switch (status) {
      case "ready":
        return "calendar-cell__dot--ready";
      case "on-going":
        return "calendar-cell__dot--ongoing";
      case "done":
        return "calendar-cell__dot--done";
      default:
        return "calendar-cell__dot--ready";
    }
  }

  function statusBarColor(status) {
    if (status === "on-going") return "#e8943a";
    if (status === "done") return "repeating-linear-gradient(135deg, #94a3b8 0 1px, #e5e7eb 1px 3px)";
    return "#8b95a5";
  }

  const MODAL_THEME_CLASSES = ["modal__inner--default", "modal__inner--ready", "modal__inner--ongoing", "modal__inner--done"];

  function getEditingTask() {
    if (!editingId) return null;
    return tasks.find((x) => x.id === editingId) || null;
  }

  function getCurrentStatus() {
    return getEditingTask()?.status || draftStatus;
  }

  function getCurrentImportance() {
    return getEditingTask()?.importance || draftImportance;
  }

  function canSetDoneStatusFromModal() {
    if (!deliverableList) return true;
    const checks = deliverableList.querySelectorAll('.deliverable-item input[type="checkbox"]');
    if (!checks.length) return true;
    return Array.from(checks).every((el) => el instanceof HTMLInputElement && el.checked);
  }

  async function enforceDoneStatusConstraint() {
    if (canSetDoneStatusFromModal()) return;
    const current = getCurrentStatus();
    if (current !== "done") return;

    if (editingId) {
      const i = tasks.findIndex((x) => x.id === editingId);
      if (i >= 0) {
        tasks[i] = { ...tasks[i], status: "on-going" };
        await firebaseUpdateTask(editingId, { status: "on-going" });
      }
    } else {
      draftStatus = "on-going";
    }

    modalDefaultWhite = false;
    renderQuickMetaControls();
    applyModalTheme();
    renderCalendar();
    if (!existingTasksWrap.hidden) renderExistingTasksList();
  }

  async function autoPromoteDoneStatusWhenEligible() {
    const rows = collectDeliverablesFromModal();
    if (!rows.length) return;
    if (!rows.every((row) => !!row.done)) return;
    const current = getCurrentStatus();
    if (current === "done") return;

    if (editingId) {
      const i = tasks.findIndex((x) => x.id === editingId);
      if (i >= 0) {
        tasks[i] = { ...tasks[i], status: "done" };
        await firebaseUpdateTask(editingId, { status: "done" });
      }
    } else {
      draftStatus = "done";
    }

    modalDefaultWhite = false;
    renderQuickMetaControls();
    applyModalTheme();
    renderCalendar();
    if (!existingTasksWrap.hidden) renderExistingTasksList();
  }

  async function autoPromoteOngoingWhenStarted() {
    const rows = collectDeliverablesFromModal();
    if (!rows.length) return;
    const anyDone = rows.some((row) => !!row.done);
    if (!anyDone) return;
    const allDone = rows.every((row) => !!row.done);
    if (allDone) return;
    const current = getCurrentStatus();
    if (current !== "ready") return;

    if (editingId) {
      const i = tasks.findIndex((x) => x.id === editingId);
      if (i >= 0) {
        tasks[i] = { ...tasks[i], status: "on-going" };
        await firebaseUpdateTask(editingId, { status: "on-going" });
      }
    } else {
      draftStatus = "on-going";
    }

    modalDefaultWhite = false;
    renderQuickMetaControls();
    applyModalTheme();
    renderCalendar();
    if (!existingTasksWrap.hidden) renderExistingTasksList();
  }

  function renderQuickMetaControls() {
    const status = getCurrentStatus();
    const imp = getCurrentImportance();
    if (quickStatusGroup) {
      const buttons = quickStatusGroup.querySelectorAll("button[data-status]");
      const canDone = canSetDoneStatusFromModal();
      buttons.forEach((btn) => {
        const isDoneBtn = btn.getAttribute("data-status") === "done";
        const disabledDone = isDoneBtn && !canDone;
        const active = !disabledDone && btn.getAttribute("data-status") === status;
        btn.toggleAttribute("disabled", disabledDone);
        btn.setAttribute("aria-disabled", disabledDone ? "true" : "false");
        btn.classList.toggle("modal__quick-btn--disabled-done", disabledDone);
        btn.classList.toggle("modal__quick-btn--active", active);
        btn.setAttribute("aria-checked", active ? "true" : "false");
      });
    }
    if (quickImportanceGroup) {
      const buttons = quickImportanceGroup.querySelectorAll("button[data-importance]");
      buttons.forEach((btn) => {
        const active = btn.getAttribute("data-importance") === imp;
        btn.classList.toggle("modal__quick-btn--active", active);
        btn.setAttribute("aria-checked", active ? "true" : "false");
      });
    }
  }

  function applyModalTheme() {
    MODAL_THEME_CLASSES.forEach((c) => modalInner.classList.remove(c));
    if (modalDefaultWhite && !editingId) {
      modalInner.classList.add("modal__inner--default");
      return;
    }
    const s = getCurrentStatus();
    if (s === "ready") modalInner.classList.add("modal__inner--ready");
    else if (s === "on-going") modalInner.classList.add("modal__inner--ongoing");
    else if (s === "done") modalInner.classList.add("modal__inner--done");
    else modalInner.classList.add("modal__inner--ready");
  }

  function normalizeTask(raw) {
    const effortValueNum = Number(raw.effortValue);
    const effortValue = Number.isFinite(effortValueNum) && effortValueNum > 0 ? effortValueNum : null;
    return {
      id: raw.id,
      title: raw.title != null ? String(raw.title) : "",
      description: raw.description != null ? String(raw.description) : "",
      status: raw.status || "ready",
      startDate: raw.startDate,
      endDate: raw.endDate,
      recurrence:
        raw.recurrence === "daily" ||
        raw.recurrence === "weekly" ||
        raw.recurrence === "monthly"
          ? raw.recurrence
          : "none",
      recurrenceUntil: raw.recurrenceUntil != null && raw.recurrenceUntil !== "" ? raw.recurrenceUntil : null,
      recurrenceProgress: cloneRecurrenceProgress(raw.recurrenceProgress),
      recurrenceSkipStarts: normalizeRecurrenceSkipStarts(raw.recurrenceSkipStarts),
      importance: raw.importance === "high" || raw.importance === "low" ? raw.importance : "medium",
      effortValue,
      effortUnit: raw.effortUnit === "MD" ? "MD" : "MH",
      deliverables: normalizeDeliverables(raw.deliverables),
    };
  }

  function loadRecurrenceAlertState() {
    try {
      const raw = localStorage.getItem(RECURRENCE_ALERT_STATE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  function saveRecurrenceAlertState(state) {
    try {
      localStorage.setItem(RECURRENCE_ALERT_STATE_KEY, JSON.stringify(state || {}));
    } catch {
      // ignore storage quota/permission errors
    }
  }

  function recurrenceBoundaryKey(rec, dateStr) {
    const d = parseDateStr(dateStr);
    if (rec === "daily") return `week:${d.getFullYear()}-${endOfWeekStr(dateStr)}`;
    if (rec === "weekly") return `month:${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
    if (rec === "monthly") return `year:${d.getFullYear()}`;
    return "none";
  }

  async function checkAndHandleRecurrenceExtension() {
    if (!tasks.length) return;
    const today = toDateStrFromDate(new Date());
    let changedByMigration = false;
    tasks = tasks.map((task) => {
      if (!task || !task.id || !task.recurrence || task.recurrence === "none") return task;
      if (task.recurrenceUntil) return task;
      const autoCap = getRecurrenceWindowEnd(task.recurrence, task.endDate);
      if (!autoCap) return task;
      changedByMigration = true;
      return { ...task, recurrenceUntil: autoCap };
    });
    if (changedByMigration) {
      await saveTasks();
    }

    const groups = [
      { rec: "daily", title: "반복 연장 확인", msg: "매일 반복을 한주 연장할건가요?" },
      { rec: "weekly", title: "반복 연장 확인", msg: "매주 반복을 한달 연장할건가요?" },
      { rec: "monthly", title: "반복 연장 확인", msg: "매월 반복을 일년 연장할건가요?" },
    ];
    const state = loadRecurrenceAlertState();
    let changed = false;

    for (const g of groups) {
      const expired = tasks.filter((t) => t.recurrence === g.rec && t.recurrenceUntil && t.recurrenceUntil < today);
      if (!expired.length) continue;
      const boundary = recurrenceBoundaryKey(g.rec, today);
      if (state[g.rec] === boundary) continue;

      const ok = await openConfirmDialog(g.msg, {
        title: g.title,
        okLabel: "Yes",
        cancelLabel: "No",
        showCancel: true,
      });

      if (ok) {
        const nextCap = getRecurrenceWindowEnd(g.rec, today);
        if (nextCap) {
          tasks = tasks.map((t) => (t.recurrence === g.rec && t.recurrenceUntil && t.recurrenceUntil < today ? { ...t, recurrenceUntil: nextCap } : t));
          changed = true;
        }
      } else {
        tasks = tasks.map((t) =>
          t.recurrence === g.rec && t.recurrenceUntil && t.recurrenceUntil < today ? { ...t, recurrence: "none", recurrenceUntil: null } : t
        );
        changed = true;
      }

      state[g.rec] = boundary;
      saveRecurrenceAlertState(state);
    }

    if (changed) {
      await saveTasks();
      renderCalendar();
      updateSearchResults();
      if (!taskModal.hidden) renderExistingTasksList();
    }
  }

  function toFirebaseTasksMap(list) {
    /** @type {Record<string, Task>} */
    const out = {};
    list.forEach((t) => {
      if (!t.id) return;
      out[t.id] = {
        id: t.id,
        title: t.title || "",
        description: t.description || "",
        status: t.status || "ready",
        importance: t.importance || "medium",
        startDate: t.startDate,
        endDate: t.endDate,
        recurrence: t.recurrence || "none",
        recurrenceUntil: t.recurrenceUntil || null,
        recurrenceProgress: cloneRecurrenceProgress(t.recurrenceProgress),
        recurrenceSkipStarts: normalizeRecurrenceSkipStarts(t.recurrenceSkipStarts),
        effortValue: Number.isFinite(Number(t.effortValue)) && Number(t.effortValue) > 0 ? Number(t.effortValue) : null,
        effortUnit: t.effortUnit === "MD" ? "MD" : "MH",
        deliverables: normalizeDeliverables(t.deliverables),
      };
    });
    return out;
  }

  async function loadTasks() {
    if (!window.firebase || !window.firebase.apps) return;
    const app = window.firebase.apps.length ? window.firebase.app() : window.firebase.initializeApp(FIREBASE_CONFIG);
    firebaseDb = window.firebase.database(app);
    firebaseTasksRef = firebaseDb.ref(FIREBASE_TASKS_PATH);
    const metaRef = firebaseDb.ref(FIREBASE_META_PATH);

    firebaseTasksRef.on(
      "value",
      (snap) => {
        const v = snap.val();
        const list = v && typeof v === "object" ? Object.values(v) : [];
        tasks = list.map(normalizeTask);
        renderCalendar();
        updateSearchResults();
        if (!taskModal.hidden) renderExistingTasksList();
      },
      (err) => {
        console.error("Firebase sync error:", err);
      }
    );

    // 메타 경로가 없더라도 생성될 수 있도록 no-op write 보장
    metaRef.update({ connectedAt: new Date().toISOString() }).catch(() => {});
  }

  async function saveTasks() {
    if (!firebaseDb || !firebaseTasksRef) throw new Error("Firebase not connected");
    const payload = toFirebaseTasksMap(tasks);
    await firebaseTasksRef.set(payload);
    await firebaseDb.ref(FIREBASE_META_PATH).update({ updatedAt: new Date().toISOString() });
  }

  function toFirebaseTask(t) {
    return {
      id: t.id,
      title: t.title || "",
      description: t.description || "",
      status: t.status || "ready",
      importance: t.importance || "medium",
      startDate: t.startDate,
      endDate: t.endDate,
      recurrence: t.recurrence || "none",
      recurrenceUntil: t.recurrenceUntil || null,
      recurrenceProgress: cloneRecurrenceProgress(t.recurrenceProgress),
      recurrenceSkipStarts: normalizeRecurrenceSkipStarts(t.recurrenceSkipStarts),
      effortValue: Number.isFinite(Number(t.effortValue)) && Number(t.effortValue) > 0 ? Number(t.effortValue) : null,
      effortUnit: t.effortUnit === "MD" ? "MD" : "MH",
      deliverables: normalizeDeliverables(t.deliverables),
      updatedAt: new Date().toISOString(),
    };
  }

  async function firebaseCreateTask(task) {
    if (!firebaseDb || !firebaseTasksRef || !task.id) return;
    await firebaseTasksRef.child(task.id).set({ ...toFirebaseTask(task), createdAt: new Date().toISOString() });
    await firebaseDb.ref(FIREBASE_META_PATH).update({ updatedAt: new Date().toISOString() });
  }

  async function firebaseUpdateTask(taskId, patch) {
    if (!firebaseDb || !firebaseTasksRef || !taskId) return;
    await firebaseTasksRef.child(taskId).update({ ...patch, updatedAt: new Date().toISOString() });
    await firebaseDb.ref(FIREBASE_META_PATH).update({ updatedAt: new Date().toISOString() });
  }

  async function firebaseDeleteTask(taskId) {
    if (!firebaseDb || !firebaseTasksRef || !taskId) return;
    await firebaseTasksRef.child(taskId).remove();
    await firebaseDb.ref(FIREBASE_META_PATH).update({ updatedAt: new Date().toISOString() });
  }

  async function waitForFirebaseReady(timeoutMs = 8000) {
    const start = Date.now();
    while (!firebaseDb || !firebaseTasksRef) {
      if (Date.now() - start > timeoutMs) {
        throw new Error("Firebase 연결이 아직 준비되지 않았습니다. 잠시 후 다시 시도해 주세요.");
      }
      await new Promise((r) => setTimeout(r, 120));
    }
  }

  function uuid() {
    return crypto.randomUUID ? crypto.randomUUID() : `t-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  function tasksForCalendarDay(y, m, d) {
    const ds = toDateStr(y, m, d);
    return tasks.filter((t) => taskCoversDate(t, ds));
  }

  function goToToday() {
    const t = new Date();
    viewYear = t.getFullYear();
    viewMonth = t.getMonth();
    renderCalendar();
  }

  function taskLabel(t) {
    const title = (t.title || "").trim();
    if (title) return title;
    const d = (t.description || "").trim();
    return d ? d.slice(0, 48) : "(제목 없음)";
  }

  function matchesSearch(task) {
    const q = (searchInput.value || "").trim().toLowerCase();
    const st = searchStatus.value;
    if (st !== "all" && task.status !== st) return false;
    if (!q) return true;
    const title = (task.title || "").toLowerCase();
    const desc = (task.description || "").toLowerCase();
    return title.includes(q) || desc.includes(q);
  }

  function forEachMultiDaySegment(task, fn) {
    const rec = task.recurrence || "none";
    if (rec === "none") {
      if (task.startDate < task.endDate) fn(task.startDate, task.endDate);
      return;
    }
    const until = getRecurrenceCap(task);
    let s = task.startDate;
    let e = task.endDate;
    for (let i = 0; i < 8000; i++) {
      if (s > until) break;
      if (s < e) fn(s, e);
      const next = advanceOccurrence(task, s, e);
      if (!next) break;
      s = next.start;
      e = next.end;
    }
  }

  /**
   * @param {string} startStr
   * @param {string} endStr
   * @param {HTMLElement} grid
   * @returns {string[][]}
   */
  function getSegmentsInGrid(startStr, endStr, grid) {
    const cells = [...grid.querySelectorAll(".calendar-cell[data-date-str]")];
    const indexMap = new Map(cells.map((c, i) => [c.dataset.dateStr, i]));
    const dates = [];
    const d = parseDateStr(startStr);
    const end = parseDateStr(endStr);
    const cur = new Date(d);
    while (cur <= end) {
      const ds = toDateStrFromDate(cur);
      if (indexMap.has(ds)) dates.push(ds);
      cur.setDate(cur.getDate() + 1);
    }
    if (dates.length < 1) return [];
    const segments = [];
    let run = [dates[0]];
    for (let i = 1; i < dates.length; i++) {
      const prevI = indexMap.get(dates[i - 1]);
      const currI = indexMap.get(dates[i]);
      const prevRow = Math.floor(/** @type {number} */ (prevI) / 7);
      const currRow = Math.floor(/** @type {number} */ (currI) / 7);
      if (currI === prevI + 1 && currRow === prevRow) {
        run.push(dates[i]);
      } else {
        if (run.length >= 1) segments.push(run);
        run = [dates[i]];
      }
    }
    if (run.length >= 1) segments.push(run);
    return segments;
  }

  function rangeLineColorForTask(task, segmentEndStr) {
    if (task.status !== "done" && startOfDay(parseDateStr(segmentEndStr)) < todayStart()) {
      return "#e53935";
    }
    switch (task.status) {
      case "on-going":
        return "#e8943a";
      case "done":
        return "repeating-linear-gradient(135deg, #94a3b8 0 1px, #e5e7eb 1px 3px)";
      default:
        return "#8b95a5";
    }
  }

  function renderMultiDayRangeLines(finalPass = false) {
    if (!calendarGrid) return;
    const layer = calendarGrid;
    layer.querySelectorAll(".calendar-range-line").forEach((el) => el.remove());
    const gridRect = calendarGrid.getBoundingClientRect();
    if (gridRect.width < 1 || gridRect.height < 1) return;
    const BAR_HEIGHT = 6;
    const BAR_GAP = 4;
    const LINE_STEP = BAR_HEIGHT + BAR_GAP;
    const HEADER_BASE_PX = 24; // 날짜/공휴일/배지 아래 최소 시작 높이
    const HEADER_EXTRA_PX = 6; // 날짜/배지와 수평바 간 최소 간격
    /** @type {Record<number, number>} */
    const rowSlots = {};
    /** @type {Map<number, Map<string, Set<number>>>} row별 날짜별 lane 점유 */
    const rowDayLaneUsage = new Map();
    /** @type {Map<string, number>} 날짜별 실제 점유 라인 수 */
    const cellLaneMap = new Map();
    /** @type {Map<string, number>} 날짜별 실제 그려진 바의 최대 하단 절대좌표 */
    const dateBarBottomAbsMap = new Map();
    /** @type {Record<number, number>} row별 공통 바 시작 오프셋 */
    const rowBaseTop = {};

    const allCells = [...calendarGrid.querySelectorAll(".calendar-cell[data-date-str]")];
    const cellByDate = new Map(allCells.map((cell) => [cell.dataset.dateStr || "", cell]));
    if (!finalPass) barDotLayoutFixAttempts = 0;

    /**
     * 해당 셀에서 날짜 텍스트/공수 배지 하단을 피하도록 바 기준 Y 오프셋 계산
     * @param {HTMLElement} cell
     */
    const headerClearance = (cell) => {
      const numEl = /** @type {HTMLElement | null} */ (cell.querySelector(".calendar-cell__num"));
      const holidayEl = /** @type {HTMLElement | null} */ (cell.querySelector(".calendar-cell__holiday-name"));
      const badgeEl = /** @type {HTMLElement | null} */ (cell.querySelector(".calendar-cell__ongoing-count"));
      const numBottom = numEl ? numEl.offsetTop + numEl.offsetHeight : 0;
      const holidayBottom = holidayEl ? holidayEl.offsetTop + holidayEl.offsetHeight : 0;
      const badgeBottom = badgeEl && !badgeEl.hidden ? badgeEl.offsetTop + badgeEl.offsetHeight : 0;
      const contentBottom = Math.max(numBottom, holidayBottom, badgeBottom);
      // 셀 높이에 비례해 시작점을 내리면(예: cellHeight * 0.32),
      // 행이 커질수록 바도 같이 아래로 밀려 dot 영역 침범이 반복된다.
      // 따라서 시작점은 "헤더 콘텐츠 하단 + 여유"를 기준으로만 잡는다.
      return Math.max(HEADER_BASE_PX, contentBottom + HEADER_EXTRA_PX);
    };

    allCells.forEach((cell, idx) => {
      const row = Math.floor(idx / 7);
      const clr = headerClearance(cell);
      rowBaseTop[row] = Math.max(rowBaseTop[row] || 0, clr);
    });

    // 멀티데이 일정은 가로로 이어서 표시
    tasks.forEach((task) => {
      forEachMultiDaySegment(task, (startStr, endStr) => {
        const segments = getSegmentsInGrid(startStr, endStr, calendarGrid);
        segments.forEach((dateRun) => {
          const firstDs = dateRun[0];
          const lastDs = dateRun[dateRun.length - 1];
          const firstCell = cellByDate.get(firstDs);
          const lastCell = cellByDate.get(lastDs);
          if (!firstCell || !lastCell) return;
          const idx = allCells.indexOf(firstCell);
          const row = Math.floor(idx / 7);
          let dayUsage = rowDayLaneUsage.get(row);
          if (!dayUsage) {
            dayUsage = new Map();
            rowDayLaneUsage.set(row, dayUsage);
          }

          let lane = 0;
          while (true) {
            const occupied = dateRun.some((ds) => {
              const used = dayUsage.get(ds);
              return !!used && used.has(lane);
            });
            if (!occupied) break;
            lane += 1;
          }

          dateRun.forEach((ds) => {
            let used = dayUsage.get(ds);
            if (!used) {
              used = new Set();
              dayUsage.set(ds, used);
            }
            used.add(lane);
            const prev = cellLaneMap.get(ds) || 0;
            if (lane + 1 > prev) cellLaneMap.set(ds, lane + 1);
          });
          rowSlots[row] = Math.max(rowSlots[row] || 0, lane + 1);

          const r1 = {
            left: firstCell.offsetLeft,
            top: firstCell.offsetTop,
            right: firstCell.offsetLeft + firstCell.offsetWidth,
            width: firstCell.offsetWidth,
            height: firstCell.offsetHeight,
          };
          const r2 = {
            left: lastCell.offsetLeft,
            top: lastCell.offsetTop,
            right: lastCell.offsetLeft + lastCell.offsetWidth,
            width: lastCell.offsetWidth,
            height: lastCell.offsetHeight,
          };
          const impKey = task.importance === "high" ? "high" : task.importance === "low" ? "low" : "medium";
          const impToken = "■ ";
          const stKey = task.status === "on-going" ? "ongoing" : task.status === "done" ? "done" : "ready";
          const rowBase = rowBaseTop[row] || HEADER_BASE_PX;
          const lineTop = Math.round(r1.top + rowBase + lane * LINE_STEP);
          const line = document.createElement("div");
          line.className = "calendar-range-line";
          line.style.background = rangeLineColorForTask(task, endStr);
          line.dataset.tipToken = impToken;
          line.dataset.tipBody = `${taskLabel(task)}`;
          line.classList.add(`calendar-range-line--tip-${stKey}`, `calendar-range-line--tip-imp-${impKey}`);
          line.tabIndex = 0;
          const updateTipAnchorPos = (e) => {
            if (!(e instanceof MouseEvent)) return;
            const rr = line.getBoundingClientRect();
            const x = Math.max(0, Math.min(rr.width, e.clientX - rr.left));
            const y = Math.max(0, Math.min(rr.height, e.clientY - rr.top));
            line.style.setProperty("--tip-x", `${Math.round(x)}px`);
            line.style.setProperty("--tip-y", `${Math.round(y)}px`);
          };
          line.addEventListener("mouseenter", updateTipAnchorPos);
          line.addEventListener("mousemove", updateTipAnchorPos);
          const openFromLine = () => openModal(firstDs, task.id);
          bindRangeDrag(line, task, firstDs);
          line.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (suppressRangeClickTaskId === task.id && Date.now() <= suppressRangeClickUntil) return;
            openFromLine();
          });
          line.addEventListener("keydown", (e) => {
            if (e.key !== "Enter" && e.key !== " ") return;
            e.preventDefault();
            e.stopPropagation();
            openFromLine();
          });
          line.style.left = Math.round(r1.left) + "px";
          line.style.top = lineTop + "px";
          line.style.width = r2.right - r1.left + "px";
          layer.appendChild(line);
          const lineBottomAbs = lineTop + BAR_HEIGHT;
          dateRun.forEach((ds) => {
            const prevBottom = dateBarBottomAbsMap.get(ds) || -Infinity;
            if (lineBottomAbs > prevBottom) dateBarBottomAbsMap.set(ds, lineBottomAbs);
          });
        });
      });
    });

    // 당일 일정(occurrence가 하루짜리)도 같은 트랙 아래로 순차 배치
    allCells.forEach((cell, idx) => {
      const ds = cell.dataset.dateStr || "";
      if (!ds) return;
      const row = Math.floor(idx / 7);
      const list = sortTasksForDots(tasks.filter((t) => taskCoversDate(t, ds)));
      const singleDay = list.filter((t) => {
        const occ = getOccurrenceContaining(t, ds);
        return !!occ && occ.start === ds && occ.end === ds;
      });
      if (!singleDay.length) return;

      const r = {
        left: cell.offsetLeft,
        top: cell.offsetTop,
        right: cell.offsetLeft + cell.offsetWidth,
        width: cell.offsetWidth,
        height: cell.offsetHeight,
      };
      const rowBase = rowBaseTop[row] || HEADER_BASE_PX;
      const baseTop = Math.round(r.top + rowBase);
      singleDay.forEach((t) => {
        const lane = cellLaneMap.get(ds) || 0;
        cellLaneMap.set(ds, lane + 1);
        rowSlots[row] = Math.max(rowSlots[row] || 0, lane + 1);
        const impKey = t.importance === "high" ? "high" : t.importance === "low" ? "low" : "medium";
        const impToken = "■ ";
        const stKey = t.status === "on-going" ? "ongoing" : t.status === "done" ? "done" : "ready";
        const line = document.createElement("div");
        line.className = "calendar-range-line";
        line.style.background = statusBarColor(t.status);
        line.dataset.tipToken = impToken;
        line.dataset.tipBody = `${taskLabel(t)}`;
        line.classList.add(`calendar-range-line--tip-${stKey}`, `calendar-range-line--tip-imp-${impKey}`);
        line.tabIndex = 0;
        const updateTipAnchorPos = (e) => {
          if (!(e instanceof MouseEvent)) return;
          const rr = line.getBoundingClientRect();
          const x = Math.max(0, Math.min(rr.width, e.clientX - rr.left));
          const y = Math.max(0, Math.min(rr.height, e.clientY - rr.top));
          line.style.setProperty("--tip-x", `${Math.round(x)}px`);
          line.style.setProperty("--tip-y", `${Math.round(y)}px`);
        };
        line.addEventListener("mouseenter", updateTipAnchorPos);
        line.addEventListener("mousemove", updateTipAnchorPos);
        const openFromLine = () => openModal(ds, t.id);
        bindRangeDrag(line, t, ds);
        line.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (suppressRangeClickTaskId === t.id && Date.now() <= suppressRangeClickUntil) return;
          openFromLine();
        });
        line.addEventListener("keydown", (e) => {
          if (e.key !== "Enter" && e.key !== " ") return;
          e.preventDefault();
          e.stopPropagation();
          openFromLine();
        });
        line.style.left = Math.round(r.left) + "px";
        line.style.top = baseTop + lane * LINE_STEP + "px";
        line.style.width = Math.round(r.width) + "px";
        layer.appendChild(line);
        const lineBottomAbs = r.top + rowBase + lane * LINE_STEP + BAR_HEIGHT;
        const prevBottom = dateBarBottomAbsMap.get(ds) || -Infinity;
        if (lineBottomAbs > prevBottom) dateBarBottomAbsMap.set(ds, lineBottomAbs);
      });
    });

    /** @type {Record<number, number>} */
    const rowLaneMax = {};
    allCells.forEach((cell, idx) => {
      const ds = cell.dataset.dateStr || "";
      const lanes = cellLaneMap.get(ds) || 0;
      cell.style.setProperty("--range-lanes", String(lanes));
      const row = Math.floor(idx / 7);
      rowLaneMax[row] = Math.max(rowLaneMax[row] || 0, lanes);
    });
    if (!finalPass) {
      /** @type {Record<number, number>} */
      const rowOverflowPx = {};
      allCells.forEach((cell, idx) => {
        const ds = cell.dataset.dateStr || "";
        if (!ds) return;
        const barBottomAbs = dateBarBottomAbsMap.get(ds);
        if (barBottomAbs == null) return;
        const row = Math.floor(idx / 7);
        const dotsEl = /** @type {HTMLElement | null} */ (cell.querySelector(".calendar-cell__dots"));
        // 근본식:
        // [마지막 바 하단 + 3px] <= [동그라미 시작]
        // 동그라미 시작은 셀 높이와 함께 이동하므로, 현재 셀에서
        // bottomReserve = (cellHeight - dotsTop) 를 추출해 필요한 최소 높이를 역산한다.
        const dotsTop = dotsEl ? dotsEl.offsetTop : cell.offsetHeight;
        const bottomReserve = Math.max(0, cell.offsetHeight - dotsTop);
        const barBottomRel = barBottomAbs - cell.offsetTop;
        const requiredHeight = barBottomRel + 3 + bottomReserve;
        const overflow = Math.ceil(requiredHeight - cell.offsetHeight);
        if (overflow > 0) rowOverflowPx[row] = Math.max(rowOverflowPx[row] || 0, overflow);
      });
      applyCalendarRowHeights(rowSlots, rowLaneMax, cellLaneMap, rowOverflowPx, rowBaseTop, LINE_STEP, BAR_HEIGHT);
      // 행 높이 적용 후 셀 좌표가 바뀌므로 한 번 더 재렌더링해 정렬을 확정한다.
      requestAnimationFrame(() => renderMultiDayRangeLines(true));
      return;
    }
    // final pass에서도 실제 DOM 좌표 기준으로
    // [마지막 바 하단 + 3px <= 동그라미 시작] 불변식을 검사/보정한다.
    if (barDotLayoutFixAttempts < 20) {
      /** @type {Record<number, number>} */
      const overlapByRow = {};
      const lines = [...layer.querySelectorAll(".calendar-range-line")];
      allCells.forEach((cell, idx) => {
        const row = Math.floor(idx / 7);
        const dotsEl = /** @type {HTMLElement | null} */ (cell.querySelector(".calendar-cell__dots"));
        if (!dotsEl) return;
        const dotsTop = dotsEl.offsetTop;
        const cellTop = cell.offsetTop;
        const cellBottom = cell.offsetTop + cell.offsetHeight;
        const cellLeft = cell.offsetLeft;
        const cellRight = cell.offsetLeft + cell.offsetWidth;
        let maxBottomInCell = -Infinity;
        lines.forEach((line) => {
          const lineTop = line.offsetTop;
          const lineBottom = line.offsetTop + BAR_HEIGHT;
          const lineLeft = line.offsetLeft;
          const lineRight = line.offsetLeft + line.offsetWidth;
          // 같은 행(세로 교차) + 같은 날짜 칸(x 교차)인 라인만 검사
          if (lineBottom <= cellTop || lineTop >= cellBottom) return;
          if (lineRight <= cellLeft || lineLeft >= cellRight) return;
          const relBottom = lineBottom - cellTop;
          if (relBottom > maxBottomInCell) maxBottomInCell = relBottom;
        });
        if (!Number.isFinite(maxBottomInCell)) return;
        const overlap = Math.ceil(maxBottomInCell + 3 - dotsTop);
        if (overlap > 0) overlapByRow[row] = Math.max(overlapByRow[row] || 0, overlap);
      });

      if (Object.keys(overlapByRow).length > 0) {
        const currentRows = getComputedStyle(calendarGrid).gridTemplateRows
          .split(" ")
          .map((x) => parseFloat(x) || 0);
        const rowCount = Math.ceil(allCells.length / 7);
        const nextRows = [];
        for (let row = 0; row < rowCount; row++) {
          const base = currentRows[row] || 0;
          // 드래그 후 바가 몰린 케이스에서 재침범을 막기 위해 버퍼를 크게 준다.
          nextRows.push(`${base + (overlapByRow[row] || 0) + 20}px`);
        }
        calendarGrid.style.gridTemplateRows = nextRows.join(" ");
        barDotLayoutFixAttempts += 1;
        requestAnimationFrame(() => renderMultiDayRangeLines(true));
        return;
      }
    }
    // final pass에서는 확정된 레이아웃 기준으로 그린 결과만 유지
  }

  /**
   * 일정 밀도에 따라 해당 주의 행 높이를 늘린다.
   * @param {Record<number, number>} rowSlots
   */
  function applyCalendarRowHeights(
    rowSlots,
    rowLaneMax = {},
    cellLaneMap = new Map(),
    rowOverflowPx = {},
    rowBaseTop = {},
    lineStep = 10,
    barHeight = 6
  ) {
    if (!calendarGrid) return;
    const cells = [...calendarGrid.querySelectorAll(".calendar-cell[data-date-str]")];
    const rowCount = Math.ceil(cells.length / 7);
    if (!rowCount) return;

    const rows = [];
    for (let row = 0; row < rowCount; row++) {
      const inRow = cells.slice(row * 7, row * 7 + 7);
      let maxTasks = 0;
      let rowRequiredHeight = 0;
      let maxDotsHeight = 0;
      inRow.forEach((cell) => {
        const ds = cell.dataset.dateStr;
        if (!ds) return;
        const c = tasks.filter((t) => taskCoversDate(t, ds)).length;
        if (c > maxTasks) maxTasks = c;

        // 셀별 실제 헤더 하단(날짜 숫자/공휴일명/우측 배지)을 측정해
        // 수평바 스택 + 하단 dot 영역 보호 높이를 계산한다.
        const numEl = /** @type {HTMLElement | null} */ (cell.querySelector(".calendar-cell__num"));
        const holidayEl = /** @type {HTMLElement | null} */ (cell.querySelector(".calendar-cell__holiday-name"));
        const badgeEl = /** @type {HTMLElement | null} */ (cell.querySelector(".calendar-cell__ongoing-count"));
        const numBottom = numEl ? numEl.offsetTop + numEl.offsetHeight : 0;
        const holidayBottom = holidayEl ? holidayEl.offsetTop + holidayEl.offsetHeight : 0;
        const badgeBottom = badgeEl && !badgeEl.hidden ? badgeEl.offsetTop + badgeEl.offsetHeight : 0;
        const contentBottom = Math.max(numBottom, holidayBottom, badgeBottom);

        const lanes = cellLaneMap.get(ds) || 0;
        const laneStackHeight = lanes > 0 ? barHeight + (lanes - 1) * lineStep : 0;
        const dotsEl = /** @type {HTMLElement | null} */ (cell.querySelector(".calendar-cell__dots"));
        const dotsHeight = dotsEl ? Math.max(0, dotsEl.offsetHeight) : 0;
        if (dotsHeight > maxDotsHeight) maxDotsHeight = dotsHeight;
        const headerGap = 7;
        // 날짜별 dot 개수(1줄/2줄/3줄)에 따라 실제 하단 보호 높이를 반영한다.
        const dotSafe = Math.max(20, dotsHeight + 14);
        const cellRequired = contentBottom + headerGap + laneStackHeight + dotSafe;
        if (cellRequired > rowRequiredHeight) rowRequiredHeight = cellRequired;
      });
      const lanes = Math.max(rowSlots[row] || 0, rowLaneMax[row] || 0);
      const rowBase = rowBaseTop[row] || 0;
      const laneStackBottom = rowBase + (lanes > 0 ? (lanes - 1) * lineStep + barHeight : 0);
      const dotsBlock = Math.max(20, maxDotsHeight);
      // 동그라미는 "마지막 수평바 하단 + 3px" 아래에서 시작해야 한다.
      // flex 레이아웃/패딩/브라우저 렌더 오차를 감안해 하단 여유를 넉넉히 확보한다.
      const strictRowHeight = laneStackBottom + 3 + dotsBlock + 50;
      const taskExtra = Math.max(0, maxTasks - 4) * 6;
      const h = Math.max(108, 92 + taskExtra, strictRowHeight, rowRequiredHeight) + (rowOverflowPx[row] || 0);
      rows.push(`${h}px`);
    }
    calendarGrid.style.gridTemplateRows = rows.join(" ");
  }

  function resetModalFormForNewTaskOnDay() {
    editingId = null;
    modalDefaultWhite = true;
    draftStatus = "ready";
    draftImportance = "medium";
    taskTitle.value = "";
    taskDescription.value = "";
    taskEffortValue.value = "";
    taskEffortUnit.value = "MH";
    if (taskActualEffortValue) taskActualEffortValue.value = "0MH";
    if (deliverableNameInput) deliverableNameInput.value = "";
    if (deliverableImportanceInput) deliverableImportanceInput.value = "high";
    if (deliverableList) deliverableList.innerHTML = "";
    if (selectedDateStr) {
      taskStart.value = selectedDateStr;
      taskEnd.value = selectedDateStr;
    }
    taskRecurrence.value = "none";
    btnDelete.hidden = true;
    renderQuickMetaControls();
    applyModalTheme();
    refreshDeliverableHeaderUI();
    updateActualEffortPreview();
  }

  function collectDeliverablesFromModal() {
    if (!deliverableList) return [];
    const out = [];
    const rows = deliverableList.querySelectorAll(".deliverable-item");
    rows.forEach((row, idx) => {
      const nameEl = row.querySelector(".deliverable-item__name-input");
      const impSelect = row.querySelector(".deliverable-item__importance-select");
      const name =
        nameEl instanceof HTMLTextAreaElement
          ? nameEl.value.trim()
          : nameEl instanceof HTMLInputElement
            ? nameEl.value.trim()
            : "";
      const importanceRaw = impSelect instanceof HTMLSelectElement ? impSelect.value : "medium";
      if (!name) return;
      const importance = importanceRaw === "high" || importanceRaw === "low" ? importanceRaw : "medium";
      const cb = row.querySelector('input[type="checkbox"]');
      out.push({
        id: row.getAttribute("data-id") || `d-${Date.now()}-${idx}`,
        name,
        importance,
        done: cb instanceof HTMLInputElement ? cb.checked : false,
        createdAt: normalizeDeliverableCreatedAt(row.getAttribute("data-created-at"), row.getAttribute("data-id")),
      });
    });
    return out;
  }

  function bindDeliverableListRow(li, nameTa, impSelect) {
    applyDeliverableImpBand(li, deliverableNormalizedImportance(impSelect.value));
    bindDeliverableNameTextareaBehavior(nameTa);
    impSelect.addEventListener("change", () => {
      applyDeliverableImpBand(li, deliverableNormalizedImportance(impSelect.value));
      renderDeliverableList(collectDeliverablesFromModal());
      updateActualEffortPreview();
    });
    fitDeliverableNameField(nameTa);
  }

  function renderDeliverableList(rows) {
    if (!deliverableList) return;
    deliverableList.innerHTML = "";
    sortDeliverablesForView(normalizeDeliverables(rows)).forEach((row) => {
      const li = document.createElement("li");
      li.className = "deliverable-item" + (row.done ? " deliverable-item--done" : "");
      li.setAttribute("data-id", row.id || uuid());
      if (Number.isFinite(row.createdAt) && Number(row.createdAt) > 0) {
        li.setAttribute("data-created-at", String(Math.floor(Number(row.createdAt))));
      }
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = !!row.done;
      cb.setAttribute("aria-label", "산출물 완료 여부");

      const nameTa = document.createElement("textarea");
      nameTa.className = "deliverable-item__name-input";
      nameTa.rows = 1;
      nameTa.spellcheck = false;
      nameTa.value = row.name || "";
      nameTa.placeholder = "산출물명";

      const impSelect = document.createElement("select");
      impSelect.className = "deliverable-item__importance-select";
      impSelect.innerHTML = `<option value="high">상</option><option value="medium">중</option><option value="low">하</option>`;
      impSelect.value = row.importance === "high" || row.importance === "low" ? row.importance : "medium";

      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "deliverable-item__delete";
      delBtn.textContent = "삭제";

      li.appendChild(cb);
      li.appendChild(nameTa);
      li.appendChild(impSelect);
      li.appendChild(delBtn);
      deliverableList.appendChild(li);
      bindDeliverableListRow(li, nameTa, impSelect);
    });
  }

  function updateActualEffortPreview() {
    if (!taskActualEffortValue) return;
    const effortRaw = Number(taskEffortValue.value);
    const effortUnit = taskEffortUnit.value === "MD" ? "MD" : "MH";
    if (!Number.isFinite(effortRaw) || effortRaw <= 0) {
      taskActualEffortValue.value = `0${effortUnit}`;
      return;
    }
    const expectedMh = effortUnit === "MD" ? effortRaw * 24 : effortRaw;
    const rows = collectDeliverablesFromModal();
    const totalWeight = rows.reduce((acc, row) => acc + importanceWeight(row.importance), 0);
    const doneWeight = rows.filter((row) => row.done).reduce((acc, row) => acc + importanceWeight(row.importance), 0);
    const ratio = totalWeight > 0 ? doneWeight / totalWeight : 0;
    const actualMh = expectedMh * ratio;
    const viewValue = effortUnit === "MD" ? actualMh / 24 : actualMh;
    taskActualEffortValue.value = `${formatMh(viewValue)}${effortUnit}`;
    renderQuickMetaControls();
    void enforceDoneStatusConstraint();
    void autoPromoteOngoingWhenStarted();
    void autoPromoteDoneStatusWhenEligible();
  }

  function cloneTasks(src) {
    return src.map((t) => ({
      ...t,
      deliverables: normalizeDeliverables(t.deliverables),
      recurrenceProgress: cloneRecurrenceProgress(t.recurrenceProgress),
      recurrenceSkipStarts: normalizeRecurrenceSkipStarts(t.recurrenceSkipStarts),
    }));
  }

  function pushUndoSnapshot() {
    undoStack.push(cloneTasks(tasks));
    if (undoStack.length > 100) undoStack.shift();
    redoStack = [];
  }

  async function applyHistorySnapshot(snapshot) {
    tasks = cloneTasks(snapshot);
    await saveTasks();
    renderCalendar();
    updateSearchResults();
  }

  async function undoOnce() {
    if (!undoStack.length) return;
    redoStack.push(cloneTasks(tasks));
    const prev = undoStack.pop();
    if (!prev) return;
    await applyHistorySnapshot(prev);
  }

  async function redoOnce() {
    if (!redoStack.length) return;
    undoStack.push(cloneTasks(tasks));
    const next = redoStack.pop();
    if (!next) return;
    await applyHistorySnapshot(next);
  }

  function buildModalSnapshot() {
    return {
      tasks: cloneTasks(tasks),
      selectedDateStr,
      editingId,
      modalDefaultWhite,
      form: {
        title: taskTitle.value,
        description: taskDescription.value,
        effortValue: taskEffortValue.value,
        effortUnit: taskEffortUnit.value,
        startDate: taskStart.value,
        endDate: taskEnd.value,
        recurrence: /** @type {'none'|'daily'|'weekly'|'monthly'} */ (taskRecurrence.value),
        status: getCurrentStatus(),
        importance: getCurrentImportance(),
        deliverables: collectDeliverablesFromModal(),
        deliverableName: deliverableNameInput ? deliverableNameInput.value : "",
        deliverableImportance: deliverableImportanceInput ? deliverableImportanceInput.value : "high",
      },
    };
  }

  function serializeDeliverablesForCompare(rows) {
    return normalizeDeliverables(rows).map((r) => ({
      id: String(r.id || ""),
      name: String(r.name || ""),
      importance: r.importance === "high" || r.importance === "low" ? r.importance : "medium",
      done: !!r.done,
      createdAt: Number.isFinite(Number(r.createdAt)) ? Math.floor(Number(r.createdAt)) : null,
    }));
  }

  function hasModalDraftChanges() {
    if (!modalSessionSnapshot) return false;
    const now = buildModalSnapshot().form;
    const base = modalSessionSnapshot.form;
    if (now.title !== base.title) return true;
    if (now.description !== base.description) return true;
    if (now.effortValue !== base.effortValue) return true;
    if (now.effortUnit !== base.effortUnit) return true;
    if (now.startDate !== base.startDate) return true;
    if (now.endDate !== base.endDate) return true;
    if (now.recurrence !== base.recurrence) return true;
    if (now.status !== base.status) return true;
    if (now.importance !== base.importance) return true;
    if ((now.deliverableName || "") !== (base.deliverableName || "")) return true;
    if ((now.deliverableImportance || "") !== (base.deliverableImportance || "")) return true;
    const nowRows = JSON.stringify(serializeDeliverablesForCompare(now.deliverables));
    const baseRows = JSON.stringify(serializeDeliverablesForCompare(base.deliverables));
    return nowRows !== baseRows;
  }

  function isEffectivelyEmptyDraft() {
    const title = (taskTitle.value || "").trim();
    const description = (taskDescription.value || "").trim();
    const effortInputRaw = (taskEffortValue.value || "").trim();
    const rows = collectDeliverablesFromModal();
    return !editingId && !title && !description && !effortInputRaw && rows.length === 0;
  }

  function restoreModalSnapshot() {
    if (!modalSessionSnapshot) return;
    tasks = cloneTasks(modalSessionSnapshot.tasks);
    selectedDateStr = modalSessionSnapshot.selectedDateStr;
    editingId = modalSessionSnapshot.editingId;
    modalDefaultWhite = modalSessionSnapshot.modalDefaultWhite;
    taskTitle.value = modalSessionSnapshot.form.title;
    taskDescription.value = modalSessionSnapshot.form.description;
    taskEffortValue.value = modalSessionSnapshot.form.effortValue;
    taskEffortUnit.value = modalSessionSnapshot.form.effortUnit;
    taskStart.value = modalSessionSnapshot.form.startDate;
    taskEnd.value = modalSessionSnapshot.form.endDate;
    taskRecurrence.value = modalSessionSnapshot.form.recurrence;
    draftStatus = modalSessionSnapshot.form.status || "ready";
    draftImportance = modalSessionSnapshot.form.importance || "medium";
    if (deliverableNameInput) deliverableNameInput.value = modalSessionSnapshot.form.deliverableName || "";
    if (deliverableImportanceInput) deliverableImportanceInput.value = modalSessionSnapshot.form.deliverableImportance || "high";
    renderDeliverableList(modalSessionSnapshot.form.deliverables || []);
    refreshDeliverableHeaderUI();
    updateActualEffortPreview();
    btnDelete.hidden = !editingId;
    saveTasks().catch((err) => {
      console.error("restore snapshot save error:", err);
    });
    applyModalTheme();
    renderExistingTasksList();
    renderCalendar();
  }

  function updateSearchResults() {
    const q = (searchInput.value || "").trim();
    const st = searchStatus.value;
    const hasFilter = q.length > 0 || st !== "all";
    const hits = tasks.filter(matchesSearch);

    if (!hasFilter) {
      searchResults.hidden = true;
      searchResultsList.innerHTML = "";
      return;
    }

    searchResults.hidden = false;
    searchCount.textContent = `(${hits.length}건)`;
    searchResultsList.innerHTML = "";

    if (hits.length === 0) {
      const li = document.createElement("li");
      li.className = "search-hit__meta";
      li.style.padding = "0.35rem 0.5rem";
      li.textContent = "조건에 맞는 일정이 없습니다.";
      searchResultsList.appendChild(li);
      return;
    }

    hits.forEach((t) => {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button";
      const hitStatusClass =
        t.status === "on-going" ? "search-hit--ongoing" : t.status === "done" ? "search-hit--done" : "search-hit--ready";
      btn.className = "search-hit " + hitStatusClass;
      const lab = taskLabel(t);
      const rec =
        t.recurrence && t.recurrence !== "none"
          ? ` · 반복: ${recurrenceLabel(t.recurrence)}${t.recurrenceUntil ? " ~ " + t.recurrenceUntil : ""}`
          : "";
      btn.innerHTML = `<div class="search-hit__title">${escapeHtml(lab)}</div><div class="search-hit__meta">${escapeHtml(t.status)} · 중요도 ${escapeHtml(importanceLabel(t.importance))} · ${t.startDate} ~ ${t.endDate}${escapeHtml(rec)}</div>`;
      btn.addEventListener("click", () => {
        const anchor = parseDateStr(t.startDate);
        viewYear = anchor.getFullYear();
        viewMonth = anchor.getMonth();
        renderCalendar();
        openModal(toDateStrFromDate(anchor), t.id);
      });
      li.appendChild(btn);
      searchResultsList.appendChild(li);
    });
  }

  function renderCalendar() {
    calendarGrid.innerHTML = "";

    const first = new Date(viewYear, viewMonth, 1);
    const last = new Date(viewYear, viewMonth + 1, 0);
    const pad = first.getDay();
    const daysInMonth = last.getDate();

    monthTitle.textContent = `${viewYear}년 ${viewMonth + 1}월`;

    const prevLast = new Date(viewYear, viewMonth, 0).getDate();
    for (let i = 0; i < pad; i++) {
      const d = prevLast - pad + 1 + i;
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "calendar-cell calendar-cell--muted";
      cell.dataset.dateStr = toDateStr(viewMonth === 0 ? viewYear - 1 : viewYear, viewMonth === 0 ? 11 : viewMonth - 1, d);
      const holidayName = getKoreanHolidayName(cell.dataset.dateStr);
      if (holidayName) {
        cell.classList.add("calendar-cell--holiday");
        cell.dataset.holidayName = holidayName;
        cell.setAttribute("aria-label", `${cell.dataset.dateStr} ${holidayName}`);
      }
      cell.innerHTML = `<span class="calendar-cell__ongoing-count" hidden></span><span class="calendar-cell__num">${d}</span><div class="calendar-cell__dots" aria-hidden="true"></div>`;
      if (holidayName) {
        const num = cell.querySelector(".calendar-cell__num");
        if (num) num.insertAdjacentHTML("beforeend", ` <span class="calendar-cell__holiday-name">${escapeHtml(holidayName)}</span>`);
      }
      cell.addEventListener("click", () => openModal(cell.dataset.dateStr, null, true));
      styleCellForDate(cell, cell.dataset.dateStr);
      calendarGrid.appendChild(cell);
    }

    const t0 = todayStart().getTime();
    for (let d = 1; d <= daysInMonth; d++) {
      const ds = toDateStr(viewYear, viewMonth, d);
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "calendar-cell";
      const holidayName = getKoreanHolidayName(ds);
      if (holidayName) {
        cell.classList.add("calendar-cell--holiday");
        cell.dataset.holidayName = holidayName;
        cell.setAttribute("aria-label", `${ds} ${holidayName}`);
      }
      const wd = new Date(viewYear, viewMonth, d).getDay();
      if (wd === 0) cell.classList.add("calendar-cell--sun");
      if (wd === 6) cell.classList.add("calendar-cell--sat");

      const thisDay = startOfDay(new Date(viewYear, viewMonth, d)).getTime();
      if (thisDay === t0) {
        cell.classList.add("calendar-cell--today");
        cell.setAttribute("aria-current", "date");
      }

      cell.dataset.dateStr = ds;
      cell.innerHTML = `<span class="calendar-cell__ongoing-count" hidden></span><span class="calendar-cell__num">${d}</span><div class="calendar-cell__dots" aria-hidden="true"></div>`;
      if (holidayName) {
        const num = cell.querySelector(".calendar-cell__num");
        if (num) num.insertAdjacentHTML("beforeend", ` <span class="calendar-cell__holiday-name">${escapeHtml(holidayName)}</span>`);
      }
      cell.addEventListener("click", () => openModal(ds, null, true));
      styleCellForDate(cell, ds);
      calendarGrid.appendChild(cell);
    }

    const tail = (7 - ((pad + daysInMonth) % 7)) % 7;
    for (let i = 1; i <= tail; i++) {
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "calendar-cell calendar-cell--muted";
      cell.dataset.dateStr = toDateStr(viewMonth === 11 ? viewYear + 1 : viewYear, viewMonth === 11 ? 0 : viewMonth + 1, i);
      const holidayName = getKoreanHolidayName(cell.dataset.dateStr);
      if (holidayName) {
        cell.classList.add("calendar-cell--holiday");
        cell.dataset.holidayName = holidayName;
        cell.setAttribute("aria-label", `${cell.dataset.dateStr} ${holidayName}`);
      }
      cell.innerHTML = `<span class="calendar-cell__ongoing-count" hidden></span><span class="calendar-cell__num">${i}</span><div class="calendar-cell__dots" aria-hidden="true"></div>`;
      if (holidayName) {
        const num = cell.querySelector(".calendar-cell__num");
        if (num) num.insertAdjacentHTML("beforeend", ` <span class="calendar-cell__holiday-name">${escapeHtml(holidayName)}</span>`);
      }
      cell.addEventListener("click", () => openModal(cell.dataset.dateStr, null, true));
      styleCellForDate(cell, cell.dataset.dateStr);
      calendarGrid.appendChild(cell);
    }

    applyCalendarRowHeights({});
    updateSearchResults();
    requestAnimationFrame(() => {
      requestAnimationFrame(renderMultiDayRangeLines);
    });
  }

  /** on-going만: 상 3 · 중 2 · 하 1점 합산 */
  function ongoingImportanceScore(ongoingTasks) {
    let s = 0;
    ongoingTasks.forEach((t) => {
      const imp = t.importance || "medium";
      if (imp === "high") s += 3;
      else if (imp === "low") s += 1;
      else s += 2;
    });
    return s;
  }

  function buildDailyMhBadgeTooltip(dayEffortRows, spentDailyMh, totalDailyMh) {
    if (!dayEffortRows.length) return "";
    const maxLines = 15;
    const lines = dayEffortRows.map((x) => `${taskLabel(x.task)} (${formatMh(x.spentDailyMh)}/${formatMh(x.dailyMh)}MH)`);
    const shown = lines.slice(0, maxLines);
    let tip = `당일 공수 ${formatMh(spentDailyMh)}/${formatMh(totalDailyMh)}MH (투입/예상)`;
    tip += "\n────────\n";
    tip += shown.map((lab, i) => `${i + 1}. ${lab}`).join("\n");
    if (lines.length > maxLines) tip += `\n… 외 ${lines.length - maxLines}건`;
    return tip;
  }

  function styleCellForDate(cell, dateStr) {
    const list = tasks.filter((t) => taskCoversDate(t, dateStr));
    const ongoingTasks = list.filter((t) => t.status === "on-going");
    const ongoingCount = ongoingTasks.length;
    const allEffortRows = list
      .map((t) => ({ task: t, dailyMh: taskDailyMhOnDate(t, dateStr), spentDailyMh: taskSpentDailyMhOnDate(t, dateStr) }))
      .filter((x) => x.dailyMh > 0);
    const totalDailyMh = allEffortRows.reduce((acc, x) => acc + x.dailyMh, 0);
    const spentDailyMh = allEffortRows.reduce((acc, x) => acc + x.spentDailyMh, 0);
    const ongoingEl = cell.querySelector(".calendar-cell__ongoing-count");
    if (ongoingEl) {
      if (totalDailyMh > 0) {
        ongoingEl.textContent = `${formatMh(spentDailyMh)}/${formatMh(totalDailyMh)}`;
        ongoingEl.hidden = false;
        ongoingEl.classList.toggle("calendar-cell__ongoing-count--complete", totalDailyMh - spentDailyMh <= 0.0001);
        ongoingEl.title = buildDailyMhBadgeTooltip(allEffortRows, spentDailyMh, totalDailyMh);
        ongoingEl.setAttribute(
          "aria-label",
          `${dateStr} 당일 공수 ${formatMh(spentDailyMh)}/${formatMh(totalDailyMh)}MH (투입/예상): ${allEffortRows.map((x) => taskLabel(x.task)).join(", ")}`
        );
      } else {
        ongoingEl.textContent = "";
        ongoingEl.hidden = true;
        ongoingEl.classList.remove("calendar-cell__ongoing-count--complete");
        ongoingEl.removeAttribute("title");
        ongoingEl.removeAttribute("aria-label");
      }
    }

    const dots = cell.querySelector(".calendar-cell__dots");
    if (dots) dots.innerHTML = "";

    cell.classList.remove("calendar-cell--heat-low", "calendar-cell--heat-mid", "calendar-cell--heat-high");
    cell.classList.remove("calendar-cell--tip-active");
    if (ongoingCount > 0) {
      const score = ongoingImportanceScore(ongoingTasks);
      if (score >= 8) cell.classList.add("calendar-cell--heat-high");
      else if (score >= 4) cell.classList.add("calendar-cell--heat-mid");
      else cell.classList.add("calendar-cell--heat-low");
    }

    const hasOverdue = list.some((t) => isTaskOverdueOnDate(t, dateStr));
    if (hasOverdue) cell.classList.add("calendar-cell--overdue");
    else cell.classList.remove("calendar-cell--overdue");


    if (dots && list.length) {
      const sorted = getVisibleTasksForCalendarDay(dateStr);
      sorted.forEach((t) => {
        const wrap = document.createElement("button");
        wrap.type = "button";
        wrap.className = importanceWrapClass(t.importance || "medium");
        const impKey = t.importance === "high" ? "high" : t.importance === "low" ? "low" : "medium";
        const impToken = "■ ";
        const stKey = t.status === "on-going" ? "ongoing" : t.status === "done" ? "done" : "ready";
        wrap.dataset.tipToken = impToken;
        wrap.dataset.tipBody = `${taskLabel(t)}`;
        wrap.classList.add(`calendar-cell__dot-wrap--tip-${stKey}`, `calendar-cell__dot-wrap--tip-imp-${impKey}`);
        wrap.tabIndex = 0;
        const updateDotTipAnchorPos = (e) => {
          if (!(e instanceof MouseEvent)) return;
          const rr = wrap.getBoundingClientRect();
          const x = Math.max(0, Math.min(rr.width, e.clientX - rr.left));
          const y = Math.max(0, Math.min(rr.height, e.clientY - rr.top));
          wrap.style.setProperty("--tip-x", `${Math.round(x)}px`);
          wrap.style.setProperty("--tip-y", `${Math.round(y)}px`);
        };
        wrap.addEventListener("mouseenter", updateDotTipAnchorPos);
        wrap.addEventListener("mousemove", updateDotTipAnchorPos);
        wrap.addEventListener("mouseenter", () => {
          cell.classList.add("calendar-cell--tip-active");
        });
        wrap.addEventListener("focus", () => {
          cell.classList.add("calendar-cell--tip-active");
        });
        wrap.addEventListener("mouseleave", () => {
          cell.classList.remove("calendar-cell--tip-active");
          hideRangeTooltipNow();
        });
        wrap.addEventListener("blur", () => {
          cell.classList.remove("calendar-cell--tip-active");
        });
        const openFromDot = () => openModal(dateStr, t.id);
        // 동그라미는 커스텀 플로팅 툴팁을 쓰지 않는다.
        // (수평바 툴팁 잔류/재트리거와 충돌 방지)
        // 동그라미 클릭 시 해당 task를 바로 편집 모드로 연다.
        wrap.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          openFromDot();
        });
        wrap.addEventListener("keydown", (e) => {
          if (e.key !== "Enter" && e.key !== " ") return;
          e.preventDefault();
          e.stopPropagation();
          openFromDot();
        });
        const inner = document.createElement("span");
        inner.className = "calendar-cell__dot-inner " + statusDotClass(t.status);
        if (isTaskOverdueOnDate(t, dateStr)) inner.classList.add("calendar-cell__dot-inner--late");
        wrap.appendChild(inner);
        dots.appendChild(wrap);
      });
      const fullSorted = sortTasksForDots(list);
      if (fullSorted.length > MAX_CALENDAR_DOTS) {
        const more = document.createElement("span");
        more.className = "calendar-cell__more";
        more.textContent = "+" + (fullSorted.length - MAX_CALENDAR_DOTS);
        more.title = `외 ${fullSorted.length - MAX_CALENDAR_DOTS}건`;
        dots.appendChild(more);
      }
    }
  }

  function openModal(dateStr, taskId, forceNew = false) {
    selectedDateStr = dateStr;
    editingId = taskId || null;
    modalDefaultWhite = !taskId;
    updateTopbarDatePill();

    const ymd = parseDateStr(dateStr);
    modalDateHint.textContent = `${ymd.getFullYear()}년 ${ymd.getMonth() + 1}월 ${ymd.getDate()}일`;

    const fillFormFromTask = (t) => {
      taskTitle.value = t.title || "";
      taskDescription.value = t.description || "";
      taskEffortValue.value = t.effortValue != null && Number(t.effortValue) > 0 ? String(t.effortValue) : "";
      taskEffortUnit.value = t.effortUnit === "MD" ? "MD" : "MH";
      renderDeliverableList(getModalDeliverablesForDate(t, selectedDateStr));
      if (deliverableNameInput) deliverableNameInput.value = "";
      if (deliverableImportanceInput) deliverableImportanceInput.value = "high";
      taskStart.value = t.startDate;
      taskEnd.value = t.endDate;
      taskRecurrence.value = t.recurrence || "none";
      updateActualEffortPreview();
    };

    if (taskId) {
      const t = tasks.find((x) => x.id === taskId);
      if (t) {
        fillFormFromTask(t);
        draftStatus = t.status || "ready";
        draftImportance = t.importance || "medium";
      }
    } else {
      if (forceNew) {
        draftStatus = "ready";
        draftImportance = "medium";
        taskTitle.value = "";
        taskDescription.value = "";
        taskEffortValue.value = "";
        taskEffortUnit.value = "MH";
        renderDeliverableList([]);
        if (deliverableNameInput) deliverableNameInput.value = "";
        if (deliverableImportanceInput) deliverableImportanceInput.value = "high";
        taskStart.value = dateStr;
        taskEnd.value = dateStr;
        taskRecurrence.value = "none";
        updateActualEffortPreview();
      } else {
      // 해당 날짜에 일정이 있으면 첫 항목을 기본 선택(날짜 변경 즉시 편집 가능)
      const onDay = tasks
        .filter((t) => taskCoversDate(t, dateStr))
        .sort((a, b) => {
          const ia = IMP_ORDER[a.importance] ?? 1;
          const ib = IMP_ORDER[b.importance] ?? 1;
          if (ia !== ib) return ia - ib;
          return taskLabel(a).localeCompare(taskLabel(b), "ko");
        });
      if (onDay.length > 0) {
        editingId = onDay[0].id;
        modalDefaultWhite = false;
        fillFormFromTask(onDay[0]);
        draftStatus = onDay[0].status || "ready";
        draftImportance = onDay[0].importance || "medium";
      } else {
        draftStatus = "ready";
        draftImportance = "medium";
        taskTitle.value = "";
        taskDescription.value = "";
        taskEffortValue.value = "";
        taskEffortUnit.value = "MH";
        renderDeliverableList([]);
        if (deliverableNameInput) deliverableNameInput.value = "";
        if (deliverableImportanceInput) deliverableImportanceInput.value = "high";
        taskStart.value = dateStr;
        taskEnd.value = dateStr;
        taskRecurrence.value = "none";
        updateActualEffortPreview();
      }
      }
    }

    btnDelete.hidden = !editingId;
    renderQuickMetaControls();

    applyModalTheme();

    renderExistingTasksList();
    refreshDeliverableHeaderUI();
    modalBackdrop.hidden = false;
    taskModal.hidden = false;
    modalSessionSnapshot = buildModalSnapshot();
    taskTitle.focus();
  }

  function renderExistingTasksList() {
    if (!selectedDateStr) return;
    const onDay = tasks.filter((t) => taskCoversDate(t, selectedDateStr));
    const onDaySorted = [...onDay].sort((a, b) => {
      const ia = IMP_ORDER[a.importance] ?? 1;
      const ib = IMP_ORDER[b.importance] ?? 1;
      if (ia !== ib) return ia - ib;
      const sa = STATUS_ORDER[a.status] ?? 9;
      const sb = STATUS_ORDER[b.status] ?? 9;
      if (sa !== sb) return sa - sb;
      return taskLabel(a).localeCompare(taskLabel(b), "ko");
    });
    if (onDay.length === 0) {
      existingTasksWrap.hidden = true;
      existingTasksList.innerHTML = "";
      return;
    }
    existingTasksWrap.hidden = false;
    existingTasksList.innerHTML = "";
    const STATUS_CHOICES = /** @type {const} */ (["ready", "on-going", "done"]);
    const IMP_CHOICES = /** @type {const} */ (["high", "medium", "low"]);
    onDaySorted.forEach((t) => {
      const li = document.createElement("li");
      li.className = "task-chip-item";
      const btn = document.createElement("button");
      btn.type = "button";
      const overdue = isTaskOverdueOnDate(t, selectedDateStr);
      const statusClass =
        t.status === "on-going" ? "task-chip--ongoing" : t.status === "done" ? "task-chip--done" : "task-chip--ready";
      btn.className =
        "task-chip " +
        statusClass +
        (t.id === editingId ? " task-chip--active" : "") +
        (overdue ? " task-chip--overdue" : "");
      const lab = taskLabel(t);
      const short = lab.length > 42 ? lab.slice(0, 40) + "…" : lab;
      const recBadge = t.recurrence && t.recurrence !== "none" ? ` · ${recurrenceLabel(t.recurrence)}` : "";
      const imp = t.importance || "medium";
      const effortBadge =
        t.effortValue != null && Number(t.effortValue) > 0
          ? ` · ${escapeHtml(String(t.effortValue))}${escapeHtml(t.effortUnit === "MD" ? "MD" : "MH")}`
          : "";
      btn.innerHTML = `<span class="task-chip__desc"><span class="task-chip__imp task-chip__imp--${imp}" aria-hidden="true"></span>${escapeHtml(short)}${escapeHtml(recBadge)}${effortBadge}</span><span class="task-chip__status">${escapeHtml(t.status)}</span>`;
      btn.title = "클릭: 상세 편집 · 호버: 상태/중요도/삭제";
      btn.addEventListener("click", () => {
        editingId = t.id;
        modalDefaultWhite = false;
        taskTitle.value = t.title || "";
        draftStatus = t.status || "ready";
        draftImportance = t.importance || "medium";
        taskDescription.value = t.description || "";
        taskEffortValue.value = t.effortValue != null && Number(t.effortValue) > 0 ? String(t.effortValue) : "";
        taskEffortUnit.value = t.effortUnit === "MD" ? "MD" : "MH";
        renderDeliverableList(getModalDeliverablesForDate(t, selectedDateStr));
        if (deliverableNameInput) deliverableNameInput.value = "";
        if (deliverableImportanceInput) deliverableImportanceInput.value = "high";
        refreshDeliverableHeaderUI();
        updateActualEffortPreview();
        taskStart.value = t.startDate;
        taskEnd.value = t.endDate;
        taskRecurrence.value = t.recurrence || "none";
        btnDelete.hidden = false;
        renderQuickMetaControls();
        applyModalTheme();
        renderExistingTasksList();
      });

      const quick = document.createElement("div");
      quick.className = "task-chip__quick";
      quick.setAttribute("role", "tooltip");
      const statusRow = document.createElement("div");
      statusRow.className = "task-chip__quick-row";
      statusRow.innerHTML = `<span class="task-chip__quick-label">상태</span>`;
      STATUS_CHOICES.forEach((st) => {
        const q = document.createElement("button");
        q.type = "button";
        q.className = "task-chip__quick-btn" + (t.status === st ? " task-chip__quick-btn--active" : "");
        q.textContent = st;
        q.addEventListener("click", async (e) => {
          e.preventDefault();
          e.stopPropagation();
          const i = tasks.findIndex((x) => x.id === t.id);
          if (i < 0) return;
          pushUndoSnapshot();
          tasks[i] = { ...tasks[i], status: st };
          if (editingId === t.id) modalDefaultWhite = false;
          await firebaseUpdateTask(t.id, { status: st });
          renderCalendar();
          renderQuickMetaControls();
          applyModalTheme();
          renderExistingTasksList();
        });
        statusRow.appendChild(q);
      });
      quick.appendChild(statusRow);
      const impRow = document.createElement("div");
      impRow.className = "task-chip__quick-row";
      const impLabel = document.createElement("span");
      impLabel.className = "task-chip__quick-label";
      impLabel.textContent = "중요도";
      impRow.appendChild(impLabel);
      IMP_CHOICES.forEach((impKey) => {
        const iq = document.createElement("button");
        iq.type = "button";
        iq.className = "task-chip__quick-btn" + (t.importance === impKey ? " task-chip__quick-btn--active" : "");
        iq.textContent = impKey === "high" ? "H" : impKey === "low" ? "L" : "M";
        iq.addEventListener("click", async (e) => {
          e.preventDefault();
          e.stopPropagation();
          const i = tasks.findIndex((x) => x.id === t.id);
          if (i < 0) return;
          pushUndoSnapshot();
          tasks[i] = { ...tasks[i], importance: impKey };
          await firebaseUpdateTask(t.id, { importance: impKey });
          renderCalendar();
          renderQuickMetaControls();
          applyModalTheme();
          renderExistingTasksList();
        });
        impRow.appendChild(iq);
      });
      quick.appendChild(impRow);
      const actionRow = document.createElement("div");
      actionRow.className = "task-chip__quick-row";
      const del = document.createElement("button");
      del.type = "button";
      del.className = "task-chip__quick-btn task-chip__quick-btn--danger";
      del.textContent = "삭제";
      del.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const ok = await openConfirmDialog(`"${taskLabel(t)}" 일정을 삭제할까요?`, {
          title: "삭제 확인",
          okLabel: "삭제",
          cancelLabel: "취소",
          showCancel: true,
        });
        if (!ok) return;
        pushUndoSnapshot();
        tasks = tasks.filter((x) => x.id !== t.id);
        if (editingId === t.id) {
          resetModalFormForNewTaskOnDay();
        }
        await firebaseDeleteTask(t.id);
        renderCalendar();
        renderExistingTasksList();
      });
      actionRow.appendChild(del);
      quick.appendChild(actionRow);

      li.appendChild(btn);
      li.appendChild(quick);
      existingTasksList.appendChild(li);
    });
  }

  function escapeHtml(s) {
    const div = document.createElement("div");
    div.textContent = s;
    return div.innerHTML;
  }

  function openConfirmDialog(message, opts) {
    const options = {
      title: "확인",
      okLabel: "확인",
      cancelLabel: "취소",
      showCancel: true,
      ...opts,
    };
    return new Promise((resolve) => {
      if (!confirmBackdrop || !confirmPop || !confirmMessage || !confirmCancel || !confirmOk || !confirmTitle) {
        resolve(confirm(message));
        return;
      }
      confirmTitle.textContent = options.title;
      confirmMessage.textContent = message;
      confirmOk.textContent = options.okLabel;
      confirmCancel.textContent = options.cancelLabel;
      confirmCancel.hidden = !options.showCancel;
      confirmBackdrop.hidden = false;
      confirmPop.hidden = false;

      const cleanup = () => {
        confirmBackdrop.hidden = true;
        confirmPop.hidden = true;
        confirmCancel.removeEventListener("click", onCancel);
        confirmOk.removeEventListener("click", onOk);
        confirmBackdrop.removeEventListener("click", onCancel);
      };
      const onCancel = () => {
        cleanup();
        resolve(false);
      };
      const onOk = () => {
        cleanup();
        resolve(true);
      };
      if (options.showCancel) {
        confirmCancel.addEventListener("click", onCancel);
      }
      confirmOk.addEventListener("click", onOk);
      confirmBackdrop.addEventListener("click", options.showCancel ? onCancel : onOk);
      confirmOk.focus();
    });
  }

  async function openAlertDialog(message, title = "입력 확인") {
    await openConfirmDialog(message, {
      title,
      okLabel: "확인",
      showCancel: false,
    });
  }

  async function loadGeminiKey() {
    // 완전 비저장 모드: 키도 메모리에서만 사용
    return geminiKeyCache;
  }

  function saveGeminiKeyToStorage(k) {
    geminiKeyCache = (k || "").trim();
  }

  function parseGeminiJsonArray(raw) {
    let t = raw.trim();
    if (t.startsWith("```")) {
      t = t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");
    }
    const parsed = JSON.parse(t);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && Array.isArray(parsed.tasks)) return parsed.tasks;
    if (parsed && Array.isArray(parsed.items)) return parsed.items;
    throw new Error("JSON 배열 형식이 아닙니다.");
  }

  /**
   * OCR 날짜 문자열을 YYYY-MM-DD로 정규화한다.
   * - YYYY-MM-DD
   * - YYYY/M/D, YYYY.M.D
   * - M-D, M/D, M.D, M월 D일  -> fallbackYear 사용
   * @param {unknown} raw
   * @param {number} fallbackYear
   * @returns {string}
   */
  function normalizeOcrDate(raw, fallbackYear) {
    if (typeof raw !== "string") return "";
    const s = raw.trim();
    if (!s) return "";
    const ymd = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
    if (ymd) {
      const y = Number(ymd[1]);
      const m = Number(ymd[2]);
      const d = Number(ymd[3]);
      if (m < 1 || m > 12 || d < 1 || d > 31) return "";
      return `${y}-${pad2(m)}-${pad2(d)}`;
    }
    const md = s.match(/^(\d{1,2})[-/.](\d{1,2})$/) || s.match(/^(\d{1,2})월\s*(\d{1,2})일$/);
    if (md) {
      const m = Number(md[1]);
      const d = Number(md[2]);
      if (m < 1 || m > 12 || d < 1 || d > 31) return "";
      return `${fallbackYear}-${pad2(m)}-${pad2(d)}`;
    }
    return "";
  }

  function coerceOcrItem(o, todayStr) {
    const title = o.title != null ? String(o.title).trim() : "";
    const fallbackYear = viewYear || new Date().getFullYear();
    let startDate = normalizeOcrDate(o.startDate, fallbackYear);
    let endDate = normalizeOcrDate(o.endDate, fallbackYear);
    if (startDate && endDate && parseDateStr(startDate) > parseDateStr(endDate)) endDate = startDate;
    const status = ["ready", "on-going", "done"].includes(o.status) ? o.status : "ready";
    const importance = ["high", "medium", "low"].includes(o.importance) ? o.importance : "";
    const rawEffort = Number(o.effortValue);
    const effortValue = Number.isFinite(rawEffort) && rawEffort > 0 ? Math.round(rawEffort * 100) / 100 : 2;
    const effortUnit = o.effortUnit === "MD" ? "MD" : "MH";
    const description = o.description != null ? String(o.description) : "";
    const rawC = Number(o.confidence);
    let confidence = Number.isFinite(rawC) ? rawC : NaN;
    if (!Number.isFinite(confidence)) {
      confidence = 72;
      if (typeof o.startDate === "string") confidence += 8;
      if (typeof o.endDate === "string") confidence += 5;
      if (typeof o.title === "string" && o.title.trim().length >= 4) confidence += 7;
    }
    if (confidence <= 1) confidence *= 100;
    confidence = Math.max(1, Math.min(99, Math.round(confidence)));

    return {
      title,
      description,
      status,
      importance,
      effortValue,
      effortUnit,
      startDate,
      endDate,
      recurrence: /** @type {'none'} */ ("none"),
      recurrenceUntil: null,
      confidence,
    };
  }

  /**
   * @param {string} base64 — Data URL 이 아닌 순수 base64
   * @param {string} mimeType
   * @param {string} apiKey
   */
  async function runGeminiOcr(base64, mimeType, apiKey) {
    const todayStr = toDateStrFromDate(new Date());
    const prompt = `이 이미지는 한글로 적힌 할일 목록(손글씨 또는 인쇄)입니다. 모든 할일을 읽어 JSON 배열만 출력하세요.

스키마: 각 원소는 {"title": string, "startDate": "YYYY-MM-DD", "endDate": "YYYY-MM-DD", "status": "ready"|"on-going"|"done", "importance": "high"|"medium"|"low", "effortValue": number, "effortUnit": "MH"|"MD", "description": string, "confidence": number}
규칙:
- 날짜가 적혀 있으면 그 날짜를 사용합니다. 같은 날짜 아래에 여러 줄이 있으면 각각 별도 항목으로 두고 같은 startDate와 endDate를 씁니다.
- 연도가 없는 날짜(예: 5/4, 5월 4일)는 현재 달력 화면의 연도(${viewYear})를 붙여 YYYY-MM-DD로 만듭니다.
- 날짜가 전혀 없으면 startDate/endDate는 빈 문자열로 둡니다.
- 한 줄에 날짜와 제목이 같이 있으면 그 날짜에 그 제목을 넣습니다.
- status는 판별 가능할 때 채우고, 애매하면 "ready"로 둡니다.
- importance는 판별 가능할 때만 채우고 애매하면 빈 문자열.
- effortValue/effortUnit은 적혀 있을 때 채우고, 없으면 effortValue는 2, effortUnit은 "MH"로 둡니다.
- description은 부가 메모가 있을 때만 채우고 없으면 빈 문자열.
- confidence는 해당 항목 인식 신뢰도(0~1 또는 0~100 숫자)로 넣습니다.
- JSON 배열만 출력하고 다른 설명은 쓰지 마세요.`;

    let discovered = [];
    try {
      const lm = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`
      );
      const lmData = await lm.json().catch(() => ({}));
      if (lm.ok && Array.isArray(lmData.models)) {
        discovered = lmData.models
          .map((m) => String(m.name || ""))
          .map((n) => n.replace(/^models\//, ""))
          .filter(Boolean);
      }
    } catch (_) {}

    const candidates =
      discovered.length > 0
        ? [
            ...GEMINI_MODEL_PREFER.filter((m) => discovered.includes(m)),
            ...discovered.filter((m) => !GEMINI_MODEL_PREFER.includes(m) && /flash|gemini/i.test(m)),
          ]
        : GEMINI_MODEL_PREFER;

    let lastErr = "";
    for (const model of candidates) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
      const makeBody = (useJsonMime) => ({
        contents: [
          {
            parts: [
              { text: prompt },
              { inline_data: { mime_type: mimeType || "image/jpeg", data: base64 } },
            ],
          },
        ],
        generationConfig: useJsonMime ? { temperature: 0.15, responseMimeType: "application/json" } : { temperature: 0.15 },
      });

      let res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(makeBody(true)),
      });
      let data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const msg = String(data.error?.message || JSON.stringify(data) || `HTTP ${res.status}`);
        // 일부 모델은 responseMimeType 지원이 제한될 수 있어 한 번 더 plain 호출
        if (/response.?mime|generationconfig|invalid json payload/i.test(msg)) {
          res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(makeBody(false)),
          });
          data = await res.json().catch(() => ({}));
        }
      }

      if (!res.ok) {
        const msg = data.error?.message || JSON.stringify(data) || `HTTP ${res.status}`;
        lastErr = `[${model}] ${msg}`;
        continue;
      }

      const cand = data.candidates?.[0];
      if (!cand) {
        lastErr = `[${model}] 응답에 후보가 없습니다.`;
        continue;
      }
      if (cand.finishReason && cand.finishReason !== "STOP") {
        console.warn("Gemini finishReason:", model, cand.finishReason);
      }
      const text = cand.content?.parts?.[0]?.text;
      if (text == null || String(text).trim() === "") {
        lastErr = `[${model}] 응답 텍스트가 비어 있습니다.`;
        continue;
      }
      const arr = parseGeminiJsonArray(String(text));
      return arr.map((o) => coerceOcrItem(o, todayStr));
    }
    throw new Error(lastErr || "사용 가능한 Gemini 모델을 찾지 못했습니다.");
  }

  function renderOcrDraftList() {
    ocrDraftList.innerHTML = "";
    ocrDraftRows.forEach((row, index) => {
      const li = document.createElement("li");
      li.className = "ocr-draft-item";
      const idPrefix = `ocr-${index}`;
      li.innerHTML = `
        <label class="ocr-draft-check"><input type="checkbox" class="ocr-draft-cb" checked data-index="${index}" /> 포함</label>
        <div class="ocr-draft-fields">
          <div class="ocr-draft-confidence" title="OCR 신뢰도">신뢰도 ${Math.max(1, Math.min(99, Math.round(Number(row.confidence || 0))))}%</div>
          <input type="text" class="toolbar__input ocr-draft-title" data-index="${index}" id="${idPrefix}-title" />
          <div class="ocr-draft-dates">
            <label class="ocr-draft-date-lab">시작 <input type="date" class="ocr-draft-start" data-index="${index}" id="${idPrefix}-s" /></label>
            <label class="ocr-draft-date-lab">완료 <input type="date" class="ocr-draft-end" data-index="${index}" id="${idPrefix}-e" /></label>
          </div>
          <div class="ocr-draft-meta">
            <label>상태
              <select class="ocr-draft-status" data-index="${index}">
                <option value="">(빈칸)</option>
                <option value="ready">ready</option>
                <option value="on-going">on-going</option>
                <option value="done">done</option>
              </select>
            </label>
            <label>중요도
              <select class="ocr-draft-imp" data-index="${index}">
                <option value="">(빈칸)</option>
                <option value="high">상</option>
                <option value="medium">중</option>
                <option value="low">하</option>
              </select>
            </label>
            <label>공수
              <input type="number" class="ocr-draft-effort" data-index="${index}" min="0" step="0.25" placeholder="빈칸 가능" />
            </label>
            <label>단위
              <select class="ocr-draft-effort-unit" data-index="${index}">
                <option value="MH">MH</option>
                <option value="MD">MD</option>
              </select>
            </label>
          </div>
          <textarea class="ocr-draft-desc" rows="2" data-index="${index}" placeholder="설명(선택)"></textarea>
        </div>`;
      ocrDraftList.appendChild(li);
      const titleEl = li.querySelector(".ocr-draft-title");
      const sEl = li.querySelector(".ocr-draft-start");
      const eEl = li.querySelector(".ocr-draft-end");
      const stEl = li.querySelector(".ocr-draft-status");
      const imEl = li.querySelector(".ocr-draft-imp");
      const efEl = li.querySelector(".ocr-draft-effort");
      const euEl = li.querySelector(".ocr-draft-effort-unit");
      const dEl = li.querySelector(".ocr-draft-desc");
      if (titleEl) titleEl.value = row.title || "";
      if (sEl) sEl.value = row.startDate || "";
      if (eEl) eEl.value = row.endDate || "";
      if (stEl) stEl.value = row.status || "";
      if (imEl) imEl.value = row.importance || "";
      if (efEl) efEl.value = row.effortValue != null && Number(row.effortValue) > 0 ? String(row.effortValue) : "";
      if (euEl) euEl.value = row.effortUnit === "MD" ? "MD" : "MH";
      if (dEl) dEl.value = row.description || "";
    });
  }

  function readOcrDraftFromDom() {
    const out = [];
    ocrDraftRows.forEach((_, index) => {
      const title = /** @type {HTMLInputElement | null} */ (ocrDraftList.querySelector(`.ocr-draft-title[data-index="${index}"]`));
      const s = /** @type {HTMLInputElement | null} */ (ocrDraftList.querySelector(`.ocr-draft-start[data-index="${index}"]`));
      const e = /** @type {HTMLInputElement | null} */ (ocrDraftList.querySelector(`.ocr-draft-end[data-index="${index}"]`));
      const st = /** @type {HTMLSelectElement | null} */ (ocrDraftList.querySelector(`.ocr-draft-status[data-index="${index}"]`));
      const im = /** @type {HTMLSelectElement | null} */ (ocrDraftList.querySelector(`.ocr-draft-imp[data-index="${index}"]`));
      const ef = /** @type {HTMLInputElement | null} */ (ocrDraftList.querySelector(`.ocr-draft-effort[data-index="${index}"]`));
      const eu = /** @type {HTMLSelectElement | null} */ (ocrDraftList.querySelector(`.ocr-draft-effort-unit[data-index="${index}"]`));
      const d = /** @type {HTMLTextAreaElement | null} */ (ocrDraftList.querySelector(`.ocr-draft-desc[data-index="${index}"]`));
      const cb = /** @type {HTMLInputElement | null} */ (ocrDraftList.querySelector(`.ocr-draft-cb[data-index="${index}"]`));
      if (!cb || !cb.checked) return;
      const effortRaw = ef && ef.value.trim() !== "" ? Number(ef.value) : NaN;
      const effortValue = Number.isFinite(effortRaw) && effortRaw > 0 ? Math.round(effortRaw * 100) / 100 : null;
      const effortUnit = eu && eu.value === "MD" ? "MD" : "MH";
      const startDraft = s && s.value ? s.value : "";
      const endDraft = e && e.value ? e.value : "";
      const finalStart = startDraft || endDraft || toDateStrFromDate(new Date());
      const finalEnd = endDraft || startDraft || finalStart;
      const payload = {
        title: (title && title.value.trim()) || "(제목 없음)",
        startDate: finalStart,
        endDate: finalEnd,
        status: st && ["ready", "on-going", "done"].includes(st.value) ? st.value : "ready",
        importance: im && ["high", "medium", "low"].includes(im.value) ? /** @type {'high'|'medium'|'low'} */ (im.value) : "medium",
        description: d ? d.value.trim() : "",
        effortValue,
        effortUnit,
        recurrence: /** @type {'none'} */ ("none"),
        recurrenceUntil: null,
      };
      if (parseDateStr(payload.startDate) > parseDateStr(payload.endDate)) {
        payload.endDate = payload.startDate;
      }
      out.push(payload);
    });
    return out;
  }

  function openOcrModal() {
    ocrStatus.textContent = "";
    ocrResults.hidden = true;
    ocrDraftRows = [];
    ocrDraftList.innerHTML = "";
    geminiApiKeyInput.value = geminiKeyCache;
    ocrFileInput.value = "";
    ocrPreviewWrap.hidden = true;
    btnOcrRun.disabled = true;
    ocrPendingBase64 = null;
    ocrPendingMime = "image/jpeg";
    ocrBackdrop.hidden = false;
    ocrModal.hidden = false;
  }

  function closeOcrModal() {
    ocrBackdrop.hidden = true;
    ocrModal.hidden = true;
  }

  function handleSelectedOcrFile(f) {
    if (!f) {
      ocrPreviewWrap.hidden = true;
      btnOcrRun.disabled = true;
      ocrPendingBase64 = null;
      return;
    }
    ocrPendingMime = f.type || "image/jpeg";
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      if (typeof dataUrl !== "string") return;
      const comma = dataUrl.indexOf(",");
      ocrPendingBase64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
      ocrPreviewImg.src = dataUrl;
      ocrPreviewWrap.hidden = false;
      btnOcrRun.disabled = false;
    };
    reader.readAsDataURL(f);
  }

  function openCameraCapture() {
    if (!(cameraFileInput instanceof HTMLInputElement)) return;
    if (!("mediaDevices" in navigator)) {
      openAlertDialog("이 기기/브라우저는 카메라 촬영을 지원하지 않습니다.");
      return;
    }
    openOcrModal();
    cameraFileInput.value = "";
    cameraFileInput.click();
  }

  function closeModal() {
    modalBackdrop.hidden = true;
    taskModal.hidden = true;
    editingId = null;
    btnDelete.hidden = true;
    modalSessionSnapshot = null;
  }

  async function saveFromModal() {
    const title = taskTitle.value.trim();
    const status = getCurrentStatus();
    const description = taskDescription.value.trim();
    const effortInputRaw = (taskEffortValue.value || "").trim();
    const effortRaw = Number(taskEffortValue.value);
    const effortValue = Number.isFinite(effortRaw) && effortRaw > 0 ? Math.round(effortRaw * 100) / 100 : null;
    const effortUnit = taskEffortUnit.value === "MD" ? "MD" : "MH";
    const startDate = taskStart.value;
    const endDate = taskEnd.value;
    const recurrence = /** @type {'none'|'daily'|'weekly'|'monthly'} */ (taskRecurrence.value);
    let recurrenceUntil = null;
    const importance = /** @type {'high'|'medium'|'low'} */ (getCurrentImportance());
    const deliverables = collectDeliverablesFromModal();

    if (effortInputRaw === "") {
      await openAlertDialog("투입예상공수를 입력해 주세요.");
      if (taskEffortValue instanceof HTMLInputElement) {
        taskEffortValue.focus();
        taskEffortValue.select();
      }
      return;
    }

    // 새 항목에서 제목/설명이 모두 비면 저장하지 않고 닫는다 (유령 항목 생성 방지)
    if (!editingId && !title && !description && !effortValue && deliverables.length === 0) {
      closeModal();
      return;
    }

    if (taskEffortValue.value.trim() !== "" && (!Number.isFinite(effortRaw) || effortRaw <= 0)) {
      await openAlertDialog("투입예상공수는 0보다 큰 숫자로 입력해 주세요.");
      return;
    }

    if (!startDate || !endDate) {
      await openAlertDialog("시작일과 완료일을 모두 선택해 주세요.");
      return;
    }
    if (parseDateStr(startDate) > parseDateStr(endDate)) {
      await openAlertDialog("시작일이 완료일보다 늦을 수 없습니다.");
      return;
    }

    if (recurrence !== "none") {
      recurrenceUntil = getRecurrenceWindowEnd(recurrence, endDate);
      if (!recurrenceUntil) recurrenceUntil = endDate;
    }

    const payload = {
      title,
      description,
      status,
      importance,
      startDate,
      endDate,
      recurrence,
      recurrenceUntil,
      effortValue,
      effortUnit,
      deliverables,
    };

    pushUndoSnapshot();

    if (editingId) {
      const i = tasks.findIndex((x) => x.id === editingId);
      if (i >= 0) {
        const editingTask = tasks[i];
        if (recurrence !== "none") {
          const concrete = buildConcreteTasksFromRecurrence(payload, editingId);
          if (concrete.length > 0) {
            tasks[i] = concrete[0];
            await firebaseUpdateTask(editingId, concrete[0]);
            for (let c = 1; c < concrete.length; c++) {
              tasks.push(concrete[c]);
              await firebaseCreateTask(concrete[c]);
            }
          }
          renderCalendar();
          closeModal();
          return;
        }
        const occ = selectedDateStr ? getOccurrenceContaining(editingTask, selectedDateStr) : null;
        const splitOccurrence = !!(editingTask.recurrence && editingTask.recurrence !== "none" && occ && occ.start !== editingTask.startDate);
        if (splitOccurrence && occ) {
          const skipSet = new Set(normalizeRecurrenceSkipStarts(editingTask.recurrenceSkipStarts));
          skipSet.add(occ.start);
          const seriesPatch = { recurrenceSkipStarts: Array.from(skipSet).sort() };
          tasks[i] = { ...tasks[i], ...seriesPatch };
          await firebaseUpdateTask(editingId, seriesPatch);

          const detachedTask = normalizeTask({ id: uuid(), ...payload });
          tasks.push(detachedTask);
          await firebaseCreateTask(detachedTask);
        } else {
          tasks[i] = { ...tasks[i], ...payload };
          await firebaseUpdateTask(editingId, payload);
        }
      }
    } else {
      if (recurrence !== "none") {
        const concrete = buildConcreteTasksFromRecurrence(payload);
        for (let idx = 0; idx < concrete.length; idx++) {
          tasks.push(concrete[idx]);
          await firebaseCreateTask(concrete[idx]);
        }
      } else {
        const newTask = { id: uuid(), ...payload };
        tasks.push(newTask);
        await firebaseCreateTask(newTask);
      }
    }

    renderCalendar();
    closeModal();
  }

  async function deleteTask() {
    if (!editingId) return;
    const ok = await openConfirmDialog("이 일정을 삭제할까요? 반복 일정이면 전체 시리즈가 삭제됩니다.", {
      title: "삭제 확인",
      okLabel: "삭제",
      cancelLabel: "취소",
      showCancel: true,
    });
    if (!ok) return;
    pushUndoSnapshot();
    tasks = tasks.filter((x) => x.id !== editingId);
    await firebaseDeleteTask(editingId);
    renderCalendar();
    resetModalFormForNewTaskOnDay();
    renderExistingTasksList();
    taskTitle.focus();
  }

  btnNewTask.addEventListener("click", () => {
    if (!selectedDateStr) return;
    resetModalFormForNewTaskOnDay();
    renderExistingTasksList();
    taskTitle.focus();
  });

  taskStart.addEventListener("change", () => {
    if (taskStart.value && taskEnd.value && parseDateStr(taskStart.value) > parseDateStr(taskEnd.value)) {
      openAlertDialog("시작일이 완료일보다 늦을 수 없습니다.");
      taskEnd.value = taskStart.value;
    }
  });
  taskEnd.addEventListener("change", () => {
    if (taskStart.value && taskEnd.value && parseDateStr(taskStart.value) > parseDateStr(taskEnd.value)) {
      openAlertDialog("시작일이 완료일보다 늦을 수 없습니다.");
      taskEnd.value = taskStart.value;
    }
  });
  if (taskEffortValue) {
    taskEffortValue.addEventListener("input", updateActualEffortPreview);
  }
  if (taskEffortUnit) {
    taskEffortUnit.addEventListener("change", updateActualEffortPreview);
  }
  if (btnAddDeliverable) {
    btnAddDeliverable.addEventListener("click", () => {
      if (!deliverableNameInput || !deliverableImportanceInput) return;
      const name = deliverableNameInput.value.trim();
      if (!name) return;
      const importanceRaw = deliverableImportanceInput.value;
      const importance = importanceRaw === "high" || importanceRaw === "low" ? importanceRaw : "medium";
      const current = collectDeliverablesFromModal();
      current.push({ id: uuid(), name, importance, done: false, createdAt: Date.now() });
      renderDeliverableList(current);
      deliverableNameInput.value = "";
      deliverableNameInput.focus();
      refreshDeliverableHeaderUI();
      updateActualEffortPreview();
    });
  }
  if (deliverableImportanceInput) {
    deliverableImportanceInput.addEventListener("change", () => {
      refreshDeliverableHeaderUI();
    });
  }
  if (deliverableNameInput instanceof HTMLTextAreaElement) {
    bindDeliverableNameTextareaBehavior(deliverableNameInput);
    queueMicrotask(() => refreshDeliverableHeaderUI());
  }
  if (deliverableList) {
    deliverableList.addEventListener("click", (e) => {
      const target = e.target;
      if (!(target instanceof HTMLElement)) return;
      const delBtn = target.closest(".deliverable-item__delete");
      if (!(delBtn instanceof HTMLButtonElement)) return;
      const item = delBtn.closest(".deliverable-item");
      if (!(item instanceof HTMLElement)) return;
      item.remove();
      updateActualEffortPreview();
    });
    deliverableList.addEventListener("change", (e) => {
      const target = e.target;
      if (!(target instanceof HTMLElement)) return;
      const item = target.closest(".deliverable-item");
      if (!(item instanceof HTMLElement)) return;
      const cb = item.querySelector('input[type="checkbox"]');
      item.classList.toggle("deliverable-item--done", cb instanceof HTMLInputElement ? cb.checked : false);
      renderQuickMetaControls();
      updateActualEffortPreview();
    });
    deliverableList.addEventListener("input", (e) => {
      const target = e.target;
      if (!(target instanceof HTMLElement)) return;
      const item = target.closest(".deliverable-item");
      if (!(item instanceof HTMLElement)) return;
      updateActualEffortPreview();
    });
  }
  if (quickStatusGroup) {
    quickStatusGroup.addEventListener("click", async (e) => {
      const btn = e.target instanceof HTMLElement ? e.target.closest("button[data-status]") : null;
      if (!(btn instanceof HTMLButtonElement)) return;
      if (btn.disabled || btn.getAttribute("aria-disabled") === "true") return;
      const st = btn.dataset.status || "ready";
      if (editingId) {
        const i = tasks.findIndex((x) => x.id === editingId);
        if (i >= 0) {
          pushUndoSnapshot();
          tasks[i] = { ...tasks[i], status: st };
        }
        await firebaseUpdateTask(editingId, { status: st });
      } else {
        draftStatus = st;
      }
      modalDefaultWhite = false;
      renderQuickMetaControls();
      applyModalTheme();
      renderCalendar();
      if (!existingTasksWrap.hidden) renderExistingTasksList();
    });
  }
  if (quickImportanceGroup) {
    quickImportanceGroup.addEventListener("click", async (e) => {
      const btn = e.target instanceof HTMLElement ? e.target.closest("button[data-importance]") : null;
      if (!(btn instanceof HTMLButtonElement)) return;
      const imp = btn.dataset.importance || "medium";
      if (editingId) {
        const i = tasks.findIndex((x) => x.id === editingId);
        if (i >= 0) {
          pushUndoSnapshot();
          tasks[i] = { ...tasks[i], importance: imp };
        }
        await firebaseUpdateTask(editingId, { importance: imp });
      } else {
        draftImportance = imp;
      }
      renderQuickMetaControls();
      applyModalTheme();
      renderCalendar();
      if (!existingTasksWrap.hidden) renderExistingTasksList();
    });
  }

  prevMonth.addEventListener("click", () => {
    viewMonth--;
    if (viewMonth < 0) {
      viewMonth = 11;
      viewYear--;
    }
    renderCalendar();
  });

  nextMonth.addEventListener("click", () => {
    viewMonth++;
    if (viewMonth > 11) {
      viewMonth = 0;
      viewYear++;
    }
    renderCalendar();
  });

  if (btnToday) btnToday.addEventListener("click", goToToday);

  if (btnExport && btnImport && importFileInput) {
    btnExport.addEventListener("click", () => {
      const payload = {
        exportedAt: new Date().toISOString(),
        app: "calendar-app",
        version: 2,
        tasks,
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const d = new Date();
      const stamp = `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}-${pad2(d.getHours())}${pad2(d.getMinutes())}`;
      a.download = `calendar-backup-${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    });

    btnImport.addEventListener("click", () => {
      importFileInput.value = "";
      importFileInput.click();
    });

    importFileInput.addEventListener("change", async () => {
      const f = importFileInput.files && importFileInput.files[0];
      if (!f) return;
      try {
        const txt = await f.text();
        const parsed = JSON.parse(txt);
        const incoming = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.tasks) ? parsed.tasks : null;
        if (!incoming) {
          alert("가져오기 파일 형식이 올바르지 않습니다. (tasks 배열 필요)");
          return;
        }
        const ok = await openConfirmDialog("현재 일정을 가져온 파일로 덮어쓸까요?", {
          title: "가져오기 확인",
          okLabel: "가져오기",
          cancelLabel: "취소",
          showCancel: true,
        });
        if (!ok) return;
        tasks = incoming.map(normalizeTask);
        await saveTasks();
        renderCalendar();
        updateSearchResults();
        alert(`가져오기 완료: ${tasks.length}건`);
      } catch (e) {
        alert("가져오기 실패: JSON 파일을 확인해 주세요.");
      }
    });
  }

  if (
    btnOpenOcr &&
    btnOpenCamera &&
    cameraFileInput &&
    ocrModal &&
    ocrBackdrop &&
    btnOcrClose &&
    btnSaveGeminiKey &&
    geminiApiKeyInput &&
    ocrFileInput &&
    ocrDropZone &&
    ocrPreviewWrap &&
    ocrPreviewImg &&
    ocrStatus &&
    btnOcrRun &&
    ocrResults &&
    ocrDraftList &&
    btnOcrApply
  ) {
    btnOpenOcr.addEventListener("click", openOcrModal);
    btnOpenCamera.addEventListener("click", openCameraCapture);
    btnOcrClose.addEventListener("click", closeOcrModal);
    ocrBackdrop.addEventListener("click", closeOcrModal);
    btnSaveGeminiKey.addEventListener("click", () => {
      saveGeminiKeyToStorage(geminiApiKeyInput.value);
      ocrStatus.textContent = "API 키를 이 브라우저에 저장했습니다.";
    });
    ocrFileInput.addEventListener("change", () => {
      const f = ocrFileInput.files && ocrFileInput.files[0];
      handleSelectedOcrFile(f || null);
    });
    cameraFileInput.addEventListener("change", () => {
      const f = cameraFileInput.files && cameraFileInput.files[0];
      handleSelectedOcrFile(f || null);
    });
    ocrDropZone.addEventListener("click", () => ocrFileInput.click());
    ocrDropZone.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        ocrFileInput.click();
      }
    });
    ["dragenter", "dragover"].forEach((evt) => {
      ocrDropZone.addEventListener(evt, (e) => {
        e.preventDefault();
        e.stopPropagation();
        ocrDropZone.classList.add("ocr-drop-zone--dragover");
      });
    });
    ["dragleave", "drop"].forEach((evt) => {
      ocrDropZone.addEventListener(evt, (e) => {
        e.preventDefault();
        e.stopPropagation();
        ocrDropZone.classList.remove("ocr-drop-zone--dragover");
      });
    });
    ocrDropZone.addEventListener("drop", (e) => {
      const dt = e.dataTransfer;
      const f = dt && dt.files && dt.files[0];
      handleSelectedOcrFile(f || null);
    });
    btnOcrRun.addEventListener("click", async () => {
      const key = (geminiApiKeyInput.value || "").trim();
      if (!key) {
        ocrStatus.textContent = "API 키를 입력하거나 「키 저장」을 눌러 주세요.";
        return;
      }
      if (!ocrPendingBase64) {
        ocrStatus.textContent = "이미지를 먼저 선택해 주세요.";
        return;
      }
      ocrStatus.textContent = "인식 중…";
      btnOcrRun.disabled = true;
      try {
        ocrDraftRows = await runGeminiOcr(ocrPendingBase64, ocrPendingMime, key);
        if (!ocrDraftRows.length) {
          ocrStatus.textContent = "인식된 할일이 없습니다. 다른 사진으로 시도해 보세요.";
          ocrResults.hidden = true;
          return;
        }
        renderOcrDraftList();
        ocrResults.hidden = false;
        ocrStatus.textContent = `${ocrDraftRows.length}건을 인식했습니다. 수정 후 「선택 항목 달력에 추가」를 누르세요.`;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (/api key not valid|permission|referer|denied|forbidden|401|403/i.test(msg)) {
          ocrStatus.textContent =
            "오류: API 키 권한/제한 문제입니다. Google AI Studio에서 키 제한(HTTP 리퍼러/IP) 또는 프로젝트 권한을 확인해 주세요.";
        } else if (/quota|rate|429/i.test(msg)) {
          ocrStatus.textContent = "오류: 사용량 한도(Quota) 초과입니다. 잠시 후 다시 시도하거나 결제/쿼터를 확인해 주세요.";
        } else {
          ocrStatus.textContent = "오류: " + msg;
        }
        ocrResults.hidden = true;
      } finally {
        btnOcrRun.disabled = false;
      }
    });
    btnOcrApply.addEventListener("click", async () => {
      const payloads = readOcrDraftFromDom();
      if (!payloads.length) {
        alert("추가할 항목을 하나 이상 선택해 주세요.");
        return;
      }
      const newTasks = payloads.map((p) => normalizeTask({ id: uuid(), ...p }));
      const prevTasks = tasks.slice();
      try {
        ocrStatus.textContent = "달력에 저장 중…";
        btnOcrApply.disabled = true;
        await waitForFirebaseReady();
        tasks.push(...newTasks);
        await saveTasks();
        const snap = await firebaseTasksRef.once("value");
        const v = snap.val();
        const list = v && typeof v === "object" ? Object.values(v) : [];
        tasks = list.map(normalizeTask);
        const first = newTasks[0];
        if (first && first.startDate) {
          const anchor = parseDateStr(first.startDate);
          if (!Number.isNaN(anchor.getTime())) {
            viewYear = anchor.getFullYear();
            viewMonth = anchor.getMonth();
          }
        }
        renderCalendar();
        ocrStatus.textContent = `저장 완료: ${newTasks.length}건`;
        closeOcrModal();
      } catch (e) {
        tasks = prevTasks;
        renderCalendar();
        console.error("OCR apply failed:", e);
        const msg = e instanceof Error ? e.message : String(e);
        ocrStatus.textContent = "저장 실패: " + msg;
        alert("달력 저장 중 오류가 발생했습니다: " + msg);
      } finally {
        btnOcrApply.disabled = false;
      }
    });
  }

  searchInput.addEventListener("input", updateSearchResults);
  searchStatus.addEventListener("change", updateSearchResults);

  btnUndo.addEventListener("click", restoreModalSnapshot);
  modalBackdrop.addEventListener("click", () => {
    if (taskModal.hidden) return;
    if (isEffectivelyEmptyDraft()) {
      closeModal();
      return;
    }
    if (hasModalDraftChanges()) {
      void saveFromModal();
      return;
    }
    closeModal();
  });

  btnSave.addEventListener("click", saveFromModal);
  btnDelete.addEventListener("click", deleteTask);

  document.addEventListener("keydown", (e) => {
    const target = e.target;
    const inEditable =
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      (target instanceof HTMLElement && target.isContentEditable);
    if (inEditable) return;
    const key = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && key === "z") {
      e.preventDefault();
      void undoOnce();
      return;
    }
    if (((e.ctrlKey || e.metaKey) && key === "y") || ((e.ctrlKey || e.metaKey) && e.shiftKey && key === "z")) {
      e.preventDefault();
      void redoOnce();
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (confirmPop && !confirmPop.hidden) {
      e.preventDefault();
      if (confirmCancel && !confirmCancel.hidden) confirmCancel.click();
      else if (confirmOk) confirmOk.click();
      return;
    }
    if (ocrModal && !ocrModal.hidden) {
      e.preventDefault();
      closeOcrModal();
      return;
    }
    if (!taskModal.hidden) {
      e.preventDefault();
      closeModal();
    }
  });

  window.addEventListener("resize", () => {
    requestAnimationFrame(renderMultiDayRangeLines);
  });

  function startRecurrenceWatcher() {
    if (recurrenceWatchTimer) clearInterval(recurrenceWatchTimer);
    recurrenceWatchTimer = setInterval(() => {
      checkAndHandleRecurrenceExtension().catch((err) => {
        console.error("recurrence extension check error:", err);
      });
    }, 60 * 1000);
  }

  (async () => {
    await loadGeminiKey();
    await loadTasks();
    updateTopbarDatePill();
    await checkAndHandleRecurrenceExtension();
    startRecurrenceWatcher();
    renderCalendar();
  })();
})();
