import assert from "node:assert/strict";
import { CHECKLIST_FIELDS, getMatchedChecklistOptions } from "./status-fields.js";
import { buildStatusPrompt, formatStatusSnapshot, getMissingStatusFields, REQUIRED_STATUS_FIELDS } from "./status-prompt.js";

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
assert.match(prompt, /旧版 HTML\/CSS 状态面板/u);
assert.match(prompt, /跨过午夜/u);
assert.match(prompt, /清空昨天/u);
assert.match(prompt, /每条永久记录不超过60字/u);
assert.match(prompt, /必须在同一状态行填写“观察补记=”/u);
assert.match(prompt, /不得只写勾选结论/u);
assert.match(prompt, /表格尚未填满/u);
assert.match(prompt, /自理/u);
assert.match(prompt, /不能只更新观察补记/u);
assert.match(prompt, /医生书写病历或查体记录的口吻/u);
assert.match(prompt, /唯一受检对象是当前角色卡中的 char/u);
assert.match(prompt, /不得把用户、旁观者、叙述者/u);
assert.match(prompt, /用户触碰后，受检对象出现局部回避反应/u);
assert.match(prompt, /永久记录只写关于 char 的/u);
assert.match(prompt, /客观、克制、严谨、可核验/u);
assert.match(prompt, /不得臆造体温/u);
assert.match(prompt, /禁止使用聊天化、情绪化/u);
assert.match(prompt, /原话不能替代查体结论/u);
assert.match(prompt, /解剖部位、损伤类型/u);
assert.match(prompt, /日期\/阶段 \+ 事件 \+ 已确认结果/u);
assert.match(prompt, /输出前强制核对/u);
assert.match(prompt, /前端能据此勾选/u);
assert.match(prompt, /情况良好/u);
assert.match(prompt, /当前 char/u);
assert.deepEqual(getMatchedChecklistOptions("temperature", "体温平稳，未见明显异常"), ["正常"]);
assert.deepEqual(getMatchedChecklistOptions("tissue", "未见红肿、破损，组织完整"), ["完整"]);
assert.deepEqual(getMatchedChecklistOptions("risk", "当前为低风险，继续观察"), ["低风险"]);
assert.ok(getMissingStatusFields({ temperature: "情况良好" }).includes("体温"));

const incomplete = getMissingStatusFields({ date: "第2天·夜", growth: "幼体", form: "少年拟态", body: "清醒", observationNote: "出现异常" });
assert.ok(incomplete.includes("自理"));
assert.ok(incomplete.includes("边界"));
assert.ok(getMissingStatusFields({ injury: "未复查" }).includes("损伤"));
assert.ok(!incomplete.includes("观察补记"));

const complete = Object.fromEntries(REQUIRED_STATUS_FIELDS.map(([, key]) => [
    key,
    CHECKLIST_FIELDS[key]?.options[0]?.[0] ?? "已建立",
]));
assert.deepEqual(getMissingStatusFields(complete), []);
assert.match(buildStatusPrompt(complete), /表格已填满，可以只更新本轮实际变化的字段/u);
