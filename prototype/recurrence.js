(function exposeRecurrence(scope) {
  function shouldGenerateDailyTask(template, tasks, date) {
    if (template.lastGeneratedDate === date) return false;
    return !tasks.some((task) => task.recurrenceId === template.id && !task.done);
  }

  function removeDailyTask(tasks, templates, taskId, permanently = false) {
    const target = tasks.find((task) => task.id === taskId);
    if (!target) return { tasks, templates };

    const recurrenceId = target.recurrenceId;
    return {
      tasks: tasks.filter((task) => task.id !== taskId
        && !(permanently && recurrenceId && task.recurrenceId === recurrenceId && !task.done)),
      templates: permanently && recurrenceId
        ? templates.filter((template) => template.id !== recurrenceId)
        : templates,
    };
  }

  const api = { shouldGenerateDailyTask, removeDailyTask };
  scope.AtomicTodoRecurrence = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
}(globalThis));
