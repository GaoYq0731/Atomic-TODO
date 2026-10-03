const STORAGE_KEY = "atomic-todo-v1";
const { shouldGenerateDailyTask, removeDailyTask } = globalThis.AtomicTodoRecurrence;

const plans = [
  { id: "daily", name: "日常计划" },
  { id: "day", name: "日计划" },
  { id: "week", name: "周计划" },
  { id: "month", name: "月计划" },
];

const defaultCategories = [
  { id: "study", name: "学习任务", fixed: false },
  { id: "fitness", name: "健身任务", fixed: false },
  { id: "life", name: "生活任务", fixed: false },
  { id: "other", name: "其他", fixed: true },
];

const defaultTasks = [
  { id: crypto.randomUUID(), name: "整理本周待办", time: "10:30", categoryId: "study", planId: "day", reminderAt: null, reminderLead: 0, done: false },
  { id: crypto.randomUUID(), name: "提交研究材料", time: "18:30", categoryId: "study", planId: "week", reminderAt: null, reminderLead: 0, done: false },
  { id: crypto.randomUUID(), name: "给自己留一点休息时间", time: "今晚", categoryId: "life", planId: "month", reminderAt: null, reminderLead: 0, done: true },
];

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved?.categories?.length && Array.isArray(saved.tasks)) {
      saved.tasks = saved.tasks.map((task) => ({
        ...task,
        planId: plans.some((plan) => plan.id === task.planId) ? task.planId : "day",
        reminderAt: task.reminderAt ?? null,
        reminderLead: Number(task.reminderLead ?? 0),
        recurrenceId: task.recurrenceId ?? null,
        occurrenceDate: task.occurrenceDate ?? null,
      }));
      saved.dailyTemplates = Array.isArray(saved.dailyTemplates)
        ? saved.dailyTemplates.map((template) => ({
          ...template,
          reminderTime: template.reminderTime ?? null,
          reminderLead: Number(template.reminderLead ?? 0),
          lastGeneratedDate: template.lastGeneratedDate ?? null,
        }))
        : [];
      return saved;
    }
  } catch {}
  return { categories: defaultCategories, tasks: defaultTasks, dailyTemplates: [] };
}

const savedState = loadState();
let categories = savedState.categories;
let tasks = savedState.tasks;
let dailyTemplates = savedState.dailyTemplates;
let activeCategory = "all";
let activePlan = "all";
let pendingReminder = null;
let pendingDailyDeleteTaskId = null;
let ultraCompact = false;

const widget = document.querySelector(".widget");
const form = document.querySelector("#taskForm");
const input = document.querySelector("#taskInput");
const planSelect = document.querySelector("#taskPlan");
const categorySelect = document.querySelector("#taskCategory");
const categoryTabs = document.querySelector("#categoryTabs");
const planTabs = document.querySelector("#planTabs");
const template = document.querySelector("#taskTemplate");
const activeTasks = document.querySelector("#activeTasks");
const doneTasks = document.querySelector("#doneTasks");
const activeCount = document.querySelector("#activeCount");
const doneCount = document.querySelector("#doneCount");
const progressText = document.querySelector("#progressText");
const progressBar = document.querySelector("#progressBar");
const doneSection = document.querySelector("#doneSection");
const categoryDialog = document.querySelector("#categoryDialog");
const categoryList = document.querySelector("#categoryList");
const categoryForm = document.querySelector("#categoryForm");
const categoryInput = document.querySelector("#categoryInput");
const reminderDialog = document.querySelector("#reminderDialog");
const reminderButton = document.querySelector("#reminderButton");
const reminderDate = document.querySelector("#reminderDate");
const reminderTime = document.querySelector("#reminderTime");
const reminderLead = document.querySelector("#reminderLead");
const dailyDeleteDialog = document.querySelector("#dailyDeleteDialog");
const dailyDeleteTaskName = document.querySelector("#dailyDeleteTaskName");
const lockButton = document.querySelector("#lockButton");
const ultraRestoreButton = document.querySelector("#ultraRestoreButton");

const weekday = new Intl.DateTimeFormat("zh-CN", { weekday: "long", month: "long", day: "numeric" });
document.querySelector("#todayLabel").textContent = weekday.format(new Date());

