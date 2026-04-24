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
   */

  /** @type {Task[]} */
  let tasks = [];

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
  const taskStart = document.getElementById("taskStart");
  const taskEnd = document.getElementById("taskEnd");
  const taskRecurrence = document.getElementById("taskRecurrence");
  const taskRecurrenceUntil = document.getElementById("taskRecurrenceUntil");
  const recurrenceUntilWrap = document.getElementById("recurrenceUntilWrap");
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

  /** @type {Array<(Omit<Task, 'id'> & { id?: string }) & { confidence?: number }>} */
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
  /** @type {null | { tasks: Task[], selectedDateStr: string | null, editingId: string | null, modalDefaultWhite: boolean, form: { title: string, description: string, startDate: string, endDate: string, recurrence: 'none'|'daily'|'weekly'|'monthly', recurrenceUntil: string } }} */
  let modalSessionSnapshot = null;

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

  function addDaysStr(dateStr, delta) {
    const d = parseDateStr(dateStr);
    d.setDate(d.getDate() + delta);
    return toDateStrFromDate(d);
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
      if (dateInRange(dateStr, s, e)) return true;
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
      if (dateInRange(dateStr, s, e)) return { start: s, end: e };
      const next = advanceOccurrence(task, s, e);
      if (!next) break;
      s = next.start;
      e = next.end;
      if (s > until) break;
    }
    return null;
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

  function renderQuickMetaControls() {
    const status = getCurrentStatus();
    const imp = getCurrentImportance();
    if (quickStatusGroup) {
      const buttons = quickStatusGroup.querySelectorAll("button[data-status]");
      buttons.forEach((btn) => {
        const active = btn.getAttribute("data-status") === status;
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
    return {
      id: raw.id,
      title: raw.title != null ? String(raw.title) : "",
      description: raw.description != null ? String(raw.description) : "",
      status: raw.status || "ready",
      startDate: raw.startDate,
      endDate: raw.endDate,
      recurrence: raw.recurrence === "daily" || raw.recurrence === "weekly" || raw.recurrence === "monthly" ? raw.recurrence : "none",
      recurrenceUntil: raw.recurrenceUntil != null && raw.recurrenceUntil !== "" ? raw.recurrenceUntil : null,
      importance: raw.importance === "high" || raw.importance === "low" ? raw.importance : "medium",
    };
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

  function saveTasks() {
    if (!firebaseDb || !firebaseTasksRef) return;
    const payload = toFirebaseTasksMap(tasks);
    firebaseTasksRef.set(payload).catch((err) => console.error("Firebase save error:", err));
    firebaseDb
      .ref(FIREBASE_META_PATH)
      .update({ updatedAt: new Date().toISOString() })
      .catch(() => {});
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
    if (dates.length < 2) return [];
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
        if (run.length >= 2) segments.push(run);
        run = [dates[i]];
      }
    }
    if (run.length >= 2) segments.push(run);
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

  function renderMultiDayRangeLines() {
    const layer = document.getElementById("calendarRangeLayer");
    if (!layer || !calendarGrid) return;
    layer.innerHTML = "";
    const layerRect = layer.getBoundingClientRect();
    if (layerRect.width < 1 || layerRect.height < 1) return;
    /** @type {Record<number, number>} */
    const rowSlots = {};

    tasks.forEach((task) => {
      forEachMultiDaySegment(task, (startStr, endStr) => {
        const segments = getSegmentsInGrid(startStr, endStr, calendarGrid);
        segments.forEach((dateRun) => {
          const firstDs = dateRun[0];
          const lastDs = dateRun[dateRun.length - 1];
          const firstCell = calendarGrid.querySelector(`.calendar-cell[data-date-str="${firstDs}"]`);
          const lastCell = calendarGrid.querySelector(`.calendar-cell[data-date-str="${lastDs}"]`);
          if (!firstCell || !lastCell) return;
          const allCells = [...calendarGrid.querySelectorAll(".calendar-cell")];
          const idx = allCells.indexOf(firstCell);
          const row = Math.floor(idx / 7);
          const slot = rowSlots[row] || 0;
          rowSlots[row] = slot + 1;

          const r1 = firstCell.getBoundingClientRect();
          const r2 = lastCell.getBoundingClientRect();
          const line = document.createElement("div");
          line.className = "calendar-range-line";
          line.style.background = rangeLineColorForTask(task, endStr);
          const slotClamped = Math.min(slot, 8);
          const topFrac = 0.34;
          const lineStepPx = 4; // 3px 선 + 1px 간격
          line.style.left = r1.left - layerRect.left + "px";
          line.style.top = r1.top - layerRect.top + r1.height * topFrac + slotClamped * lineStepPx + "px";
          line.style.width = r2.right - r1.left + "px";
          layer.appendChild(line);
        });
      });
    });
    applyCalendarRowHeights(rowSlots);
  }

  /**
   * 일정 밀도에 따라 해당 주의 행 높이를 늘린다.
   * @param {Record<number, number>} rowSlots
   */
  function applyCalendarRowHeights(rowSlots) {
    if (!calendarGrid) return;
    const cells = [...calendarGrid.querySelectorAll(".calendar-cell[data-date-str]")];
    const rowCount = Math.ceil(cells.length / 7);
    if (!rowCount) return;

    const rows = [];
    for (let row = 0; row < rowCount; row++) {
      const inRow = cells.slice(row * 7, row * 7 + 7);
      let maxTasks = 0;
      inRow.forEach((cell) => {
        const ds = cell.dataset.dateStr;
        if (!ds) return;
        const c = tasks.filter((t) => taskCoversDate(t, ds)).length;
        if (c > maxTasks) maxTasks = c;
      });
      const taskExtra = Math.max(0, maxTasks - 4) * 6;
      const lineExtra = Math.max(0, (rowSlots[row] || 0) - 3) * 4;
      const h = Math.min(150, 88 + taskExtra + lineExtra);
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
    if (selectedDateStr) {
      taskStart.value = selectedDateStr;
      taskEnd.value = selectedDateStr;
    }
    taskRecurrence.value = "none";
    taskRecurrenceUntil.value = "";
    toggleRecurrenceFields();
    btnDelete.hidden = true;
    renderQuickMetaControls();
    applyModalTheme();
  }

  function cloneTasks(src) {
    return src.map((t) => ({ ...t }));
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
        startDate: taskStart.value,
        endDate: taskEnd.value,
        recurrence: /** @type {'none'|'daily'|'weekly'|'monthly'} */ (taskRecurrence.value),
        recurrenceUntil: taskRecurrenceUntil.value,
      },
    };
  }

  function restoreModalSnapshot() {
    if (!modalSessionSnapshot) return;
    tasks = cloneTasks(modalSessionSnapshot.tasks);
    selectedDateStr = modalSessionSnapshot.selectedDateStr;
    editingId = modalSessionSnapshot.editingId;
    modalDefaultWhite = modalSessionSnapshot.modalDefaultWhite;
    taskTitle.value = modalSessionSnapshot.form.title;
    taskDescription.value = modalSessionSnapshot.form.description;
    taskStart.value = modalSessionSnapshot.form.startDate;
    taskEnd.value = modalSessionSnapshot.form.endDate;
    taskRecurrence.value = modalSessionSnapshot.form.recurrence;
    taskRecurrenceUntil.value = modalSessionSnapshot.form.recurrenceUntil;
    toggleRecurrenceFields();
    btnDelete.hidden = !editingId;
    saveTasks();
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
          ? ` · 반복: ${t.recurrence}${t.recurrenceUntil ? " ~ " + t.recurrenceUntil : ""}`
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
      cell.innerHTML = `<span class="calendar-cell__ongoing-count" hidden></span><span class="calendar-cell__num">${d}</span><div class="calendar-cell__dots" aria-hidden="true"></div>`;
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
      cell.innerHTML = `<span class="calendar-cell__ongoing-count" hidden></span><span class="calendar-cell__num">${i}</span><div class="calendar-cell__dots" aria-hidden="true"></div>`;
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

  function buildOngoingBadgeTooltip(ongoingTasks) {
    if (!ongoingTasks.length) return "";
    const maxLines = 15;
    const lines = ongoingTasks.map((t) => taskLabel(t));
    const shown = lines.slice(0, maxLines);
    let tip = `on-going ${ongoingTasks.length}건`;
    tip += "\n────────\n";
    tip += shown.map((lab, i) => `${i + 1}. ${lab}`).join("\n");
    if (lines.length > maxLines) tip += `\n… 외 ${lines.length - maxLines}건`;
    return tip;
  }

  function styleCellForDate(cell, dateStr) {
    const list = tasks.filter((t) => taskCoversDate(t, dateStr));
    const ongoingTasks = list.filter((t) => t.status === "on-going");
    const ongoingCount = ongoingTasks.length;
    const ongoingEl = cell.querySelector(".calendar-cell__ongoing-count");
    if (ongoingEl) {
      if (ongoingCount > 0) {
        ongoingEl.textContent = String(ongoingCount);
        ongoingEl.hidden = false;
        ongoingEl.title = buildOngoingBadgeTooltip(ongoingTasks);
        ongoingEl.setAttribute(
          "aria-label",
          `${dateStr} on-going ${ongoingCount}건: ${ongoingTasks.map(taskLabel).join(", ")}`
        );
      } else {
        ongoingEl.textContent = "";
        ongoingEl.hidden = true;
        ongoingEl.removeAttribute("title");
        ongoingEl.removeAttribute("aria-label");
      }
    }

    const dots = cell.querySelector(".calendar-cell__dots");
    if (dots) dots.innerHTML = "";

    cell.classList.remove("calendar-cell--heat-low", "calendar-cell--heat-mid", "calendar-cell--heat-high");
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
      const maxDots = 8;
      const sorted = sortTasksForDots(list);
      sorted.slice(0, maxDots).forEach((t) => {
        const wrap = document.createElement("span");
        wrap.className = importanceWrapClass(t.importance || "medium");
        const impKey = t.importance === "high" ? "high" : t.importance === "low" ? "low" : "medium";
        const impToken = impKey === "high" ? "【H】 " : impKey === "low" ? "【L】 " : "【M】 ";
        const stKey = t.status === "on-going" ? "ongoing" : t.status === "done" ? "done" : "ready";
        wrap.dataset.tipToken = impToken;
        wrap.dataset.tipBody = `${taskLabel(t)}`;
        wrap.classList.add(`calendar-cell__dot-wrap--tip-${stKey}`, `calendar-cell__dot-wrap--tip-imp-${impKey}`);
        wrap.tabIndex = 0;
        const inner = document.createElement("span");
        inner.className = "calendar-cell__dot-inner " + statusDotClass(t.status);
        if (isTaskOverdueOnDate(t, dateStr)) inner.classList.add("calendar-cell__dot-inner--late");
        wrap.appendChild(inner);
        dots.appendChild(wrap);
      });
      if (sorted.length > maxDots) {
        const more = document.createElement("span");
        more.className = "calendar-cell__more";
        more.textContent = "+" + (sorted.length - maxDots);
        more.title = `외 ${sorted.length - maxDots}건`;
        dots.appendChild(more);
      }
    }
  }

  function toggleRecurrenceFields() {
    const r = taskRecurrence.value;
    const show = r !== "none";
    recurrenceUntilWrap.hidden = !show;
    if (show && !taskRecurrenceUntil.value && taskEnd.value) {
      const t = parseDateStr(taskEnd.value);
      t.setMonth(t.getMonth() + 3);
      taskRecurrenceUntil.value = toDateStrFromDate(t);
    }
  }

  function openModal(dateStr, taskId) {
    selectedDateStr = dateStr;
    editingId = taskId || null;
    modalDefaultWhite = !taskId;

    const ymd = parseDateStr(dateStr);
    modalDateHint.textContent = `${ymd.getFullYear()}년 ${ymd.getMonth() + 1}월 ${ymd.getDate()}일`;

    const fillFormFromTask = (t) => {
      taskTitle.value = t.title || "";
      taskDescription.value = t.description || "";
      taskStart.value = t.startDate;
      taskEnd.value = t.endDate;
      taskRecurrence.value = t.recurrence || "none";
      taskRecurrenceUntil.value = t.recurrenceUntil || "";
    };

    if (taskId) {
      const t = tasks.find((x) => x.id === taskId);
      if (t) {
        fillFormFromTask(t);
        draftStatus = t.status || "ready";
        draftImportance = t.importance || "medium";
      }
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
        taskStart.value = dateStr;
        taskEnd.value = dateStr;
        taskRecurrence.value = "none";
        taskRecurrenceUntil.value = "";
      }
    }

    toggleRecurrenceFields();
    btnDelete.hidden = !editingId;
    renderQuickMetaControls();

    applyModalTheme();

    renderExistingTasksList();
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
      const recBadge = t.recurrence && t.recurrence !== "none" ? ` · ${t.recurrence}` : "";
      const imp = t.importance || "medium";
      const impToken = imp === "high" ? "H" : imp === "low" ? "L" : "M";
      btn.innerHTML = `<span class="task-chip__desc"><span class="task-chip__imp task-chip__imp--${imp}">【${impToken}】</span>${escapeHtml(short)}${escapeHtml(recBadge)}</span><span class="task-chip__status">${escapeHtml(t.status)}</span>`;
      btn.title = "클릭: 상세 편집 · 호버: 상태/중요도/삭제";
      btn.addEventListener("click", () => {
        editingId = t.id;
        modalDefaultWhite = false;
        taskTitle.value = t.title || "";
        draftStatus = t.status || "ready";
        draftImportance = t.importance || "medium";
        taskDescription.value = t.description || "";
        taskStart.value = t.startDate;
        taskEnd.value = t.endDate;
        taskRecurrence.value = t.recurrence || "none";
        taskRecurrenceUntil.value = t.recurrenceUntil || "";
        toggleRecurrenceFields();
        btnDelete.hidden = false;
        renderQuickMetaControls();
        applyModalTheme();
        renderExistingTasksList();
      });

      const quick = document.createElement("div");
      quick.className = "task-chip__quick";
      quick.setAttribute("role", "tooltip");
      quick.innerHTML = `<span class="task-chip__quick-label">상태</span>`;
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
          tasks[i] = { ...tasks[i], status: st };
          if (editingId === t.id) modalDefaultWhite = false;
          await firebaseUpdateTask(t.id, { status: st });
          renderCalendar();
          renderQuickMetaControls();
          applyModalTheme();
          renderExistingTasksList();
        });
        quick.appendChild(q);
      });
      const impLabel = document.createElement("span");
      impLabel.className = "task-chip__quick-label";
      impLabel.textContent = "중요도";
      quick.appendChild(impLabel);
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
          tasks[i] = { ...tasks[i], importance: impKey };
          await firebaseUpdateTask(t.id, { importance: impKey });
          renderCalendar();
          renderQuickMetaControls();
          applyModalTheme();
          renderExistingTasksList();
        });
        quick.appendChild(iq);
      });
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
        tasks = tasks.filter((x) => x.id !== t.id);
        if (editingId === t.id) {
          resetModalFormForNewTaskOnDay();
        }
        await firebaseDeleteTask(t.id);
        renderCalendar();
        renderExistingTasksList();
      });
      quick.appendChild(del);

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

  function coerceOcrItem(o, todayStr) {
    const title = (o.title != null && String(o.title).trim()) || "(제목 없음)";
    let startDate =
      typeof o.startDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(o.startDate) ? o.startDate : todayStr;
    let endDate =
      typeof o.endDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(o.endDate) ? o.endDate : startDate;
    if (parseDateStr(startDate) > parseDateStr(endDate)) endDate = startDate;
    const status = ["ready", "on-going", "done"].includes(o.status) ? o.status : "ready";
    const importance = ["high", "medium", "low"].includes(o.importance) ? o.importance : "medium";
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

스키마: 각 원소는 {"title": string, "startDate": "YYYY-MM-DD", "endDate": "YYYY-MM-DD", "status": "ready"|"on-going"|"done", "importance": "high"|"medium"|"low", "description": string, "confidence": number}
규칙:
- 날짜가 적혀 있으면 그 날짜를 사용합니다. 같은 날짜 아래에 여러 줄이 있으면 각각 별도 항목으로 두고 같은 startDate와 endDate를 씁니다.
- 날짜가 전혀 없으면 startDate와 endDate를 모두 "${todayStr}"로 합니다.
- 한 줄에 날짜와 제목이 같이 있으면 그 날짜에 그 제목을 넣습니다.
- status는 기본 ready. 완료·체크 표시가 있으면 done, 진행중 표시가 있으면 on-going.
- importance는 특별히 없으면 medium.
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
                <option value="ready">ready</option>
                <option value="on-going">on-going</option>
                <option value="done">done</option>
              </select>
            </label>
            <label>중요도
              <select class="ocr-draft-imp" data-index="${index}">
                <option value="high">상</option>
                <option value="medium">중</option>
                <option value="low">하</option>
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
      const dEl = li.querySelector(".ocr-draft-desc");
      if (titleEl) titleEl.value = row.title || "";
      if (sEl) sEl.value = row.startDate || "";
      if (eEl) eEl.value = row.endDate || "";
      if (stEl) stEl.value = row.status || "ready";
      if (imEl) imEl.value = row.importance || "medium";
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
      const d = /** @type {HTMLTextAreaElement | null} */ (ocrDraftList.querySelector(`.ocr-draft-desc[data-index="${index}"]`));
      const cb = /** @type {HTMLInputElement | null} */ (ocrDraftList.querySelector(`.ocr-draft-cb[data-index="${index}"]`));
      if (!cb || !cb.checked) return;
      const payload = {
        title: (title && title.value.trim()) || "(제목 없음)",
        startDate: s && s.value ? s.value : toDateStrFromDate(new Date()),
        endDate: e && e.value ? e.value : s && s.value ? s.value : toDateStrFromDate(new Date()),
        status: st ? st.value : "ready",
        importance: im ? /** @type {'high'|'medium'|'low'} */ (im.value) : "medium",
        description: d ? d.value.trim() : "",
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
    const startDate = taskStart.value;
    const endDate = taskEnd.value;
    const recurrence = /** @type {'none'|'daily'|'weekly'|'monthly'} */ (taskRecurrence.value);
    let recurrenceUntil = taskRecurrenceUntil.value || null;
    const importance = /** @type {'high'|'medium'|'low'} */ (getCurrentImportance());

    // 새 항목에서 제목/설명이 모두 비면 저장하지 않고 닫는다 (유령 항목 생성 방지)
    if (!editingId && !title && !description) {
      closeModal();
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
      if (!recurrenceUntil) {
        await openAlertDialog("반복 일정인 경우 반복 종료일을 선택해 주세요.");
        return;
      }
      if (parseDateStr(recurrenceUntil) < parseDateStr(endDate)) {
        await openAlertDialog("반복 종료일은 첫 일정의 완료일 이후여야 합니다.");
        return;
      }
    } else {
      recurrenceUntil = null;
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
    };

    if (editingId) {
      const i = tasks.findIndex((x) => x.id === editingId);
      if (i >= 0) {
        tasks[i] = { ...tasks[i], ...payload };
        await firebaseUpdateTask(editingId, payload);
      }
    } else {
      const newTask = { id: uuid(), ...payload };
      tasks.push(newTask);
      await firebaseCreateTask(newTask);
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
    toggleRecurrenceFields();
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
  taskRecurrence.addEventListener("change", () => {
    toggleRecurrenceFields();
  });
  if (quickStatusGroup) {
    quickStatusGroup.addEventListener("click", async (e) => {
      const btn = e.target instanceof HTMLElement ? e.target.closest("button[data-status]") : null;
      if (!(btn instanceof HTMLButtonElement)) return;
      const st = btn.dataset.status || "ready";
      if (editingId) {
        const i = tasks.findIndex((x) => x.id === editingId);
        if (i >= 0) tasks[i] = { ...tasks[i], status: st };
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
        if (i >= 0) tasks[i] = { ...tasks[i], importance: imp };
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
        saveTasks();
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
    btnOcrApply.addEventListener("click", () => {
      const payloads = readOcrDraftFromDom();
      if (!payloads.length) {
        alert("추가할 항목을 하나 이상 선택해 주세요.");
        return;
      }
      payloads.forEach((p) => {
        tasks.push(normalizeTask({ id: uuid(), ...p }));
      });
      saveTasks();
      renderCalendar();
      closeOcrModal();
    });
  }

  searchInput.addEventListener("input", updateSearchResults);
  searchStatus.addEventListener("change", updateSearchResults);

  btnUndo.addEventListener("click", restoreModalSnapshot);
  modalBackdrop.addEventListener("click", () => {
    if (!taskModal.hidden) saveFromModal();
  });

  btnSave.addEventListener("click", saveFromModal);
  btnDelete.addEventListener("click", deleteTask);

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

  (async () => {
    await loadGeminiKey();
    await loadTasks();
    renderCalendar();
  })();
})();
