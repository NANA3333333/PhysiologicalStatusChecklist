import assert from "node:assert/strict";
import { buildStatusPrompt, formatStatusSnapshot } from "./status-prompt.js";

const snapshot = formatStatusSnapshot({
    date: "第2天·夜",
    growth: "幼体·阶段1 | 观察中",
    injury: "左上肢：擦伤",
    focus: "观察拒绝反应",
    records: ["首次理解睡觉是拒绝"],
});

assert.match(snapshot.fields, /日期=第2天·夜/u);
assert.match(snapshot.fields, /成长周期=幼体·阶段1 \/ 观察中/u);
assert.match(snapshot.fields, /损伤=左上肢：擦伤/u);
assert.doesNotMatch(snapshot.fields, /体温=/u);
assert.match(snapshot.records, /01\. 首次理解睡觉是拒绝/u);

const prompt = buildStatusPrompt({ date: "第2天", records: ["首次记录"] });
assert.match(prompt, /动态状态插件协议/u);
assert.match(prompt, /当前状态字段/u);
assert.match(prompt, /只有当前状态发生变化/u);
assert.match(prompt, /记录\+=/u);
assert.match(prompt, /日期=第2天/u);
assert.match(prompt, /跨过午夜/u);
assert.match(prompt, /清空昨天/u);
assert.match(prompt, /每条永久记录不超过60字/u);
assert.match(prompt, /必须在同一状态行填写“观察补记=”/u);
assert.match(prompt, /不得只写勾选结论/u);