function localDateValue(date = new Date()) {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ categories, tasks, dailyTemplates }));
}

function createDailyOccurrence(template, date) {
  return {
    id: crypto.randomUUID(),
    name: template.name,
    time: template.time,
    categoryId: template.categoryId,
    planId: "daily",
    reminderAt: template.reminderTime ? `${date}T${template.reminderTime}` : null,
    reminderLead: template.reminderLead,
    recurrenceId: template.id,
    occurrenceDate: date,
    done: false,
  };
}

function ensureDailyTasks(date = localDateValue()) {
  let added = false;
  dailyTemplates.forEach((template) => {
    if (!shouldGenerateDailyTask(template, tasks, date)) return;
    tasks.unshift(createDailyOccurrence(template, date));
    template.lastGeneratedDate = date;
    added = true;
  });
  return added;
}

function closeDailyDeleteDialog() {
  pendingDailyDeleteTaskId = null;
  dailyDeleteDialog.close();
}

function openDailyDeleteDialog(task) {
  pendingDailyDeleteTaskId = task.id;
  dailyDeleteTaskName.textContent = task.name;
  dailyDeleteDialog.showModal();
}

function confirmDailyDelete(permanently) {
  if (!pendingDailyDeleteTaskId) return;
  const result = removeDailyTask(tasks, dailyTemplates, pendingDailyDeleteTaskId, permanently);
  tasks = result.tasks;
  dailyTemplates = result.templates;
  if (!permanently) ensureDailyTasks();
  closeDailyDeleteDialog();
  render();
}

function parseTask(value) {
  const match = value.trim().match(/^(\d{1,2}:\d{2})\s+(.+)$/);
  return match
    ? { name: match[2], time: match[1], parsedTime: match[1] }
    : { name: value.trim(), time: "无提醒", parsedTime: null };
}

function getFallbackCategory() {
  return categories.find((category) => category.id === "other")?.id ?? categories[0]?.id;
}

function formatReminder(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function reminderButtonLabel() {
  if (!pendingReminder) return "提醒：关闭";
  const lead = pendingReminder.lead ? ` · 提前${pendingReminder.lead}分` : "";
  return `提醒：${formatReminder(pendingReminder.at)}${lead}`;
}

function renderTask(task) {
  const node = template.content.firstElementChild.cloneNode(true);
  const category = categories.find((item) => item.id === task.categoryId);
  const plan = plans.find((item) => item.id === task.planId);
  const metadata = [plan?.name ?? "日计划", category?.name ?? "其他"];
  if (task.reminderAt) metadata.push(`⏰ ${formatReminder(task.reminderAt)}`);
  else if (task.time && task.time !== "无提醒") metadata.unshift(task.time);

  node.classList.toggle("is-done", task.done);
  node.classList.toggle("is-daily", task.planId === "daily");
  node.querySelector(".task__name").textContent = task.name;
  node.querySelector(".task__time").textContent = metadata.join(" · ");
  node.querySelector(".check").addEventListener("click", () => {
    if (task.done && task.recurrenceId) {
      const hasAnotherPending = tasks.some((item) => item.id !== task.id
        && item.recurrenceId === task.recurrenceId
        && !item.done);
      if (hasAnotherPending) return;
    }
    task.done = !task.done;
    ensureDailyTasks();
    render();
  });
  const deleteButton = node.querySelector(".delete");
  if (task.planId === "daily") {
    deleteButton.title = "删除日常任务";
    deleteButton.setAttribute("aria-label", "删除日常任务");
  }
  deleteButton.addEventListener("click", () => {
    if (task.planId === "daily") {
      openDailyDeleteDialog(task);
      return;
    }
    tasks = tasks.filter((item) => item.id !== task.id);
    render();
  });
  return node;
}

function renderCategoryTabs() {
  const items = [{ id: "all", name: "全部" }, ...categories];
  categoryTabs.replaceChildren(...items.map((category) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "category-tab";
    button.classList.toggle("is-active", category.id === activeCategory);
    button.textContent = category.name;
    button.addEventListener("click", () => {
      activeCategory = category.id;
      if (category.id !== "all") categorySelect.value = category.id;
      render();
    });
    return button;
  }));

  const previousValue = categorySelect.value;
  categorySelect.replaceChildren(...categories.map((category) => {
    const option = document.createElement("option");
    option.value = category.id;
    option.textContent = category.name;
    return option;
  }));
  categorySelect.value = categories.some((category) => category.id === previousValue)
    ? previousValue
    : (activeCategory !== "all" ? activeCategory : getFallbackCategory());
}

