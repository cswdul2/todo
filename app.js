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
  * @property {Array<{id: string, name: string, importance: 'high'|'medium'|'low', done: boolean, completedAt?: string | null, createdAt?: number | null}>} deliverables
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
  const taskEffortUnitToggle = document.getElementById("taskEffortUnitToggle");
  const taskActualEffortValue = document.getElementById("taskActualEffortValue");
  const deliverableNameInput = document.getElementById("deliverableNameInput");
  const deliverableImportanceInput = document.getElementById("deliverableImportanceInput");
  const btnDeliverableAddToggle = document.getElementById("btnDeliverableAddToggle");
  const deliverableEditor = document.getElementById("deliverableEditor");
  const deliverableEditorHead = document.getElementById("deliverableEditorHead");
  const deliverableList = document.getElementById("deliverableList");
  const taskStart = document.getElementById("taskStart");
  const taskEnd = document.getElementById("taskEnd");
  const taskRecurrence = document.getElementById("taskRecurrence");
  const modalTodayDisplay = document.getElementById("modalTodayDisplay");
  const btnDelete = document.getElementById("btnDelete");
  const existingTasksWrap = document.getElementById("existingTasksWrap");
  const existingTasksList = document.getElementById("existingTasksList");
  const btnNewTask = document.getElementById("btnNewTask");
  const btnCloseModalTop = document.getElementById("btnCloseModalTop");
  const btnCloseModalBottom = document.getElementById("btnCloseModalBottom");
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
  const OCR_TASK_DEFAULTS = {
    status: "ready",
    importance: "medium",
    effortValue: 4,
    effortUnit: "MH",
    recurrence: "none",
  };
  /** 새 일정 작성용 임시 상태/중요도 */
  let draftStatus = "ready";
  let draftImportance = "medium";
  /** 산출물 입력행에서 등급을 직접 고른 적이 있는지 (고르기 전에는 회색 박스) */
  let deliverableHeadImpPicked = false;
  /** 산출물 등록 애니메이션 진행 중이면 중복 등록을 막는다 */
  let deliverableCommitBusy = false;
  /** @type {string | null} */
  let ocrPendingBase64 = null;
  /** @type {string} */
  let ocrPendingMime = "image/jpeg";
  const GEMINI_API_KEY_STORAGE = "calendar-app-gemini-api-key-v1";
  let geminiKeyCache = "";
  let firebaseDb = null;
  let firebaseTasksRef = null;
  let overlayLockScrollY = 0;
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
  let statusBlockHintEl = null;
  let statusBlockHintHideTimer = null;
  let statusBlockHintDismissHandler = null;
  let statusBlockHintAnchorEl = null;
  let lastPointerClientX = -1;
  let lastPointerClientY = -1;
  let suppressRangeClickTaskId = null;
  let suppressRangeClickUntil = 0;
  /** @type {null | { tasks: Task[], selectedDateStr: string | null, editingId: string | null, modalDefaultWhite: boolean, form: { title: string, description: string, effortValue: string, effortUnit: string, startDate: string, endDate: string, recurrence: 'none'|'daily'|'weekly'|'monthly', status: string, importance: string, deliverables: Array<{id: string, name: string, importance: 'high'|'medium'|'low', done: boolean, completedAt?: string | null, createdAt?: number | null}>, deliverableName: string, deliverableImportance: string } }} */
  let modalSessionSnapshot = null;
  const RECURRENCE_ALERT_STATE_KEY = "calendar-app-recurrence-alert-state-v1";
  let recurrenceWatchTimer = null;
  // 이전 실행에서 남아있을 수 있는 커스텀 툴팁 노드 정리
  document.querySelectorAll(".range-line-tooltip").forEach((el) => el.remove());
  document.querySelectorAll(".status-block-hint").forEach((el) => el.remove());

  function ensureStatusBlockHint() {
    if (statusBlockHintEl && document.body.contains(statusBlockHintEl)) return statusBlockHintEl;
    const existing = document.querySelector(".status-block-hint");
    if (existing instanceof HTMLElement) {
      statusBlockHintEl = existing;
      return statusBlockHintEl;
    }
    const hint = document.createElement("div");
    hint.className = "status-block-hint";
    hint.hidden = true;
    hint.setAttribute("role", "status");
    hint.setAttribute("aria-live", "polite");
    document.body.appendChild(hint);
    statusBlockHintEl = hint;
    return hint;
  }

  function hideStatusBlockHint() {
    if (statusBlockHintHideTimer) {
      clearTimeout(statusBlockHintHideTimer);
      statusBlockHintHideTimer = null;
    }
    if (statusBlockHintDismissHandler) {
      document.removeEventListener("mousedown", statusBlockHintDismissHandler, true);
      document.removeEventListener("touchstart", statusBlockHintDismissHandler, true);
      statusBlockHintDismissHandler = null;
    }
    statusBlockHintAnchorEl = null;
    if (!statusBlockHintEl) return;
    statusBlockHintEl.hidden = true;
    statusBlockHintEl.classList.remove("status-block-hint--show");
  }

  function showStatusBlockHint(anchorEl, message) {
    if (!(anchorEl instanceof HTMLElement)) return;
    const hint = ensureStatusBlockHint();
    hint.textContent = message;
    hint.hidden = false;
    hint.classList.add("status-block-hint--show");
    statusBlockHintAnchorEl = anchorEl;
    const anchorRect = anchorEl.getBoundingClientRect();
    const hintRect = hint.getBoundingClientRect();
    const pad = 8;
    let left = anchorRect.left + anchorRect.width / 2 - hintRect.width / 2;
    left = Math.max(pad, Math.min(window.innerWidth - hintRect.width - pad, left));
    let top = anchorRect.bottom + 8;
    if (top + hintRect.height > window.innerHeight - pad) {
      top = Math.max(pad, anchorRect.top - hintRect.height - 8);
    }
    hint.style.left = `${Math.round(left)}px`;
    hint.style.top = `${Math.round(top)}px`;

    if (statusBlockHintHideTimer) clearTimeout(statusBlockHintHideTimer);
    statusBlockHintHideTimer = setTimeout(() => {
      hideStatusBlockHint();
      statusBlockHintHideTimer = null;
    }, 2000);
    if (statusBlockHintDismissHandler) {
      document.removeEventListener("mousedown", statusBlockHintDismissHandler, true);
      document.removeEventListener("touchstart", statusBlockHintDismissHandler, true);
    }
    statusBlockHintDismissHandler = (evt) => {
      const target = evt.target;
      if (!(target instanceof Node)) {
        hideStatusBlockHint();
        return;
      }
      if (hint.contains(target)) return;
      if (statusBlockHintAnchorEl instanceof HTMLElement && statusBlockHintAnchorEl.contains(target)) return;
      hideStatusBlockHint();
    };
    document.addEventListener("mousedown", statusBlockHintDismissHandler, true);
    document.addEventListener("touchstart", statusBlockHintDismissHandler, true);
  }

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
    modalTodayDisplay.textContent = toDateStrFromDate(new Date());
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

  function pickTopPlannedTaskForDate(dateStr) {
    const onDay = tasks.filter((t) => taskCoversDate(t, dateStr));
    if (!onDay.length) return null;
    const sorted = [...onDay].sort((a, b) => {
      const mhDiff = taskTotalMh(b) - taskTotalMh(a);
      if (Math.abs(mhDiff) > 1e-9) return mhDiff;
      const ia = IMP_ORDER[a.importance] ?? 1;
      const ib = IMP_ORDER[b.importance] ?? 1;
      if (ia !== ib) return ia - ib;
      return taskLabel(a).localeCompare(taskLabel(b), "ko");
    });
    return sorted[0] || null;
  }

  function importanceWeight(importance) {
    if (importance === "high") return 3;
    if (importance === "low") return 1;
    return 2;
  }

  const DELIVERABLE_NAME_MAX_LINES = 5;

  /** @returns {'high'|'medium'|'low'} */

  function normalizeCompletedAtDate(raw) {
    if (raw == null) return null;
    const s = String(raw).trim();
    if (!s) return null;
    const digitsOnly = s.replace(/\D/g, "");
    if (/^\d{6}$/.test(digitsOnly)) {
      const y = 2000 + Number(digitsOnly.slice(0, 2));
      const m = Number(digitsOnly.slice(2, 4));
      const d = Number(digitsOnly.slice(4, 6));
      if (m >= 1 && m <= 12 && d >= 1 && d <= 31) return `${y}-${pad2(m)}-${pad2(d)}`;
    }
    if (/^\d{8}$/.test(digitsOnly)) {
      const y = Number(digitsOnly.slice(0, 4));
      const m = Number(digitsOnly.slice(4, 6));
      const d = Number(digitsOnly.slice(6, 8));
      if (m >= 1 && m <= 12 && d >= 1 && d <= 31) return `${y}-${pad2(m)}-${pad2(d)}`;
    }
    const ymd = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
    if (ymd) {
      const y = Number(ymd[1]);
      const m = Number(ymd[2]);
      const d = Number(ymd[3]);
      if (m < 1 || m > 12 || d < 1 || d > 31) return null;
      return `${y}-${pad2(m)}-${pad2(d)}`;
    }
    const short = s.match(/^(\d{2})[-/.](\d{1,2})[-/.](\d{1,2})$/);
    if (short) {
      const y = 2000 + Number(short[1]);
      const m = Number(short[2]);
      const d = Number(short[3]);
      if (m < 1 || m > 12 || d < 1 || d > 31) return null;
      return `${y}-${pad2(m)}-${pad2(d)}`;
    }
    return null;
  }

  function formatDeliverableDateShort(isoDate) {
    const normalized = normalizeCompletedAtDate(isoDate);
    if (!normalized) return "";
    const [y, m, d] = normalized.split("-");
    return `${y.slice(2)}.${m}.${d}`;
  }

  function normalizeDeliverableDateDisplay(raw) {
    const digits = String(raw == null ? "" : raw).replace(/\D/g, "").slice(0, 8);
    if (!digits) return "";
    if (digits.length <= 2) return digits;
    if (digits.length <= 4) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
    if (digits.length <= 6) return `${digits.slice(0, 2)}.${digits.slice(2, 4)}.${digits.slice(4)}`;
    return `${digits.slice(0, 4)}.${digits.slice(4, 6)}.${digits.slice(6, 8)}`;
  }

  /** 완료날짜가 있으면 그 날짜 기준으로 완료. 구버전 done만 있으면 전 기간 완료로 본다. */
  function isDeliverableCompleteOnDate(row, dateStr) {
    if (!row) return false;
    const completedAt = normalizeCompletedAtDate(row.completedAt);
    if (completedAt) {
      if (!dateStr) return true;
      return completedAt <= dateStr;
    }
    return !!row.done;
  }

  function isDeliverableComplete(row) {
    if (!row) return false;
    if (normalizeCompletedAtDate(row.completedAt)) return true;
    return !!row.done;
  }

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

  function isDeliverableInputRowOpen() {
    return deliverableEditorHead instanceof HTMLElement && !deliverableEditorHead.hidden;
  }

  /** 산출물 입력행은 「＋」를 누를 때만 열린다. */
  function setDeliverableInputRowOpen(open, opts = {}) {
    if (!(deliverableEditorHead instanceof HTMLElement)) return;
    deliverableEditorHead.hidden = !open;
    if (btnDeliverableAddToggle instanceof HTMLElement) {
      btnDeliverableAddToggle.setAttribute("aria-expanded", open ? "true" : "false");
      btnDeliverableAddToggle.textContent = open ? "➖" : "➕";
      const label = open ? "산출물 입력칸 닫기" : "산출물 입력칸 열기";
      btnDeliverableAddToggle.setAttribute("aria-label", label);
      btnDeliverableAddToggle.title = label;
    }
    if (open) {
      refreshDeliverableHeaderUI();
      if (opts.focus && deliverableNameInput instanceof HTMLTextAreaElement) deliverableNameInput.focus();
    }
  }

  function resetDeliverableInputRow() {
    if (deliverableNameInput) deliverableNameInput.value = "";
    if (deliverableImportanceInput) deliverableImportanceInput.value = "high";
    deliverableHeadImpPicked = false;
    setDeliverableInputRowOpen(false);
    refreshDeliverableHeaderUI();
  }

  /**
   * 입력행 → 목록으로 내려가는 이동 애니메이션.
   * @param {HTMLElement} fromEl
   * @param {HTMLElement} toEl
   * @param {{ name: string, importance: string }} payload
   */
  function playDeliverableDropAnimation(fromEl, toEl, payload) {
    if (!(fromEl instanceof HTMLElement) || !(toEl instanceof HTMLElement)) return Promise.resolve();
    const from = fromEl.getBoundingClientRect();
    const to = toEl.getBoundingClientRect();
    if (from.width < 2 || to.width < 2) return Promise.resolve();

    const ghost = document.createElement("div");
    ghost.className =
      "deliverable-fly" +
      (payload.importance === "high"
        ? " deliverable-imp-band--high"
        : payload.importance === "low"
          ? " deliverable-imp-band--low"
          : " deliverable-imp-band--medium");
    ghost.textContent = payload.name;
    ghost.style.left = `${from.left}px`;
    ghost.style.top = `${from.top}px`;
    ghost.style.width = `${from.width}px`;
    ghost.style.height = `${from.height}px`;
    document.body.appendChild(ghost);
    toEl.classList.add("deliverable-item--enter-target");

    return new Promise((resolve) => {
      requestAnimationFrame(() => {
        ghost.style.transform = `translate(${to.left - from.left}px, ${to.top - from.top}px) scale(0.98)`;
        ghost.style.width = `${to.width}px`;
        ghost.style.height = `${to.height}px`;
        ghost.style.opacity = "0.35";
      });
      const finish = () => {
        ghost.remove();
        toEl.classList.remove("deliverable-item--enter-target");
        toEl.classList.add("deliverable-item--just-added");
        window.setTimeout(() => toEl.classList.remove("deliverable-item--just-added"), 420);
        resolve();
      };
      ghost.addEventListener("transitionend", finish, { once: true });
      window.setTimeout(finish, 380);
    });
  }

  /**
   * 입력행의 내용을 산출물 목록에 추가한다.
   * @param {{ keepFocus?: boolean, closeAfter?: boolean }} opts
   */
  function commitDeliverableFromInputRow(opts = {}) {
    if (deliverableCommitBusy) return false;
    if (!deliverableNameInput || !deliverableImportanceInput) return false;
    const name = deliverableNameInput.value.trim();
    if (!name) {
      if (opts.closeAfter) resetDeliverableInputRow();
      return false;
    }
    const importanceRaw = deliverableImportanceInput.value;
    const importance = importanceRaw === "high" || importanceRaw === "low" ? importanceRaw : "medium";
    const newId = uuid();
    const fromEl = deliverableEditorHead;
    const current = collectDeliverablesFromModal();
    current.push({ id: newId, name, importance, done: false, completedAt: null, createdAt: Date.now() });
    deliverableCommitBusy = true;
    renderDeliverableList(current);
    const toEl = deliverableList
      ? /** @type {HTMLElement | null} */ (deliverableList.querySelector(`.deliverable-item[data-id="${newId}"]`))
      : null;

    deliverableNameInput.value = "";
    deliverableHeadImpPicked = false;
    refreshDeliverableHeaderUI();
    updateActualEffortPreview();

    const afterAnim = () => {
      deliverableCommitBusy = false;
      if (opts.closeAfter) {
        resetDeliverableInputRow();
        return;
      }
      if (opts.keepFocus && deliverableNameInput instanceof HTMLTextAreaElement) {
        setDeliverableInputRowOpen(true, { focus: true });
      }
    };

    if (fromEl instanceof HTMLElement && toEl instanceof HTMLElement) {
      void playDeliverableDropAnimation(fromEl, toEl, { name, importance }).then(afterAnim);
    } else {
      afterAnim();
    }
    return true;
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
        commitDeliverableFromInputRow({ keepFocus: true });
      }
    );
  }

  /** 입력행은 등급을 고르기 전까지 회색 박스로 둔다. */
  function syncDeliverableHeadImpBandFromSelect() {
    if (!(deliverableEditorHead instanceof HTMLElement)) return;
    deliverableEditorHead.classList.remove(
      "deliverable-imp-band--high",
      "deliverable-imp-band--medium",
      "deliverable-imp-band--low"
    );
    if (!deliverableHeadImpPicked || !(deliverableImportanceInput instanceof HTMLSelectElement)) return;
    applyDeliverableImpBand(deliverableEditorHead, deliverableNormalizedImportance(deliverableImportanceInput.value));
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
        const completedAt = normalizeCompletedAtDate(row && row.completedAt);
        const done = !!completedAt || !!(row && row.done);
        return {
          id,
          name,
          importance,
          done,
          completedAt,
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
      Object.entries(row).forEach(([id, val]) => {
        if (typeof val === "string" && normalizeCompletedAtDate(val)) item[String(id)] = normalizeCompletedAtDate(val);
        else item[String(id)] = !!val;
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
        viewRows = rows.map((r) => {
          const state = rowState[r.id];
          if (typeof state === "string") {
            const completedAt = normalizeCompletedAtDate(state);
            return { ...r, completedAt, done: !!completedAt };
          }
          return { ...r, done: !!state, completedAt: r.completedAt || null };
        });
      }
    }
    const totalWeight = viewRows.reduce((acc, row) => acc + importanceWeight(row.importance), 0);
    if (totalWeight <= 0) return 0;
    const doneWeight = viewRows
      .filter((row) => isDeliverableCompleteOnDate(row, dateStr))
      .reduce((acc, row) => acc + importanceWeight(row.importance), 0);
    return Math.max(0, Math.min(1, doneWeight / totalWeight));
  }

  function taskProgressRatio(task) {
    const rows = normalizeDeliverables(task.deliverables);
    if (!rows.length) return task.status === "done" ? 1 : 0;
    const totalWeight = rows.reduce((acc, row) => acc + importanceWeight(row.importance), 0);
    if (totalWeight <= 0) return 0;
    const doneWeight = rows.filter((row) => isDeliverableComplete(row)).reduce((acc, row) => acc + importanceWeight(row.importance), 0);
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
    const totalMh = taskTotalMh(task);
    if (!totalMh) return 0;

    let viewRows = normalizeDeliverables(task.deliverables);
    if (!viewRows.length) {
      return task.status === "done" ? totalMh / diffDaysInclusive(occ.start, occ.end) : 0;
    }

    if (task.recurrence && task.recurrence !== "none" && dateStr) {
      const recOcc = getOccurrenceContaining(task, dateStr);
      if (recOcc && recOcc.start !== task.startDate) {
        const progress = cloneRecurrenceProgress(task.recurrenceProgress);
        const rowState = progress[recOcc.start] || {};
        viewRows = viewRows.map((r) => {
          const state = rowState[r.id];
          if (typeof state === "string") {
            const completedAt = normalizeCompletedAtDate(state);
            return { ...r, completedAt, done: !!completedAt };
          }
          return { ...r, done: !!state, completedAt: null };
        });
      }
    }

    const totalWeight = viewRows.reduce((acc, row) => acc + importanceWeight(row.importance), 0);
    if (totalWeight <= 0) return 0;

    // (예상MH / 중요도합) × 그날 완료 산출물 중요도 — 완료일에만 귀속
    let spent = 0;
    viewRows.forEach((row) => {
      const completedAt = normalizeCompletedAtDate(row.completedAt);
      const completedToday = completedAt ? completedAt === dateStr : !!row.done && dateStr === occ.start;
      if (!completedToday) return;
      spent += (totalMh / totalWeight) * importanceWeight(row.importance);
    });
    return spent;
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
    if (!occ) return rows.map((row) => ({ ...row, done: false, completedAt: null }));
    const progress = cloneRecurrenceProgress(task.recurrenceProgress);
    const rowState = progress[occ.start] || {};
    return rows.map((row) => {
      const state = rowState[row.id];
      if (typeof state === "string") {
        const completedAt = normalizeCompletedAtDate(state);
        return { ...row, completedAt, done: !!completedAt };
      }
      return { ...row, done: !!state, completedAt: null };
    });
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

  /** 달력: 모양 = 중요도(별/삼각/원), 채움색 = 진행 상태(기한초과=빨강) */
  function importanceWrapClass(imp) {
    if (imp === "high") return "calendar-cell__dot-wrap calendar-cell__dot-wrap--high";
    if (imp === "low") return "calendar-cell__dot-wrap calendar-cell__dot-wrap--low";
    return "calendar-cell__dot-wrap calendar-cell__dot-wrap--medium";
  }

  function importanceShapeClass(imp) {
    if (imp === "high") return "calendar-cell__dot-mark--star";
    if (imp === "low") return "calendar-cell__dot-mark--circle";
    return "calendar-cell__dot-mark--triangle";
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
    if (status === "done") return "#43a047";
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

  function getDeliverableProgress(rows) {
    const normalized = Array.isArray(rows) ? rows : [];
    const total = normalized.length;
    if (!total) {
      return { total: 0, doneCount: 0, anyDone: false, allDone: false, phase: /** @type {const} */ ("none") };
    }
    const doneCount = normalized.filter((row) => isDeliverableComplete(row)).length;
    const anyDone = doneCount > 0;
    const allDone = doneCount === total;
    /** @type {'none'|'idle'|'partial'|'complete'} */
    let phase = "idle";
    if (allDone) phase = "complete";
    else if (anyDone) phase = "partial";
    return { total, doneCount, anyDone, allDone, phase };
  }

  /**
   * 산출물 진행도에 따른 상태 변경 허용 여부.
   * @param {string} targetStatus
   * @param {Array<{done?: boolean, completedAt?: string | null}>} rows
   * @returns {{ allowed: boolean, message: string | null }}
   */
  function evaluateStatusChange(targetStatus, rows) {
    const st = targetStatus === "on-going" || targetStatus === "done" ? targetStatus : "ready";
    const { total, phase } = getDeliverableProgress(rows);
    if (!total) return { allowed: true, message: null };

    if (phase === "partial") {
      if (st === "ready") return { allowed: false, message: "이미 완료된 산출물이 있습니다" };
      if (st === "done") return { allowed: false, message: "예상산출물이 아직 남아있습니다" };
      return { allowed: true, message: null };
    }

    if (phase === "complete") {
      if (st === "ready" || st === "on-going") {
        return { allowed: false, message: "모든 산출물을 완수했습니다" };
      }
      return { allowed: true, message: null };
    }

    // idle: 산출물 있으나 하나도 미완료
    if (st === "done") return { allowed: false, message: "예상산출물이 아직 남아있습니다" };
    return { allowed: true, message: null };
  }

  function deriveStatusFromDeliverables(currentStatus, rows) {
    const { total, phase } = getDeliverableProgress(rows);
    if (!total) return currentStatus;
    if (phase === "complete") return "done";
    if (phase === "partial") return "on-going";
    // idle: 완료된 산출물 없음 — done이면 ready로 되돌림
    if (currentStatus === "done") return "ready";
    return currentStatus;
  }

  function isCoarsePointerDevice() {
    return typeof window.matchMedia === "function" && window.matchMedia("(hover: none) and (pointer: coarse)").matches;
  }

  function normalizeViewportAfterOverlayClose() {
    if (!isCoarsePointerDevice()) return;
    document.querySelectorAll("input, textarea, select").forEach((el) => {
      if (el instanceof HTMLElement && typeof el.blur === "function") el.blur();
    });
    const resetX = () => {
      const y = window.scrollY || window.pageYOffset || 0;
      window.scrollTo(0, y);
      document.documentElement.scrollLeft = 0;
      document.body.scrollLeft = 0;
    };
    resetX();
    requestAnimationFrame(resetX);
    setTimeout(resetX, 120);
    setTimeout(resetX, 320);
  }

  function syncOverlayScrollLock() {
    const modalOpen = taskModal instanceof HTMLElement && !taskModal.hidden;
    const ocrOpen = ocrModal instanceof HTMLElement && !ocrModal.hidden;
    const confirmOpen = confirmPop instanceof HTMLElement && !confirmPop.hidden;
    const shouldLock = modalOpen || ocrOpen || confirmOpen;
    const wasLocked = document.body.classList.contains("body--overlay-open");
    if (shouldLock && !wasLocked && isCoarsePointerDevice()) {
      overlayLockScrollY = window.scrollY || window.pageYOffset || 0;
      document.body.style.position = "fixed";
      document.body.style.top = `-${overlayLockScrollY}px`;
      document.body.style.left = "0";
      document.body.style.right = "0";
      document.body.style.width = "100%";
    }
    document.body.classList.toggle("body--overlay-open", shouldLock);
    if (wasLocked && !shouldLock) {
      if (isCoarsePointerDevice()) {
        document.body.style.position = "";
        document.body.style.top = "";
        document.body.style.left = "";
        document.body.style.right = "";
        document.body.style.width = "";
        window.scrollTo(0, overlayLockScrollY);
      }
      normalizeViewportAfterOverlayClose();
    }
  }

  function canSetDoneStatusFromModal() {
    return evaluateStatusChange("done", collectDeliverablesFromModal()).allowed;
  }

  function canSetDoneStatusForTaskOnDate(task, dateStr) {
    if (!task) return false;
    const rows = getModalDeliverablesForDate(task, dateStr || task.startDate || null);
    return evaluateStatusChange("done", rows).allowed;
  }

  function getModalStatusBlockMessage(targetStatus) {
    return evaluateStatusChange(targetStatus, collectDeliverablesFromModal()).message;
  }

  function getTaskStatusBlockMessage(task, dateStr, targetStatus) {
    if (!task) return null;
    const rows = getModalDeliverablesForDate(task, dateStr || task.startDate || null);
    return evaluateStatusChange(targetStatus, rows).message;
  }

  async function applyDerivedStatusFromModalDeliverables() {
    const rows = collectDeliverablesFromModal();
    const current = getCurrentStatus();
    const next = deriveStatusFromDeliverables(current, rows);
    if (next === current) return;

    if (editingId) {
      const i = tasks.findIndex((x) => x.id === editingId);
      if (i >= 0) {
        tasks[i] = { ...tasks[i], status: next };
        await firebaseUpdateTask(editingId, { status: next });
      }
    } else {
      draftStatus = next;
    }

    modalDefaultWhite = false;
    renderQuickMetaControls();
    applyModalTheme();
    renderCalendar();
    if (!existingTasksWrap.hidden) renderExistingTasksList();
  }

  async function enforceDoneStatusConstraint() {
    await applyDerivedStatusFromModalDeliverables();
  }

  async function autoPromoteDoneStatusWhenEligible() {
    await applyDerivedStatusFromModalDeliverables();
  }

  async function autoPromoteOngoingWhenStarted() {
    await applyDerivedStatusFromModalDeliverables();
  }

  function renderQuickMetaControls() {
    const status = getCurrentStatus();
    const imp = getCurrentImportance();
    if (quickStatusGroup) {
      const buttons = quickStatusGroup.querySelectorAll("button[data-status]");
      const rows = collectDeliverablesFromModal();
      buttons.forEach((btn) => {
        const st = btn.getAttribute("data-status") || "ready";
        const blocked = !evaluateStatusChange(st, rows).allowed;
        const active = !blocked && st === status;
        btn.disabled = false;
        btn.setAttribute("aria-disabled", blocked ? "true" : "false");
        btn.classList.toggle("modal__quick-btn--disabled-done", blocked);
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

  function renderEffortUnitToggle() {
    if (!taskEffortUnitToggle || !taskEffortUnit) return;
    const unit = taskEffortUnit.value === "MD" ? "MD" : "MH";
    const buttons = taskEffortUnitToggle.querySelectorAll("button[data-unit]");
    buttons.forEach((btn) => {
      const active = btn.getAttribute("data-unit") === unit;
      btn.classList.toggle("modal__quick-unit-btn--active", active);
      btn.setAttribute("aria-checked", active ? "true" : "false");
    });
  }

  function formatEffortInputValue(v) {
    if (!Number.isFinite(v) || v <= 0) return "";
    const rounded = Math.round(v * 10000) / 10000;
    return String(rounded).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
  }

  function setEffortUnit(nextUnitRaw) {
    if (!taskEffortUnit || !taskEffortValue) return;
    const nextUnit = nextUnitRaw === "MD" ? "MD" : "MH";
    const prevUnit = taskEffortUnit.value === "MD" ? "MD" : "MH";
    if (prevUnit === nextUnit) {
      renderEffortUnitToggle();
      updateActualEffortPreview();
      return;
    }
    const raw = Number(taskEffortValue.value);
    if (Number.isFinite(raw) && raw > 0) {
      const mh = prevUnit === "MD" ? raw * 24 : raw;
      const nextValue = nextUnit === "MD" ? mh / 24 : mh;
      taskEffortValue.value = formatEffortInputValue(nextValue);
    }
    taskEffortUnit.value = nextUnit;
    renderEffortUnitToggle();
    updateActualEffortPreview();
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

  async function ensureFirebaseAnonymousAuth(app) {
    if (!window.firebase || !window.firebase.auth) {
      throw new Error("Firebase Auth SDK가 로드되지 않았습니다.");
    }
    const auth = window.firebase.auth(app);
    if (auth.currentUser) return auth.currentUser;
    const cred = await auth.signInAnonymously();
    return cred.user;
  }

  async function loadTasks() {
    if (!window.firebase || !window.firebase.apps) {
      console.error("Firebase SDK가 로드되지 않았습니다.");
      return;
    }
    const app = window.firebase.apps.length ? window.firebase.app() : window.firebase.initializeApp(FIREBASE_CONFIG);
    try {
      await ensureFirebaseAnonymousAuth(app);
    } catch (err) {
      console.error("Firebase anonymous auth failed:", err);
      alert(
        "Firebase 익명 로그인에 실패했습니다.\n" +
          "Firebase Console → Authentication → Sign-in method 에서 Anonymous 를 활성화해 주세요.\n\n" +
          (err && err.message ? err.message : String(err))
      );
      return;
    }

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
        alert(
          "Firebase 데이터 동기화에 실패했습니다.\n" +
            "Realtime Database Rules 에서 auth != null 일 때 shared-calendar 읽기/쓰기를 허용해 주세요.\n\n" +
            (err && err.message ? err.message : String(err))
        );
      }
    );

    // 메타 경로가 없더라도 생성될 수 있도록 no-op write 보장
    metaRef.update({ connectedAt: new Date().toISOString() }).catch((err) => {
      console.error("Firebase meta update failed:", err);
    });
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
        return "#43a047";
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

    const BAR_HEIGHT = 8;
    const BAR_GAP = 4;
    const LINE_STEP = BAR_HEIGHT + BAR_GAP;
    const HEADER_BASE_PX = 24;
    const HEADER_EXTRA_PX = 6;
    const DOT_GAP_PX = 16;
    const SPACER_MARGIN_TOP = 4;
    const SPACER_MARGIN_BOTTOM = 10;
    const DOTS_FLOOR_PX = 30;

    /** @type {Record<number, number>} */
    const rowSlots = {};
    /** @type {Map<number, Map<string, Set<number>>>} */
    const rowDayLaneUsage = new Map();
    /** @type {Map<string, number>} */
    const cellLaneMap = new Map();
    /** @type {Record<number, number>} */
    const rowBaseTop = {};
    /** @type {Record<number, number>} */
    const rowLaneMax = {};

    const allCells = [...calendarGrid.querySelectorAll(".calendar-cell[data-date-str]")];
    const cellByDate = new Map(allCells.map((cell) => [cell.dataset.dateStr || "", cell]));
    if (!finalPass) barDotLayoutFixAttempts = 0;

    const headerClearance = (cell) => {
      const numEl = /** @type {HTMLElement | null} */ (cell.querySelector(".calendar-cell__num"));
      const holidayEl = /** @type {HTMLElement | null} */ (cell.querySelector(".calendar-cell__holiday-name"));
      const badgeEl = /** @type {HTMLElement | null} */ (cell.querySelector(".calendar-cell__ongoing-count"));
      const numBottom = numEl ? numEl.offsetTop + numEl.offsetHeight : 0;
      const holidayBottom = holidayEl ? holidayEl.offsetTop + holidayEl.offsetHeight : 0;
      const badgeBottom = badgeEl && !badgeEl.hidden ? badgeEl.offsetTop + badgeEl.offsetHeight : 0;
      return Math.max(HEADER_BASE_PX, Math.max(numBottom, holidayBottom, badgeBottom) + HEADER_EXTRA_PX);
    };

    allCells.forEach((cell, idx) => {
      const row = Math.floor(idx / 7);
      rowBaseTop[row] = Math.max(rowBaseTop[row] || 0, headerClearance(cell));
    });

    /** @type {{ kind: "multi" | "single", task: any, dateRun?: string[], ds?: string, row: number, lane: number }[]} */
    const paintList = [];

    // --- Phase 1: lane packing only (no DOM bars yet) ---
    tasks.forEach((task) => {
      forEachMultiDaySegment(task, (startStr, endStr) => {
        const segments = getSegmentsInGrid(startStr, endStr, calendarGrid);
        segments.forEach((dateRun) => {
          const firstCell = cellByDate.get(dateRun[0]);
          if (!firstCell) return;
          const row = Math.floor(allCells.indexOf(firstCell) / 7);
          let dayUsage = rowDayLaneUsage.get(row);
          if (!dayUsage) {
            dayUsage = new Map();
            rowDayLaneUsage.set(row, dayUsage);
          }
          let lane = 0;
          while (dateRun.some((ds) => dayUsage.get(ds)?.has(lane))) lane += 1;
          dateRun.forEach((ds) => {
            let used = dayUsage.get(ds);
            if (!used) {
              used = new Set();
              dayUsage.set(ds, used);
            }
            used.add(lane);
            cellLaneMap.set(ds, Math.max(cellLaneMap.get(ds) || 0, lane + 1));
          });
          rowSlots[row] = Math.max(rowSlots[row] || 0, lane + 1);
          paintList.push({ kind: "multi", task, dateRun, row, lane, endStr });
        });
      });
    });

    allCells.forEach((cell, idx) => {
      const ds = cell.dataset.dateStr || "";
      if (!ds) return;
      const row = Math.floor(idx / 7);
      const list = sortTasksForDots(tasks.filter((t) => taskCoversDate(t, ds)));
      const singleDay = list.filter((t) => {
        const occ = getOccurrenceContaining(t, ds);
        return !!occ && occ.start === ds && occ.end === ds;
      });
      singleDay.forEach((t) => {
        const lane = cellLaneMap.get(ds) || 0;
        cellLaneMap.set(ds, lane + 1);
        rowSlots[row] = Math.max(rowSlots[row] || 0, lane + 1);
        paintList.push({ kind: "single", task: t, ds, row, lane });
      });
    });

    allCells.forEach((cell, idx) => {
      const ds = cell.dataset.dateStr || "";
      const row = Math.floor(idx / 7);
      rowLaneMax[row] = Math.max(rowLaneMax[row] || 0, cellLaneMap.get(ds) || 0, rowSlots[row] || 0);
    });

    const estimateDotsHeight = (cell, ds) => {
      const dotsEl = /** @type {HTMLElement | null} */ (cell.querySelector(".calendar-cell__dots"));
      const measured = dotsEl ? dotsEl.offsetHeight : 0;
      if (measured > 0) return Math.max(DOTS_FLOOR_PX, measured);
      const count = tasks.filter((t) => taskCoversDate(t, ds)).length;
      return Math.max(DOTS_FLOOR_PX, Math.ceil(Math.max(count, 1) / 3) * 14);
    };

    const stackHeight = (lanes) => (lanes > 0 ? BAR_HEIGHT + (lanes - 1) * LINE_STEP : 0);

    // --- Phase 2: size spacers + row heights BEFORE drawing (row-max lanes) ---
    const applySpacersAndRowHeights = (extraByRow = {}) => {
      const rowCount = Math.ceil(allCells.length / 7);
      const heights = [];
      for (let row = 0; row < rowCount; row++) {
        const lanes = rowLaneMax[row] || 0;
        const rowBase = rowBaseTop[row] || HEADER_BASE_PX;
        const stack = stackHeight(lanes);
        const barBottomRel = rowBase + stack;
        let rowNeed = 108;
        const inRow = allCells.slice(row * 7, row * 7 + 7);
        inRow.forEach((cell) => {
          const ds = cell.dataset.dateStr || "";
          const spacerEl = /** @type {HTMLElement | null} */ (cell.querySelector(".calendar-cell__range-spacer"));
          const dotsEl = /** @type {HTMLElement | null} */ (cell.querySelector(".calendar-cell__dots"));
          const numEl = /** @type {HTMLElement | null} */ (cell.querySelector(".calendar-cell__num"));
          if (dotsEl) dotsEl.style.marginTop = "0px";
          const numBottom = numEl ? numEl.offsetTop + numEl.offsetHeight : 0;
          const spacerStart = numBottom + SPACER_MARGIN_TOP;
          // Clear the full row stack so multi-day bars never hit dots on any day
          const needSpacer = Math.max(0, Math.ceil(barBottomRel + DOT_GAP_PX - spacerStart - SPACER_MARGIN_BOTTOM));
          const prev = finalPass
            ? Math.max(
                parseFloat(cell.style.getPropertyValue("--range-stack-px")) || 0,
                spacerEl ? parseFloat(spacerEl.style.height) || 0 : 0
              )
            : 0;
          const next = Math.max(prev, needSpacer, stack);
          cell.style.setProperty("--range-lanes", String(lanes));
          cell.style.setProperty("--range-stack-px", `${next}px`);
          if (spacerEl) spacerEl.style.height = `${next}px`;

          const dotsH = estimateDotsHeight(cell, ds);
          const cellNeed = spacerStart + next + SPACER_MARGIN_BOTTOM + dotsH + 8;
          if (cellNeed > rowNeed) rowNeed = cellNeed;
          if (barBottomRel + DOT_GAP_PX + dotsH + 8 > rowNeed) {
            rowNeed = barBottomRel + DOT_GAP_PX + dotsH + 8;
          }
        });
        heights.push(`${Math.ceil(rowNeed + (extraByRow[row] || 0))}px`);
      }
      calendarGrid.style.gridTemplateRows = heights.join(" ");
      void calendarGrid.offsetHeight;
    };

    applySpacersAndRowHeights();

    // --- Phase 3: draw bars into pre-sized space ---
    /** @type {Map<string, number>} */
    const dateBarBottomAbsMap = new Map();

    const attachLineInteractions = (line, task, openDs) => {
      const impKey = task.importance === "high" ? "high" : task.importance === "low" ? "low" : "medium";
      const stKey = task.status === "on-going" ? "ongoing" : task.status === "done" ? "done" : "ready";
      line.dataset.tipToken = "■ ";
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
      const openFromLine = () => openModal(openDs, task.id);
      bindRangeDrag(line, task, openDs);
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
    };

    paintList.forEach((item) => {
      const rowBase = rowBaseTop[item.row] || HEADER_BASE_PX;
      if (item.kind === "multi") {
        const dateRun = item.dateRun || [];
        const firstCell = cellByDate.get(dateRun[0]);
        const lastCell = cellByDate.get(dateRun[dateRun.length - 1]);
        if (!firstCell || !lastCell) return;
        const lineTop = Math.round(firstCell.offsetTop + rowBase + item.lane * LINE_STEP);
        const line = document.createElement("div");
        line.className = "calendar-range-line";
        line.style.background = rangeLineColorForTask(item.task, item.endStr);
        line.style.left = Math.round(firstCell.offsetLeft) + "px";
        line.style.top = lineTop + "px";
        line.style.width = Math.round(lastCell.offsetLeft + lastCell.offsetWidth - firstCell.offsetLeft) + "px";
        attachLineInteractions(line, item.task, dateRun[0]);
        layer.appendChild(line);
        const lineBottomAbs = lineTop + BAR_HEIGHT;
        dateRun.forEach((ds) => {
          dateBarBottomAbsMap.set(ds, Math.max(dateBarBottomAbsMap.get(ds) || 0, lineBottomAbs));
        });
        return;
      }
      const ds = item.ds || "";
      const cell = cellByDate.get(ds);
      if (!cell) return;
      const lineTop = Math.round(cell.offsetTop + rowBase + item.lane * LINE_STEP);
      const line = document.createElement("div");
      line.className = "calendar-range-line";
      line.style.background = statusBarColor(item.task.status);
      line.style.left = Math.round(cell.offsetLeft) + "px";
      line.style.top = lineTop + "px";
      line.style.width = Math.round(cell.offsetWidth) + "px";
      attachLineInteractions(line, item.task, ds);
      layer.appendChild(line);
      dateBarBottomAbsMap.set(ds, Math.max(dateBarBottomAbsMap.get(ds) || 0, lineTop + BAR_HEIGHT));
    });

    if (!finalPass) {
      requestAnimationFrame(() => renderMultiDayRangeLines(true));
      return;
    }

    // --- Phase 4: hard verify — bars must stay above dots ---
    if (barDotLayoutFixAttempts < 24) {
      /** @type {Record<number, number>} */
      const growByRow = {};
      const lines = [...layer.querySelectorAll(".calendar-range-line")];
      const lineRects = lines.map((line) => line.getBoundingClientRect());
      allCells.forEach((cell, idx) => {
        const row = Math.floor(idx / 7);
        const dotsEl = /** @type {HTMLElement | null} */ (cell.querySelector(".calendar-cell__dots"));
        if (!dotsEl) return;
        const cellRect = cell.getBoundingClientRect();
        const dotsRect = dotsEl.getBoundingClientRect();
        let maxBarBottom = -Infinity;
        lineRects.forEach((r) => {
          if (r.bottom <= cellRect.top || r.top >= cellRect.bottom) return;
          if (r.right <= cellRect.left + 0.5 || r.left >= cellRect.right - 0.5) return;
          if (r.bottom > maxBarBottom) maxBarBottom = r.bottom;
        });
        let grow = 0;
        if (dotsRect.bottom > cellRect.bottom + 0.5) {
          grow = Math.max(grow, Math.ceil(dotsRect.bottom - cellRect.bottom + 12));
        }
        if (Number.isFinite(maxBarBottom) && maxBarBottom + DOT_GAP_PX > dotsRect.top) {
          grow = Math.max(grow, Math.ceil(maxBarBottom + DOT_GAP_PX - dotsRect.top));
        }
        const room = Number.isFinite(maxBarBottom) ? cellRect.bottom - maxBarBottom : cellRect.height;
        const dotsH = estimateDotsHeight(cell, cell.dataset.dateStr || "");
        if (room < dotsH + DOT_GAP_PX) {
          grow = Math.max(grow, Math.ceil(dotsH + DOT_GAP_PX - room));
        }
        if (grow > 0) growByRow[row] = Math.max(growByRow[row] || 0, grow);
      });

      if (Object.keys(growByRow).length > 0) {
        // permanently bump rowLaneMax visually via spacer boost on all cells in grown rows
        Object.keys(growByRow).forEach((rowStr) => {
          const row = Number(rowStr);
          const boost = growByRow[row] || 0;
          allCells.slice(row * 7, row * 7 + 7).forEach((cell) => {
            const spacerEl = /** @type {HTMLElement | null} */ (cell.querySelector(".calendar-cell__range-spacer"));
            const cur = Math.max(
              parseFloat(cell.style.getPropertyValue("--range-stack-px")) || 0,
              spacerEl ? parseFloat(spacerEl.style.height) || 0 : 0
            );
            const next = cur + boost;
            cell.style.setProperty("--range-stack-px", `${next}px`);
            if (spacerEl) spacerEl.style.height = `${next}px`;
          });
        });
        applySpacersAndRowHeights(growByRow);
        barDotLayoutFixAttempts += 1;
        requestAnimationFrame(() => renderMultiDayRangeLines(true));
        return;
      }
    }
  }

  function applyCalendarRowHeights(
    rowSlots,
    rowLaneMax = {},
    cellLaneMap = new Map(),
    rowOverflowPx = {},
    rowBaseTop = {},
    lineStep = 12,
    barHeight = 8
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
        const spacerEl = /** @type {HTMLElement | null} */ (cell.querySelector(".calendar-cell__range-spacer"));
        const dotsHeight = dotsEl ? Math.max(0, dotsEl.offsetHeight) : 0;
        if (dotsHeight > maxDotsHeight) maxDotsHeight = dotsHeight;
        const headerGap = 7;
        const spacerH = spacerEl ? Math.max(0, spacerEl.offsetHeight) : laneStackHeight;
        // 날짜별 dot 개수(1줄/2줄/3줄)에 따라 실제 하단 보호 높이를 반영한다.
        const dotSafe = Math.max(24, dotsHeight + 18);
        const cellRequired = contentBottom + headerGap + Math.max(laneStackHeight, spacerH) + dotSafe;
        if (cellRequired > rowRequiredHeight) rowRequiredHeight = cellRequired;
      });
      const lanes = Math.max(rowSlots[row] || 0, rowLaneMax[row] || 0);
      const rowBase = rowBaseTop[row] || 0;
      const laneStackBottom = rowBase + (lanes > 0 ? (lanes - 1) * lineStep + barHeight : 0);
      const dotsBlock = Math.max(20, maxDotsHeight);
      // 동그라미는 "마지막 수평바 하단 + 여유" 아래에서 시작해야 한다.
      const strictRowHeight = laneStackBottom + 14 + dotsBlock + 56;
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
    resetDeliverableInputRow();
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
      const dateEl = row.querySelector(".deliverable-item__completed-at");
      const completedAt =
        dateEl instanceof HTMLInputElement ? normalizeCompletedAtDate(dateEl.value) : null;
      out.push({
        id: row.getAttribute("data-id") || `d-${Date.now()}-${idx}`,
        name,
        importance,
        done: !!completedAt,
        completedAt,
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
      const completedAt = normalizeCompletedAtDate(row.completedAt);
      const isDone = !!completedAt || !!row.done;
      li.className = "deliverable-item" + (isDone ? " deliverable-item--done" : "");
      li.setAttribute("data-id", row.id || uuid());
      if (Number.isFinite(row.createdAt) && Number(row.createdAt) > 0) {
        li.setAttribute("data-created-at", String(Math.floor(Number(row.createdAt))));
      }
      const dateInput = document.createElement("input");
      dateInput.type = "text";
      dateInput.className = "deliverable-item__completed-at";
      dateInput.value = completedAt ? formatDeliverableDateShort(completedAt) : "";
      dateInput.inputMode = "numeric";
      dateInput.autocomplete = "off";
      dateInput.maxLength = 10;
      dateInput.placeholder = "Doing";
      dateInput.title = "산출물 생산완료일자";
      dateInput.setAttribute("aria-label", "산출물 생산완료일자");
      const seedTaskStartDate = () => {
        if (dateInput.value) return;
        const start =
          (taskStart instanceof HTMLInputElement && taskStart.value) ||
          getEditingTask()?.startDate ||
          selectedDateStr ||
          "";
        if (start) dateInput.value = formatDeliverableDateShort(start);
      };
      const normalizeDateInputField = () => {
        const normalized = normalizeCompletedAtDate(dateInput.value);
        dateInput.value = normalized ? formatDeliverableDateShort(normalized) : "";
      };
      const normalizeDateInputDisplay = () => {
        const next = normalizeDeliverableDateDisplay(dateInput.value);
        if (dateInput.value !== next) dateInput.value = next;
      };
      const openDeliverableDatePicker = () => {
        seedTaskStartDate();
        openDatePopForDeliverable(dateInput);
      };
      dateInput.addEventListener("pointerdown", (e) => {
        if (e.pointerType === "mouse") return;
        e.preventDefault();
        datePopFocusSuppressUntil = Date.now() + 400;
        openDeliverableDatePicker();
      });
      dateInput.addEventListener("mousedown", (e) => {
        e.preventDefault();
        datePopFocusSuppressUntil = Date.now() + 400;
        openDeliverableDatePicker();
      });
      dateInput.addEventListener("focus", seedTaskStartDate);
      dateInput.addEventListener("input", normalizeDateInputDisplay);
      dateInput.addEventListener("blur", normalizeDateInputField);
      dateInput.addEventListener("change", normalizeDateInputField);

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

      li.appendChild(dateInput);
      li.appendChild(nameTa);
      li.appendChild(impSelect);
      li.appendChild(delBtn);
      deliverableList.appendChild(li);
      bindDeliverableListRow(li, nameTa, impSelect);
    });
  }

  function updateActualEffortPreview() {
    if (!taskActualEffortValue) return;
    renderEffortUnitToggle();
    const effortRaw = Number(taskEffortValue.value);
    const effortUnit = taskEffortUnit.value === "MD" ? "MD" : "MH";
    if (!Number.isFinite(effortRaw) || effortRaw <= 0) {
      taskActualEffortValue.value = `0${effortUnit}`;
      renderQuickMetaControls();
      void applyDerivedStatusFromModalDeliverables();
      return;
    }
    const expectedMh = effortUnit === "MD" ? effortRaw * 24 : effortRaw;
    const rows = collectDeliverablesFromModal();
    const totalWeight = rows.reduce((acc, row) => acc + importanceWeight(row.importance), 0);
    const doneWeight = rows.filter((row) => isDeliverableComplete(row)).reduce((acc, row) => acc + importanceWeight(row.importance), 0);
    const ratio = totalWeight > 0 ? doneWeight / totalWeight : 0;
    const actualMh = expectedMh * ratio;
    const viewValue = effortUnit === "MD" ? actualMh / 24 : actualMh;
    taskActualEffortValue.value = `${formatMh(viewValue)}${effortUnit}`;
    renderQuickMetaControls();
    void applyDerivedStatusFromModalDeliverables();
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
      done: isDeliverableComplete(r),
      completedAt: normalizeCompletedAtDate(r.completedAt),
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
      cell.innerHTML = calendarCellInnerHtml(String(d));
      if (holidayName) {
        const num = cell.querySelector(".calendar-cell__num");
        if (num) num.insertAdjacentHTML("beforeend", ` <span class="calendar-cell__holiday-name">${escapeHtml(holidayName)}</span>`);
      }
      cell.addEventListener("click", () => openModal(cell.dataset.dateStr));
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
      cell.innerHTML = calendarCellInnerHtml(String(d));
      if (holidayName) {
        const num = cell.querySelector(".calendar-cell__num");
        if (num) num.insertAdjacentHTML("beforeend", ` <span class="calendar-cell__holiday-name">${escapeHtml(holidayName)}</span>`);
      }
      cell.addEventListener("click", () => openModal(ds));
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
      cell.innerHTML = calendarCellInnerHtml(String(i));
      if (holidayName) {
        const num = cell.querySelector(".calendar-cell__num");
        if (num) num.insertAdjacentHTML("beforeend", ` <span class="calendar-cell__holiday-name">${escapeHtml(holidayName)}</span>`);
      }
      cell.addEventListener("click", () => openModal(cell.dataset.dateStr));
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


  function calendarCellInnerHtml(dayLabel) {
    return (
      '<span class="calendar-cell__ongoing-count" hidden></span>' +
      '<span class="calendar-cell__num">' +
      dayLabel +
      "</span>" +
      '<span class="calendar-cell__range-spacer" aria-hidden="true"></span>' +
      '<div class="calendar-cell__dots" aria-hidden="true"></div>'
    );
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

    cell.classList.remove(
      "calendar-cell--heat-low",
      "calendar-cell--heat-mid",
      "calendar-cell--heat-high",
      "calendar-cell--heat-critical"
    );
    cell.classList.remove("calendar-cell--tip-active");
    if (ongoingCount > 0) {
      const score = ongoingImportanceScore(ongoingTasks);
      if (score >= 10) cell.classList.add("calendar-cell--heat-critical");
      else if (score >= 8) cell.classList.add("calendar-cell--heat-high");
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
        const overdue = isTaskOverdueOnDate(t, dateStr);
        inner.className = [
          "calendar-cell__dot-mark",
          importanceShapeClass(t.importance || "medium"),
          overdue ? "calendar-cell__dot--overdue" : statusDotClass(t.status),
        ].join(" ");
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
      resetDeliverableInputRow();
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
        resetDeliverableInputRow();
        taskStart.value = dateStr;
        taskEnd.value = dateStr;
        taskRecurrence.value = "none";
        updateActualEffortPreview();
      } else {
      // 해당 날짜 일정이 있으면 계획MH가 가장 큰 항목을 기본 편집 대상으로 연다.
      const topPlannedTask = pickTopPlannedTaskForDate(dateStr);
      if (topPlannedTask) {
        editingId = topPlannedTask.id;
        modalDefaultWhite = false;
        fillFormFromTask(topPlannedTask);
        draftStatus = topPlannedTask.status || "ready";
        draftImportance = topPlannedTask.importance || "medium";
      } else {
        draftStatus = "ready";
        draftImportance = "medium";
        taskTitle.value = "";
        taskDescription.value = "";
        taskEffortValue.value = "";
        taskEffortUnit.value = "MH";
        renderDeliverableList([]);
        resetDeliverableInputRow();
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
    syncOverlayScrollLock();
    modalSessionSnapshot = buildModalSnapshot();
    if (!isCoarsePointerDevice()) taskTitle.focus();
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
        resetDeliverableInputRow();
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
          const blockMsg = getTaskStatusBlockMessage(tasks[i], selectedDateStr, st);
          if (blockMsg) {
            showStatusBlockHint(q, blockMsg);
            return;
          }
          hideStatusBlockHint();
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
      syncOverlayScrollLock();

      const cleanup = () => {
        confirmBackdrop.hidden = true;
        confirmPop.hidden = true;
        confirmCancel.removeEventListener("click", onCancel);
        confirmOk.removeEventListener("click", onOk);
        confirmBackdrop.removeEventListener("click", onCancel);
        syncOverlayScrollLock();
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
    try {
      const saved = localStorage.getItem(GEMINI_API_KEY_STORAGE);
      if (typeof saved === "string" && saved.trim()) {
        geminiKeyCache = saved.trim();
      }
    } catch (_) {
      /* private mode 등 */
    }
    if (geminiApiKeyInput instanceof HTMLInputElement) {
      geminiApiKeyInput.value = geminiKeyCache;
    }
    return geminiKeyCache;
  }

  function saveGeminiKeyToStorage(k) {
    geminiKeyCache = (k || "").trim();
    try {
      if (geminiKeyCache) localStorage.setItem(GEMINI_API_KEY_STORAGE, geminiKeyCache);
      else localStorage.removeItem(GEMINI_API_KEY_STORAGE);
    } catch (_) {
      /* private mode 등 */
    }
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

  function coerceOcrDeliverables(raw, fallbackImportance) {
    /** @type {Array<{name: string, importance: 'high'|'medium'|'low'}>} */
    const out = [];
    const pushName = (nameRaw, importanceRaw) => {
      const name = nameRaw != null ? String(nameRaw).trim() : "";
      if (!name) return;
      const importance =
        importanceRaw === "high" || importanceRaw === "low" || importanceRaw === "medium"
          ? importanceRaw
          : fallbackImportance === "high" || fallbackImportance === "low"
            ? fallbackImportance
            : "medium";
      if (out.some((row) => row.name === name)) return;
      out.push({ name, importance });
    };

    const ingestList = (list) => {
      if (!Array.isArray(list)) return;
      list.forEach((item) => {
        if (typeof item === "string") {
          pushName(item);
          return;
        }
        if (item && typeof item === "object") {
          pushName(item.name != null ? item.name : item.title, item.importance);
        }
      });
    };

    if (!raw || typeof raw !== "object") return out;
    ingestList(raw.deliverables);
    ingestList(raw.expectedDeliverables);
    ingestList(raw.outputs);
    if (typeof raw.deliverable === "string") pushName(raw.deliverable);
    if (typeof raw.deliverableName === "string") pushName(raw.deliverableName);
    if (typeof raw["산출물"] === "string") pushName(raw["산출물"]);
    if (typeof raw["예상산출물"] === "string") pushName(raw["예상산출물"]);
    return out;
  }

  /**
   * description에 남은 "산출물: …" 줄을 예상산출물로 옮긴다.
   * @param {string} description
   * @returns {{ description: string, names: string[] }}
   */
  function extractDeliverablesFromDescription(description) {
    const text = description != null ? String(description) : "";
    if (!text.trim()) return { description: "", names: /** @type {string[]} */ ([]) };
    const names = /** @type {string[]} */ ([]);
    const kept = [];
    text.split(/\r?\n/).forEach((line) => {
      const trimmed = line.trim();
      const labeled = trimmed.match(/^(?:예상\s*)?산출물(?:명)?\s*[:：]\s*(.+)$/i);
      if (labeled) {
        labeled[1]
          .split(/[,，、/;|]/)
          .map((part) => part.trim())
          .filter(Boolean)
          .forEach((name) => {
            if (!names.includes(name)) names.push(name);
          });
        return;
      }
      kept.push(line);
    });
    // 한 줄 전체가 "산출물 xxx" 형태(콜론 없음)인 경우도 보조 처리
    if (!names.length && /^(?:예상\s*)?산출물(?:명)?\s+/i.test(text.trim())) {
      const rest = text.trim().replace(/^(?:예상\s*)?산출물(?:명)?\s*[:：]?\s*/i, "").trim();
      if (rest) {
        rest
          .split(/[,，、/;|]/)
          .map((part) => part.trim())
          .filter(Boolean)
          .forEach((name) => {
            if (!names.includes(name)) names.push(name);
          });
        return { description: "", names };
      }
    }
    return { description: kept.join("\n").trim(), names };
  }

  function coerceOcrItem(o, todayStr) {
    const title = o.title != null ? String(o.title).trim() : "";
    const fallbackYear = viewYear || new Date().getFullYear();
    let startDate = normalizeOcrDate(o.startDate, fallbackYear);
    let endDate = normalizeOcrDate(o.endDate, fallbackYear);
    if (startDate && endDate && parseDateStr(startDate) > parseDateStr(endDate)) endDate = startDate;
    const status = ["ready", "on-going", "done"].includes(o.status) ? o.status : OCR_TASK_DEFAULTS.status;
    const importance = ["high", "medium", "low"].includes(o.importance) ? o.importance : OCR_TASK_DEFAULTS.importance;
    const rawEffort = Number(o.effortValue);
    const effortValue =
      Number.isFinite(rawEffort) && rawEffort > 0 ? Math.round(rawEffort * 100) / 100 : OCR_TASK_DEFAULTS.effortValue;
    const effortUnit = o.effortUnit === "MD" ? "MD" : OCR_TASK_DEFAULTS.effortUnit;
    let description = o.description != null ? String(o.description) : "";
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

    const deliverableSeeds = coerceOcrDeliverables(o, importance);
    const extracted = extractDeliverablesFromDescription(description);
    description = extracted.description;
    extracted.names.forEach((name) => {
      if (!deliverableSeeds.some((row) => row.name === name)) {
        deliverableSeeds.push({ name, importance: importance === "high" || importance === "low" ? importance : "medium" });
      }
    });
    const deliverables = normalizeDeliverables(
      deliverableSeeds.map((row, idx) => ({
        id: `ocr-d-${Date.now()}-${idx}`,
        name: row.name,
        importance: row.importance,
        done: false,
        completedAt: null,
        createdAt: Date.now() + idx,
      }))
    );

    return {
      title,
      description,
      status,
      importance,
      effortValue,
      effortUnit,
      startDate,
      endDate,
      deliverables,
      recurrence: /** @type {'none'} */ (OCR_TASK_DEFAULTS.recurrence),
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

스키마: 각 원소는 {"title": string, "startDate": "YYYY-MM-DD", "endDate": "YYYY-MM-DD", "status": "ready"|"on-going"|"done", "importance": "high"|"medium"|"low", "effortValue": number, "effortUnit": "MH"|"MD", "description": string, "deliverables": [{"name": string, "importance": "high"|"medium"|"low"}], "confidence": number}
규칙:
- 날짜가 적혀 있으면 그 날짜를 사용합니다. 같은 날짜 아래에 여러 줄이 있으면 각각 별도 항목으로 두고 같은 startDate와 endDate를 씁니다.
- 연도가 없는 날짜(예: 5/4, 5월 4일)는 현재 달력 화면의 연도(${viewYear})를 붙여 YYYY-MM-DD로 만듭니다.
- 날짜가 전혀 없으면 startDate/endDate는 빈 문자열로 둡니다.
- 한 줄에 날짜와 제목이 같이 있으면 그 날짜에 그 제목을 넣습니다.
- status는 판별 가능할 때 채우고, 애매하면 "ready"로 둡니다.
- importance는 판별 가능할 때만 채우고, 애매하면 "medium"으로 둡니다.
- effortValue/effortUnit은 적혀 있을 때 채우고, 없으면 effortValue는 4, effortUnit은 "MH"로 둡니다.
- "산출물", "예상산출물", "산출물명" 라벨 뒤의 값(예: "산출물: 테스트결과지")은 반드시 deliverables 배열에 넣고 description에는 넣지 마세요.
- 산출물이 여러 개면 deliverables에 원소를 여러 개로 나눕니다. importance가 따로 없으면 할일 importance를 따릅니다.
- description은 산출물이 아닌 부가 메모가 있을 때만 채우고 없으면 빈 문자열.
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
          <textarea class="ocr-draft-deliverables" rows="2" data-index="${index}" placeholder="예상산출물 (줄마다 하나)"></textarea>
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
      const delEl = li.querySelector(".ocr-draft-deliverables");
      const dEl = li.querySelector(".ocr-draft-desc");
      if (titleEl) titleEl.value = row.title || "";
      if (sEl) sEl.value = row.startDate || "";
      if (eEl) eEl.value = row.endDate || "";
      if (stEl) stEl.value = row.status || OCR_TASK_DEFAULTS.status;
      if (imEl) imEl.value = row.importance || OCR_TASK_DEFAULTS.importance;
      if (efEl) {
        efEl.value =
          row.effortValue != null && Number(row.effortValue) > 0 ? String(row.effortValue) : String(OCR_TASK_DEFAULTS.effortValue);
      }
      if (euEl) euEl.value = row.effortUnit === "MD" ? "MD" : OCR_TASK_DEFAULTS.effortUnit;
      if (delEl) {
        const names = Array.isArray(row.deliverables)
          ? row.deliverables.map((d) => (d && d.name != null ? String(d.name).trim() : "")).filter(Boolean)
          : [];
        delEl.value = names.join("\n");
      }
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
      const del = /** @type {HTMLTextAreaElement | null} */ (ocrDraftList.querySelector(`.ocr-draft-deliverables[data-index="${index}"]`));
      const d = /** @type {HTMLTextAreaElement | null} */ (ocrDraftList.querySelector(`.ocr-draft-desc[data-index="${index}"]`));
      const cb = /** @type {HTMLInputElement | null} */ (ocrDraftList.querySelector(`.ocr-draft-cb[data-index="${index}"]`));
      if (!cb || !cb.checked) return;
      const effortRaw = ef && ef.value.trim() !== "" ? Number(ef.value) : NaN;
      const effortValue =
        Number.isFinite(effortRaw) && effortRaw > 0 ? Math.round(effortRaw * 100) / 100 : OCR_TASK_DEFAULTS.effortValue;
      const effortUnit = eu && eu.value === "MD" ? "MD" : OCR_TASK_DEFAULTS.effortUnit;
      const startDraft = s && s.value ? s.value : "";
      const endDraft = e && e.value ? e.value : "";
      const finalStart = startDraft || endDraft || toDateStrFromDate(new Date());
      const finalEnd = endDraft || startDraft || finalStart;
      const importance =
        im && ["high", "medium", "low"].includes(im.value) ? /** @type {'high'|'medium'|'low'} */ (im.value) : "medium";
      let description = d ? d.value.trim() : "";
      const deliverableNames = [];
      if (del && del.value.trim()) {
        del.value
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean)
          .forEach((name) => {
            if (!deliverableNames.includes(name)) deliverableNames.push(name);
          });
      }
      const extracted = extractDeliverablesFromDescription(description);
      description = extracted.description;
      extracted.names.forEach((name) => {
        if (!deliverableNames.includes(name)) deliverableNames.push(name);
      });
      const deliverables = normalizeDeliverables(
        deliverableNames.map((name, idx) => ({
          id: `ocr-apply-d-${Date.now()}-${index}-${idx}`,
          name,
          importance,
          done: false,
          completedAt: null,
          createdAt: Date.now() + idx,
        }))
      );
      const payload = {
        title: (title && title.value.trim()) || "(제목 없음)",
        startDate: finalStart,
        endDate: finalEnd,
        status: st && ["ready", "on-going", "done"].includes(st.value) ? st.value : "ready",
        importance,
        description,
        deliverables,
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
    syncOverlayScrollLock();
  }

  function closeOcrModal() {
    ocrBackdrop.hidden = true;
    ocrModal.hidden = true;
    syncOverlayScrollLock();
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
    hideStatusBlockHint();
    closeDatePop();
    modalBackdrop.hidden = true;
    taskModal.hidden = true;
    editingId = null;
    btnDelete.hidden = true;
    modalSessionSnapshot = null;
    syncOverlayScrollLock();
  }

  async function saveFromModal() {
    // 입력칸에 남아 있는 산출물도 저장 대상에 포함한다.
    commitDeliverableFromInputRow();
    const title = taskTitle.value.trim();
    const currentStatus = getCurrentStatus();
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
    const status = deriveStatusFromDeliverables(currentStatus, deliverables);

    if (editingId) {
      const taskIndex = tasks.findIndex((x) => x.id === editingId);
      if (taskIndex >= 0 && tasks[taskIndex].status !== status) {
        tasks[taskIndex] = { ...tasks[taskIndex], status };
      }
    } else {
      draftStatus = status;
    }

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

  /* ── 시작일/종료일: 마우스를 올리면 뜨는 달력(드래그로 기간 지정) ───────────── */

  const DATE_POP_CLOSE_DELAY_MS = 180;
  /** @type {HTMLElement | null} */
  let datePopEl = null;
  /** @type {HTMLElement | null} */
  let datePopGrid = null;
  /** @type {HTMLElement | null} */
  let datePopTitle = null;
  /** @type {HTMLButtonElement | null} */
  let datePopClearBtn = null;
  /** @type {'start' | 'end' | 'deliverable' | null} */
  let datePopField = null;
  let datePopYear = 0;
  let datePopMonth = 0;
  /** @type {number | null} */
  let datePopCloseTimer = null;
  /** @type {{ anchor: string, hover: string } | null} */
  let datePopDrag = null;
  /** 마우스 클릭 직후의 focus 로는 달력을 다시 열지 않는다(기본 달력과 충돌 방지). */
  let datePopFocusSuppressUntil = 0;
  /** @type {number | null} */
  let datePopTouchPointerId = null;
  /** @type {HTMLInputElement | null} */
  let datePopDeliverableInput = null;

  function beginDatePopDrag(anchorDateStr) {
    datePopDrag = { anchor: anchorDateStr, hover: anchorDateStr };
    requestAnimationFrame(() => {
      if (datePopDrag) renderDatePop();
    });
  }

  function updateDatePopDragHover(nextDateStr) {
    if (!datePopDrag || !nextDateStr) return;
    if (datePopDrag.hover === nextDateStr) return;
    datePopDrag.hover = nextDateStr;
    const hoverDate = parseDateStr(nextDateStr);
    if (
      !Number.isNaN(hoverDate.getTime()) &&
      (hoverDate.getFullYear() !== datePopYear || hoverDate.getMonth() !== datePopMonth)
    ) {
      datePopYear = hoverDate.getFullYear();
      datePopMonth = hoverDate.getMonth();
    }
    renderDatePop();
  }

  function updateDatePopDragHoverFromPoint(clientX, clientY) {
    const target = document.elementFromPoint(clientX, clientY);
    const day = target instanceof HTMLElement ? target.closest(".date-pop__day") : null;
    if (!(day instanceof HTMLElement) || !day.dataset.date) return;
    updateDatePopDragHover(day.dataset.date);
  }

  function finishDatePopDrag() {
    if (!datePopDrag) return;
    const { anchor, hover } = datePopDrag;
    const from = anchor <= hover ? anchor : hover;
    const to = anchor <= hover ? hover : anchor;
    datePopDrag = null;
    const fromDeliverableField = datePopField === "deliverable";
    applyDatePopSelection(from, to);
    if (fromDeliverableField) return;
    // 이어서 수정 드래그할 수 있도록 팝업 유지
    renderDatePop();
  }

  function isDatePopOpen() {
    return !!datePopEl && !datePopEl.hidden;
  }

  function closeDatePop() {
    if (datePopCloseTimer != null) {
      clearTimeout(datePopCloseTimer);
      datePopCloseTimer = null;
    }
    datePopDrag = null;
    datePopTouchPointerId = null;
    datePopField = null;
    datePopDeliverableInput = null;
    if (datePopClearBtn) datePopClearBtn.hidden = true;
    if (datePopEl) datePopEl.hidden = true;
  }

  function scheduleCloseDatePop() {
    if (datePopCloseTimer != null) clearTimeout(datePopCloseTimer);
    datePopCloseTimer = window.setTimeout(() => {
      datePopCloseTimer = null;
      if (!datePopDrag) closeDatePop();
    }, DATE_POP_CLOSE_DELAY_MS);
  }

  function cancelCloseDatePop() {
    if (datePopCloseTimer != null) {
      clearTimeout(datePopCloseTimer);
      datePopCloseTimer = null;
    }
  }

  function ensureDatePop() {
    if (datePopEl) return datePopEl;
    const pop = document.createElement("div");
    pop.className = "date-pop";
    pop.id = "datePop";
    pop.hidden = true;
    pop.setAttribute("role", "dialog");
    pop.setAttribute("aria-label", "날짜 선택");
    pop.innerHTML = `
      <div class="date-pop__head">
        <button type="button" class="date-pop__nav" data-nav="-1" aria-label="이전 달">‹</button>
        <span class="date-pop__title"></span>
        <button type="button" class="date-pop__nav" data-nav="1" aria-label="다음 달">›</button>
      </div>
      <div class="date-pop__weekdays">
        <span class="date-pop__weekday date-pop__weekday--sun">일</span>
        <span class="date-pop__weekday">월</span>
        <span class="date-pop__weekday">화</span>
        <span class="date-pop__weekday">수</span>
        <span class="date-pop__weekday">목</span>
        <span class="date-pop__weekday">금</span>
        <span class="date-pop__weekday date-pop__weekday--sat">토</span>
      </div>
      <div class="date-pop__grid"></div>
      <div class="date-pop__actions">
        <button type="button" class="date-pop__clear" data-action="clear-deliverable" hidden>완료 취소 → Doing</button>
      </div>
      <p class="date-pop__hint">클릭: 날짜 지정 · 드래그: 시작일~종료일 지정</p>
    `;
    document.body.appendChild(pop);
    datePopEl = pop;
    datePopGrid = pop.querySelector(".date-pop__grid");
    datePopTitle = pop.querySelector(".date-pop__title");
    datePopClearBtn = pop.querySelector(".date-pop__clear");

    pop.addEventListener("mouseenter", cancelCloseDatePop);
    pop.addEventListener("mouseleave", scheduleCloseDatePop);

    pop.addEventListener("click", (e) => {
      const actionBtn = e.target instanceof HTMLElement ? e.target.closest("[data-action='clear-deliverable']") : null;
      if (actionBtn instanceof HTMLButtonElement) {
        if (datePopField === "deliverable" && datePopDeliverableInput instanceof HTMLInputElement) {
          datePopDeliverableInput.value = "";
          datePopDeliverableInput.dispatchEvent(new Event("change", { bubbles: true }));
        }
        closeDatePop();
        return;
      }
      const nav = e.target instanceof HTMLElement ? e.target.closest(".date-pop__nav") : null;
      if (!(nav instanceof HTMLElement)) return;
      const step = Number(nav.dataset.nav) || 0;
      const base = new Date(datePopYear, datePopMonth + step, 1);
      datePopYear = base.getFullYear();
      datePopMonth = base.getMonth();
      renderDatePop();
    });

    if (datePopGrid) {
      datePopGrid.addEventListener("mousedown", (e) => {
        const day = e.target instanceof HTMLElement ? e.target.closest(".date-pop__day") : null;
        if (!(day instanceof HTMLElement) || !day.dataset.date) return;
        e.preventDefault();
        beginDatePopDrag(day.dataset.date);
      });
      datePopGrid.addEventListener("mouseover", (e) => {
        if (!datePopDrag) return;
        const day = e.target instanceof HTMLElement ? e.target.closest(".date-pop__day") : null;
        if (!(day instanceof HTMLElement) || !day.dataset.date) return;
        updateDatePopDragHover(day.dataset.date);
      });
      datePopGrid.addEventListener("pointerdown", (e) => {
        if (e.pointerType === "mouse") return;
        const day = e.target instanceof HTMLElement ? e.target.closest(".date-pop__day") : null;
        if (!(day instanceof HTMLElement) || !day.dataset.date) return;
        e.preventDefault();
        datePopTouchPointerId = e.pointerId;
        beginDatePopDrag(day.dataset.date);
      });
    }
    return pop;
  }

  function positionDatePop(anchorEl) {
    if (!datePopEl || !(anchorEl instanceof HTMLElement)) return;
    const rect = anchorEl.getBoundingClientRect();
    const popRect = datePopEl.getBoundingClientRect();
    const margin = 8;
    let left = rect.left;
    if (left + popRect.width > window.innerWidth - margin) {
      left = Math.max(margin, window.innerWidth - margin - popRect.width);
    }
    const modalContainer = anchorEl.closest(".modal__inner");
    let minTop = margin;
    let maxTop = window.innerHeight - margin - popRect.height;
    if (modalContainer instanceof HTMLElement) {
      const containerRect = modalContainer.getBoundingClientRect();
      minTop = Math.max(minTop, containerRect.top + 4);
      maxTop = Math.min(maxTop, containerRect.bottom - 4 - popRect.height);
    }
    if (maxTop < minTop) maxTop = minTop;
    let top = rect.bottom + 6;
    if (top > maxTop) {
      const above = rect.top - 6 - popRect.height;
      top = above >= minTop ? above : maxTop;
    }
    if (top < minTop) top = minTop;
    datePopEl.style.left = `${Math.round(left)}px`;
    datePopEl.style.top = `${Math.round(top)}px`;
  }

  function getDatePopAnchorInput() {
    if (datePopField === "deliverable" && datePopDeliverableInput instanceof HTMLInputElement) return datePopDeliverableInput;
    if (datePopField === "start" && taskStart instanceof HTMLInputElement) return taskStart;
    if (datePopField === "end" && taskEnd instanceof HTMLInputElement) return taskEnd;
    return null;
  }

  function renderDatePop() {
    if (!datePopEl || !datePopGrid) return;
    if (datePopTitle) datePopTitle.textContent = `${datePopYear}년 ${datePopMonth + 1}월`;
    if (datePopClearBtn) {
      const isDeliverableMode = datePopField === "deliverable";
      const hasCompletedDate =
        isDeliverableMode &&
        datePopDeliverableInput instanceof HTMLInputElement &&
        !!normalizeCompletedAtDate(datePopDeliverableInput.value);
      datePopClearBtn.hidden = !isDeliverableMode;
      datePopClearBtn.disabled = !hasCompletedDate;
      datePopClearBtn.textContent = hasCompletedDate ? "완료 취소 → Doing" : "Doing (진행중)";
    }

    const startStr =
      datePopField === "deliverable" && datePopDeliverableInput
        ? normalizeCompletedAtDate(datePopDeliverableInput.value) || ""
        : taskStart.value || "";
    const endStr =
      datePopField === "deliverable" && datePopDeliverableInput
        ? normalizeCompletedAtDate(datePopDeliverableInput.value) || ""
        : taskEnd.value || "";
    let rangeFrom = startStr;
    let rangeTo = endStr;
    if (datePopDrag) {
      const a = datePopDrag.anchor;
      const b = datePopDrag.hover;
      rangeFrom = a <= b ? a : b;
      rangeTo = a <= b ? b : a;
    }

    const todayStr = toDateStrFromDate(new Date());
    const first = new Date(datePopYear, datePopMonth, 1);
    const leading = first.getDay();
    const daysInMonth = new Date(datePopYear, datePopMonth + 1, 0).getDate();
    /** @type {{ date: Date, muted: boolean }[]} */
    const cells = [];

    // 이전달 날짜를 채워 월말→월초 드래그가 끊기지 않게 한다
    for (let i = 0; i < leading; i++) {
      cells.push({ date: new Date(datePopYear, datePopMonth, -leading + i + 1), muted: true });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({ date: new Date(datePopYear, datePopMonth, d), muted: false });
    }
    while (cells.length % 7 !== 0) {
      const nextDay = cells.length - (leading + daysInMonth) + 1;
      cells.push({ date: new Date(datePopYear, datePopMonth + 1, nextDay), muted: true });
    }

    datePopGrid.innerHTML = "";
    cells.forEach(({ date, muted }) => {
      const dateStr = toDateStrFromDate(date);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "date-pop__day" + (muted ? " date-pop__day--muted" : "");
      btn.dataset.date = dateStr;
      btn.textContent = String(date.getDate());
      const dow = date.getDay();
      if (dow === 0) btn.classList.add("date-pop__day--sun");
      if (dow === 6) btn.classList.add("date-pop__day--sat");
      if (dateStr === todayStr) btn.classList.add("date-pop__day--today");
      if (rangeFrom && rangeTo && dateStr > rangeFrom && dateStr < rangeTo) {
        btn.classList.add("date-pop__day--in-range");
      }
      if (dateStr === rangeFrom) btn.classList.add("date-pop__day--range-start");
      if (dateStr === rangeTo) btn.classList.add("date-pop__day--range-end");
      datePopGrid.appendChild(btn);
    });
  }

  /** 달력에서 고른 값을 입력칸에 반영한다. */
  function applyDatePopSelection(from, to) {
    if (datePopField === "deliverable") {
      const picked = to || from;
      if (datePopDeliverableInput instanceof HTMLInputElement) {
        datePopDeliverableInput.value = formatDeliverableDateShort(picked);
        datePopDeliverableInput.dispatchEvent(new Event("change", { bubbles: true }));
      }
      closeDatePop();
      return;
    }

    const single = !to || from === to;
    if (single) {
      if (datePopField === "end") taskEnd.value = from;
      else taskStart.value = from;
    } else {
      taskStart.value = from;
      taskEnd.value = to;
    }
    if (taskStart.value && taskEnd.value && parseDateStr(taskStart.value) > parseDateStr(taskEnd.value)) {
      if (datePopField === "end") taskStart.value = taskEnd.value;
      else taskEnd.value = taskStart.value;
    }
    taskStart.dispatchEvent(new Event("change", { bubbles: true }));
    taskEnd.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function openDatePopForDeliverable(inputEl) {
    if (!(inputEl instanceof HTMLInputElement)) return;
    if (taskModal.hidden) return;
    ensureDatePop();
    if (!datePopEl) return;
    cancelCloseDatePop();
    datePopField = "deliverable";
    datePopDeliverableInput = inputEl;
    const normalized = normalizeCompletedAtDate(inputEl.value);
    const fallback = taskStart.value || toDateStrFromDate(new Date());
    const base = parseDateStr(normalized || fallback);
    const anchorDate = Number.isNaN(base.getTime()) ? new Date() : base;
    datePopYear = anchorDate.getFullYear();
    datePopMonth = anchorDate.getMonth();
    datePopDrag = null;
    datePopEl.hidden = false;
    renderDatePop();
    positionDatePop(inputEl);
  }

  /** @param {'start'|'end'} field */
  function openDatePop(field) {
    const input = field === "end" ? taskEnd : taskStart;
    if (!(input instanceof HTMLInputElement)) return;
    if (taskModal.hidden) return;
    ensureDatePop();
    if (!datePopEl) return;
    cancelCloseDatePop();
    datePopField = field;
    datePopDeliverableInput = null;
    const base = parseDateStr(input.value || taskStart.value || toDateStrFromDate(new Date()));
    const anchorDate = Number.isNaN(base.getTime()) ? new Date() : base;
    datePopYear = anchorDate.getFullYear();
    datePopMonth = anchorDate.getMonth();
    datePopDrag = null;
    datePopEl.hidden = false;
    renderDatePop();
    positionDatePop(input);
  }

  [
    /** @type {const} */ ({ field: "start", input: taskStart }),
    /** @type {const} */ ({ field: "end", input: taskEnd }),
  ].forEach(({ field, input }) => {
    if (!(input instanceof HTMLInputElement)) return;
    input.addEventListener("mouseenter", () => openDatePop(field));
    input.addEventListener("mouseleave", scheduleCloseDatePop);
    input.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse") return;
      e.preventDefault();
      datePopFocusSuppressUntil = Date.now() + 400;
      openDatePop(field);
    });
    // 커스텀 달력을 유지: 입력칸 클릭 시 네이티브 picker만 막고 팝업은 다시 연다
    input.addEventListener("mousedown", (e) => {
      e.preventDefault();
      datePopFocusSuppressUntil = Date.now() + 400;
      openDatePop(field);
    });
    input.addEventListener("focus", () => {
      if (Date.now() < datePopFocusSuppressUntil) return;
      openDatePop(field);
    });
  });

  document.addEventListener("mouseup", () => {
    finishDatePopDrag();
  });

  document.addEventListener("pointermove", (e) => {
    if (datePopTouchPointerId == null) return;
    if (e.pointerId !== datePopTouchPointerId) return;
    updateDatePopDragHoverFromPoint(e.clientX, e.clientY);
  });

  document.addEventListener("pointerup", (e) => {
    if (datePopTouchPointerId == null) return;
    if (e.pointerId !== datePopTouchPointerId) return;
    datePopTouchPointerId = null;
    finishDatePopDrag();
  });

  document.addEventListener("pointercancel", (e) => {
    if (datePopTouchPointerId == null) return;
    if (e.pointerId !== datePopTouchPointerId) return;
    datePopTouchPointerId = null;
    finishDatePopDrag();
  });

  document.addEventListener("mousedown", (e) => {
    if (!isDatePopOpen()) return;
    if (datePopDrag) return;
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;
    if (datePopEl && datePopEl.contains(target)) return;
    if (target.closest(".deliverable-item__completed-at")) return;
    if (target === taskStart || target === taskEnd) return;
    closeDatePop();
  });

  document.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse") return;
    if (!isDatePopOpen()) return;
    if (datePopDrag) return;
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;
    if (datePopEl && datePopEl.contains(target)) return;
    if (target.closest(".deliverable-item__completed-at")) return;
    if (target === taskStart || target === taskEnd) return;
    closeDatePop();
  });

  window.addEventListener("scroll", () => {
    if (isDatePopOpen()) closeDatePop();
  }, true);

  if (modalInner instanceof HTMLElement) {
    modalInner.addEventListener(
      "scroll",
      () => {
        if (!isDatePopOpen()) return;
        const anchor = getDatePopAnchorInput();
        if (anchor) positionDatePop(anchor);
      },
      { passive: true }
    );
  }

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
    taskEffortUnit.addEventListener("change", () => {
      renderEffortUnitToggle();
      updateActualEffortPreview();
    });
  }
  if (taskEffortUnitToggle && taskEffortUnit) {
    taskEffortUnitToggle.addEventListener("click", (e) => {
      const btn = e.target instanceof HTMLElement ? e.target.closest("button[data-unit]") : null;
      if (!(btn instanceof HTMLButtonElement)) return;
      const unit = btn.getAttribute("data-unit") === "MD" ? "MD" : "MH";
      setEffortUnit(unit);
    });
    taskEffortUnitToggle.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      e.preventDefault();
      const nextUnit = taskEffortUnit.value === "MD" ? "MH" : "MD";
      setEffortUnit(nextUnit);
    });
  }
  if (btnDeliverableAddToggle) {
    btnDeliverableAddToggle.addEventListener("click", () => {
      if (isDeliverableInputRowOpen()) {
        // C2: 「−」 누르면 입력창을 닫고 적어 둔 내용도 초기화한다 (등록하지 않음).
        resetDeliverableInputRow();
        return;
      }
      setDeliverableInputRowOpen(true, { focus: true });
    });
  }
  if (deliverableImportanceInput) {
    deliverableImportanceInput.addEventListener("change", () => {
      deliverableHeadImpPicked = true;
      refreshDeliverableHeaderUI();
    });
  }
  if (deliverableNameInput instanceof HTMLTextAreaElement) {
    bindDeliverableNameTextareaBehavior(deliverableNameInput);
    queueMicrotask(() => refreshDeliverableHeaderUI());
  }
  // 모달 안 다른 곳을 누르면: 입력 중이던 산출물을 목록으로 이동 애니메이션 후 입력창을 닫는다.
  taskModal.addEventListener("mousedown", (e) => {
    if (!isDeliverableInputRowOpen()) return;
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;
    if (deliverableEditor instanceof HTMLElement && deliverableEditor.contains(target)) return;
    if (btnDeliverableAddToggle instanceof HTMLElement && btnDeliverableAddToggle.contains(target)) return;
    commitDeliverableFromInputRow({ closeAfter: true });
  });
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
      const dateEl = item.querySelector(".deliverable-item__completed-at");
      const done = dateEl instanceof HTMLInputElement && !!normalizeCompletedAtDate(dateEl.value);
      item.classList.toggle("deliverable-item--done", done);
      renderQuickMetaControls();
      updateActualEffortPreview();
      renderCalendar();
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
      const st = btn.dataset.status || "ready";
      const blockMsg = getModalStatusBlockMessage(st);
      if (blockMsg) {
        showStatusBlockHint(btn, blockMsg);
        return;
      }
      hideStatusBlockHint();
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
          alert("일정복원 파일 형식이 올바르지 않습니다. (tasks 배열 필요)");
          return;
        }
        const ok = await openConfirmDialog("현재 일정을 백업 파일 내용으로 덮어쓸까요?", {
          title: "일정복원 확인",
          okLabel: "일정복원",
          cancelLabel: "취소",
          showCancel: true,
        });
        if (!ok) return;
        tasks = incoming.map(normalizeTask);
        await saveTasks();
        renderCalendar();
        updateSearchResults();
        alert(`일정복원 완료: ${tasks.length}건`);
      } catch (e) {
        alert("일정복원 실패: JSON 파일을 확인해 주세요.");
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

  // 모달 닫기 요청: 변경이 있으면 저장하고, 없으면 그냥 닫는다.
  function requestCloseTaskModal() {
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
  }

  // 모달 바깥 클릭 = 완료
  modalBackdrop.addEventListener("click", requestCloseTaskModal);
  if (btnCloseModalTop) btnCloseModalTop.addEventListener("click", requestCloseTaskModal);
  if (btnCloseModalBottom) btnCloseModalBottom.addEventListener("click", requestCloseTaskModal);

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
    hideStatusBlockHint();
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

  /** PWA: 서비스 워커 등록 (file:// 로 열었을 때는 건너뜀) */
  function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    if (location.protocol !== "http:" && location.protocol !== "https:") return;
    window.addEventListener("load", () => {
      navigator.serviceWorker
        .register("sw.js?v=51")
        .then((reg) => {
          reg.update().catch(() => {});
          if (reg.waiting) reg.waiting.postMessage({ type: "SKIP_WAITING" });
        })
        .catch((err) => {
          console.error("Service worker registration failed:", err);
        });
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        // new SW took control — reload once so calendar layout code is fresh
        if (sessionStorage.getItem("sw-reloaded-v51")) return;
        sessionStorage.setItem("sw-reloaded-v51", "1");
        location.reload();
      });
    });
  }

  (async () => {
    registerServiceWorker();
    await loadGeminiKey();
    await loadTasks();
    updateTopbarDatePill();
    await checkAndHandleRecurrenceExtension();
    startRecurrenceWatcher();
    renderCalendar();
  })();
})();
