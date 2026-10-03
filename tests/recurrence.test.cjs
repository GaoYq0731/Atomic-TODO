const test = require("node:test");
const assert = require("node:assert/strict");
const { shouldGenerateDailyTask } = require("../prototype/recurrence.js");

const template = { id: "drink-water", lastGeneratedDate: "2026-10-02" };

test("昨日任务仍未完成时不生成重复项", () => {
  const tasks = [{ recurrenceId: template.id, done: false }];
  assert.equal(shouldGenerateDailyTask(template, tasks, "2026-10-03"), false);
});

test("昨日任务已完成时生成今日任务", () => {
  const tasks = [{ recurrenceId: template.id, done: true }];
  assert.equal(shouldGenerateDailyTask(template, tasks, "2026-10-03"), true);
});

test("昨日任务已删除时生成今日任务", () => {
  assert.equal(shouldGenerateDailyTask(template, [], "2026-10-03"), true);
});

test("同一天删除任务后不会再次生成", () => {
  const generatedToday = { ...template, lastGeneratedDate: "2026-10-03" };
  assert.equal(shouldGenerateDailyTask(generatedToday, [], "2026-10-03"), false);
});