function renderPlanTabs() {
  const items = [{ id: "all", name: "全部" }, ...plans];
  planTabs.replaceChildren(...items.map((plan) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "plan-tab";
    button.classList.toggle("is-active", plan.id === activePlan);
    button.textContent = plan.name;
    button.addEventListener("click", () => {
      activePlan = plan.id;
      if (plan.id !== "all") planSelect.value = plan.id;
      render();
    });
    return button;
  }));

  const previousValue = planSelect.value;
  planSelect.replaceChildren(...plans.map((plan) => {
    const option = document.createElement("option");
    option.value = plan.id;
    option.textContent = plan.name;
    return option;
  }));
  planSelect.value = plans.some((plan) => plan.id === previousValue)
    ? previousValue
    : (activePlan !== "all" ? activePlan : "day");
}

function renderCategoryManager() {
  categoryList.replaceChildren(...categories.map((category) => {
    const row = document.createElement("div");
    row.className = "category-row";

    const dot = document.createElement("span");
    dot.className = "category-row__dot";
    row.append(dot);

    const name = document.createElement("input");
    name.className = "category-row__name";
    name.value = category.name;
    name.maxLength = 10;
    name.disabled = category.fixed;
    name.setAttribute("aria-label", `分类名称：${category.name}`);
    name.addEventListener("change", () => {
      const nextName = name.value.trim();
      if (nextName && !categories.some((item) => item.id !== category.id && item.name === nextName)) {
        category.name = nextName;
        render();
      } else {
        name.value = category.name;
      }
    });
    row.append(name);

    if (category.fixed) {
      const fixed = document.createElement("span");
      fixed.className = "category-row__fixed";
      fixed.textContent = "固定";
      row.append(fixed);
    } else {
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "category-delete";
      remove.textContent = "×";
      remove.setAttribute("aria-label", `删除${category.name}`);
      remove.addEventListener("click", () => {
        const fallback = getFallbackCategory();
        tasks.forEach((task) => {
          if (task.categoryId === category.id) task.categoryId = fallback;
        });
        dailyTemplates.forEach((template) => {
          if (template.categoryId === category.id) template.categoryId = fallback;
        });
        categories = categories.filter((item) => item.id !== category.id);
        if (activeCategory === category.id) activeCategory = "all";
        render();
        renderCategoryManager();
      });
      row.append(remove);
    }
    return row;
  }));
}

function render() {
  renderPlanTabs();
  renderCategoryTabs();
  reminderButton.textContent = reminderButtonLabel();

  const planTasks = activePlan === "all" ? tasks : tasks.filter((task) => task.planId === activePlan);
  const visibleTasks = activeCategory === "all"
    ? planTasks
    : planTasks.filter((task) => task.categoryId === activeCategory);
  const active = visibleTasks.filter((task) => !task.done);
  const done = visibleTasks.filter((task) => task.done);
  activeTasks.replaceChildren(...active.map(renderTask));
  doneTasks.replaceChildren(...done.map(renderTask));
  activeCount.textContent = `${active.length} 项`;
  doneCount.textContent = `${done.length} 项`;

  const percent = visibleTasks.length ? Math.round((done.length / visibleTasks.length) * 100) : 0;
  progressBar.style.width = `${percent}%`;
  progressText.textContent = percent === 100 && visibleTasks.length
    ? "这一组任务全部完成 ✦"
    : percent
      ? `当前筛选已完成 ${percent}%`
      : visibleTasks.length ? "计划正在进行" : "这个筛选还是空的";
  saveState();
  requestAnimationFrame(fitDesktopWindow);
}

function fitDesktopWindow() {
  if (!window.atomicTodo || ultraCompact) return;
  const height = Math.ceil(widget.getBoundingClientRect().height + 20);
  window.atomicTodo.fitContent(height);
}

