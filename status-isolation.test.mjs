import assert from "node:assert/strict";
import test from "node:test";
import { buildStatusPrompt, splitStatusText, cleanChatCompletion, cleanTextCompletion } from "./status-prompt.js";
import { detachChatStatus, detachStatusFields, getStatusBlocks, readTimeline, STATUS_DATA_KEY } from "./status-store.js";
import { inkSamples } from "./handwriting.js";

test("completed fields move out of narrative; summary and vector sources stay clean", () => {
    const message = { mes: "他坐了下来。\n[STATUS: 日期=第1天 | 身体=字段专用标记 | 记录+=秘密档案]", extra: { memory: "existing user summary" } };
    assert.equal(detachStatusFields(message), true);
    assert.equal(message.mes, "他坐了下来。");
    assert.equal(message.extra.memory, "existing user summary");
    assert.match(getStatusBlocks(message)[0], /字段专用标记/);
    assert.equal(detachStatusFields(message), false);
    assert.equal(readTimeline([message]).current.body, "字段专用标记");
    assert.deepEqual(readTimeline([message]).current.records, []);
    assert.equal(getStatusBlocks(JSON.parse(JSON.stringify(message))).length, 1);
});

test("each swipe owns its fields; editing the body invalidates stale fields", () => {
    const message = { mes: "冷。\n[STATUS: 体温=偏低]", swipe_id: 0,
        swipes: ["冷。\n[STATUS: 体温=偏低]", "暖。\n[STATUS: 体温=正常]"], extra: {} };
    detachStatusFields(message);
    assert.deepEqual(message.swipes, ["冷。", "暖。"]);
    message.swipe_id = 1; message.mes = message.swipes[1];
    message.extra = structuredClone(message.swipe_info[1].extra);
    detachStatusFields(message);
    assert.equal(readTimeline([message]).current.temperature, "正常");
    message.mes = "全新的回复。";
    detachStatusFields(message);
    assert.deepEqual(getStatusBlocks(message), []);
    assert.equal(message.swipe_info[1].extra[STATUS_DATA_KEY], undefined);
    message.swipe_id = 0; message.mes = message.swipes[0]; message.extra = message.swipe_info[0].extra;
    detachStatusFields(message);
    assert.equal(readTimeline([message]).current.temperature, "偏低");
});

test("multiline, unknown fields and aborted blocks cannot leak into history", () => {
    for (const protocol of ["[STATUS:\n体温=偏低\n| 日期=第2天]", "[STATUS: future_field=秘密]", "[STATUS: 身体=未完成"]) {
        const message = { mes: `正文。\n${protocol}` };
        detachStatusFields(message);
        assert.equal(message.mes, "正文。");
        assert.deepEqual(getStatusBlocks(message), [protocol]);
    }
    const result = splitStatusText("正文。\n```text\n[STATUS: 体温=偏低]\n```");
    assert.equal(result.body, "正文。");
});

test("day reset, deleted branches and other subjects don't pollute the table", () => {
    const messages = [
        { name: "Orion", mes: "第一天。\n[STATUS: 日期=第1天 | 形态=幼体 | 损伤=左臂擦伤]" },
        { name: "Other", mes: "另一个人。\n[STATUS: 日期=第99天 | 身体=他人状态]" },
        { name: "Orion", mes: "第二天。\n[STATUS: 日期=第2天 | 体温=正常]" },
    ];
    messages.forEach(message => detachStatusFields(message));
    const result = readTimeline(messages, message => message.name === "Orion");
    assert.equal(result.current.date, "第2天");
    assert.equal(result.current.form, "幼体");
    assert.equal(result.current.injury, "未记录");
    assert.equal(result.snapshots.length, 2);
    assert.equal(readTimeline(messages.slice(0, 1)).current.date, "第1天");
});

test("outgoing fallback preserves static contract, array identity, narrative and images", () => {
    const contract = buildStatusPrompt();
    const image = { type: "image_url", image_url: { url: "https://example.test/image.png" } };
    const chat = [ { role: "system", content: contract },
        { role: "assistant", content: "正文。\n[STATUS: 身体=私有字段]" },
        { role: "user", content: [{ type: "text", text: "引文\n[STATUS: 未知=私有字段]" }, image] } ];
    const event = { chat };
    cleanChatCompletion(event);
    assert.equal(event.chat, chat);
    assert.equal(chat[0].content, contract);
    assert.equal(chat[1].content, "正文。");
    assert.equal(chat[2].content[0].text, "引文");
    assert.equal(chat[2].content[1], image);
    const plain = { prompt: `${contract}\n正文。\n[STATUS: 身体=私有字段]` };
    cleanTextCompletion(plain);
    assert.equal(plain.prompt, `${contract}\n正文。`);
    assert.doesNotMatch(contract, /当前已知状态快照|当前永久记录|缺失字段列表/);
});

test("user and system messages are never rewritten", () => {
    for (const role of ["is_user", "is_system"]) {
        const message = { [role]: true, mes: "[STATUS: 身体=文本示例]" };
        assert.equal(detachStatusFields(message), false);
        assert.deepEqual(getStatusBlocks(message), []);
    }
});

test("editing an earlier turn invalidates downstream observations until its context is restored", () => {
    const messages = [{ is_user: true, mes: "旧上下文" }, { mes: "回复。\n[STATUS: 日期=第2天 | 体温=偏低]" }];
    detachChatStatus(messages);
    assert.equal(readTimeline(messages).current.temperature, "偏低");
    messages[0].mes = "新上下文";
    detachChatStatus(messages);
    assert.equal(readTimeline(messages).snapshots.length, 0);
    messages[0].mes = "旧上下文";
    assert.equal(readTimeline(messages).current.temperature, "偏低");
});

test("ink stays stable across rerenders and keeps Unicode graphemes intact", () => {
    const text = "体温偏低👩🏽‍⚕️e\u0301";
    const samples = inkSamples(text, "field");
    assert.deepEqual(inkSamples(text, "field"), samples);
    assert.equal(samples.map(sample => sample.char).join(""), text);
    assert.ok(samples.some(sample => sample.char === "👩🏽‍⚕️"));
    assert.ok(samples.every(sample => Math.abs(sample.angle) <= 6 && Math.abs(sample.y) <= 4));
    assert.ok(samples.some(sample => Math.abs(sample.spacing) > 0.1));
    assert.notDeepEqual(inkSamples(text, "other-field"), samples);
});
