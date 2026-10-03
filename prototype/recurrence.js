(function exposeRecurrence(scope) {
  function shouldGenerateDailyTask(template, tasks, date) {
    if (template.lastGeneratedDate === date) return false;
    return !tasks.some((task) => task.recurrenceId === template.id && !task.done);
  }

  const api = { shouldGenerateDailyTask };
  scope.AtomicTodoRecurrence = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
}(globalThis));