function notificationKey(task) {
  return `atomic-notified-${task.id}-${task.reminderAt ?? localDateValue()}`;
}

function checkDueTasks() {
  if (!window.atomicTodo) return;
  const now = new Date();
  const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

  tasks.filter((task) => !task.done).forEach((task) => {
    const key = notificationKey(task);
    if (localStorage.getItem(key) === "1") return;

    let due = false;
    if (task.reminderAt) {
      const reminderMoment = new Date(task.reminderAt).getTime() - Number(task.reminderLead ?? 0) * 60_000;
      due = Number.isFinite(reminderMoment) && reminderMoment <= now.getTime();
    } else if (/^\d{1,2}:\d{2}$/.test(task.time)) {
      const [hour, minute] = task.time.split(":").map(Number);
      const normalizedTime = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
      due = normalizedTime <= currentTime;
    }

    if (due) {
      const category = categories.find((item) => item.id === task.categoryId)?.name ?? "其他";
      const plan = plans.find((item) => item.id === task.planId)?.name ?? "日计划";
      window.atomicTodo.notify("原子代办", `${task.name} · ${plan} · ${category}`);
      localStorage.setItem(key, "1");
    }
  });
}

function openReminderDialog() {
  const parsed = input.value.trim().match(/^(\d{1,2}:\d{2})\s+/)?.[1];
  reminderDate.value = pendingReminder?.at?.slice(0, 10) ?? localDateValue();
  reminderTime.value = pendingReminder?.at?.slice(11, 16) ?? parsed ?? "09:00";
  reminderLead.value = String(pendingReminder?.lead ?? 0);
  reminderDialog.showModal();
}

function setUltraCompact(enabled) {
  ultraCompact = enabled;
  widget.classList.toggle("is-ultra", enabled);
  window.atomicTodo?.setUltraCompact(enabled);
  if (!enabled) requestAnimationFrame(fitDesktopWindow);
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!input.value.trim()) return;
  const parsed = parseTask(input.value);
  let reminder = pendingReminder;
  if (!reminder && parsed.parsedTime) {
    const normalized = parsed.parsedTime.padStart(5, "0");
    reminder = { at: `${localDateValue()}T${normalized}`, lead: 0 };
  }
  const recurrenceId = planSelect.value === "daily" ? crypto.randomUUID() : null;
  const task = {
    id: crypto.randomUUID(),
    name: parsed.name,
    time: parsed.time,
    categoryId: categorySelect.value,
    planId: planSelect.value,
    reminderAt: reminder?.at ?? null,
    reminderLead: reminder?.lead ?? 0,
    recurrenceId,
    occurrenceDate: recurrenceId ? localDateValue() : null,
    done: false,
  };
  tasks.unshift(task);
  if (recurrenceId) {
    dailyTemplates.unshift({
      id: recurrenceId,
      name: task.name,
      time: task.time,
      categoryId: task.categoryId,
      reminderTime: task.reminderAt?.slice(11, 16) ?? null,
      reminderLead: task.reminderLead,
      lastGeneratedDate: task.occurrenceDate,
    });
  }
  input.value = "";
  pendingReminder = null;
  render();
});

categoryForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const name = categoryInput.value.trim();
  if (!name || categories.some((category) => category.name === name)) return;
  const category = { id: crypto.randomUUID(), name, fixed: false };
  categories.splice(Math.max(categories.length - 1, 0), 0, category);
  categoryInput.value = "";
  render();
  renderCategoryManager();
});

document.querySelector("#categoryManageButton").addEventListener("click", () => {
  renderCategoryManager();
  categoryDialog.showModal();
});
document.querySelector("#categoryDialogClose").addEventListener("click", () => categoryDialog.close());
categoryDialog.addEventListener("click", (event) => {
  if (event.target === categoryDialog) categoryDialog.close();
});

reminderButton.addEventListener("click", openReminderDialog);
document.querySelector("#reminderDialogClose").addEventListener("click", () => reminderDialog.close());
document.querySelector("#reminderClear").addEventListener("click", () => {
  pendingReminder = null;
  reminderDialog.close();
  render();
});
document.querySelector("#reminderSave").addEventListener("click", () => {
  if (!reminderDate.value || !reminderTime.value) return;
  pendingReminder = {
    at: `${reminderDate.value}T${reminderTime.value}`,
    lead: Number(reminderLead.value),
  };
  reminderDialog.close();
  render();
});
reminderDialog.addEventListener("click", (event) => {
  if (event.target === reminderDialog) reminderDialog.close();
});

document.querySelector("#dailyDeleteClose").addEventListener("click", closeDailyDeleteDialog);
document.querySelector("#dailyDeleteOnce").addEventListener("click", () => confirmDailyDelete(false));
document.querySelector("#dailyDeleteForever").addEventListener("click", () => confirmDailyDelete(true));
dailyDeleteDialog.addEventListener("click", (event) => {
  if (event.target === dailyDeleteDialog) closeDailyDeleteDialog();
});

document.querySelector("#doneToggle").addEventListener("click", () => doneSection.classList.toggle("is-collapsed"));
document.querySelector("#compactButton").addEventListener("click", (event) => {
  if (ultraCompact) return;
  const compact = widget.classList.toggle("is-compact");
  event.currentTarget.classList.toggle("is-active", compact);
  window.atomicTodo?.setCompact(compact);
  requestAnimationFrame(fitDesktopWindow);
});
document.querySelector("#ultraCompactButton").addEventListener("click", () => setUltraCompact(true));

let ultraPointer = null;
let ultraDidDrag = false;

ultraRestoreButton.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) return;
  event.preventDefault();
  ultraPointer = {
    id: event.pointerId,
    screenX: event.screenX,
    screenY: event.screenY,
  };
  ultraDidDrag = false;
  ultraRestoreButton.setPointerCapture(event.pointerId);
  ultraRestoreButton.classList.add("is-dragging");
  window.atomicTodo?.startUltraDrag(event.screenX, event.screenY);
});

ultraRestoreButton.addEventListener("pointermove", (event) => {
  if (!ultraPointer || event.pointerId !== ultraPointer.id) return;
  if (Math.hypot(event.screenX - ultraPointer.screenX, event.screenY - ultraPointer.screenY) >= 5) {
    ultraDidDrag = true;
  }
  if (ultraDidDrag) window.atomicTodo?.moveUltraDrag(event.screenX, event.screenY);
});

function finishUltraPointer(event, restoreOnClick) {
  if (!ultraPointer || event.pointerId !== ultraPointer.id) return;
  const shouldRestore = restoreOnClick && !ultraDidDrag;
  window.atomicTodo?.endUltraDrag();
  ultraRestoreButton.classList.remove("is-dragging");
  if (ultraRestoreButton.hasPointerCapture(event.pointerId)) {
    ultraRestoreButton.releasePointerCapture(event.pointerId);
  }
  ultraPointer = null;
  ultraDidDrag = false;
  if (shouldRestore) setUltraCompact(false);
}

ultraRestoreButton.addEventListener("pointerup", (event) => finishUltraPointer(event, true));
ultraRestoreButton.addEventListener("pointercancel", (event) => finishUltraPointer(event, false));
ultraRestoreButton.addEventListener("click", (event) => {
  if (event.detail === 0) setUltraCompact(false);
});
lockButton.addEventListener("click", () => {
  const locked = lockButton.classList.toggle("is-active");
  lockButton.textContent = locked ? "●" : "⌁";
  window.atomicTodo?.setLocked(locked);
});
document.querySelector("#closeButton").addEventListener("click", () => window.atomicTodo?.quit());

if (window.atomicTodo) {
  window.atomicTodo.getWindowState().then(({ locked }) => {
    lockButton.classList.toggle("is-active", locked);
    lockButton.textContent = locked ? "●" : "⌁";
  });
  new ResizeObserver(fitDesktopWindow).observe(widget);
  setTimeout(checkDueTasks, 1500);
  setInterval(checkDueTasks, 15_000);
}

ensureDailyTasks();
setInterval(() => {
  document.querySelector("#todayLabel").textContent = weekday.format(new Date());
  if (ensureDailyTasks()) render();
}, 60_000);
render();
