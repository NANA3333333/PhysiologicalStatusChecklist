import assert from "node:assert/strict";
import {
    applyStatusUpdate,
    createInitialStatus,
    findLatestStatus,
    findStatusUpdates,
    getStoryDayKey,
    isStoryDayChange,
    parseStatusPayload,
} from "./status-parser.js";

const initial = parseStatusPayload("日期=第1天·夜 | 成长周期=幼体·阶段1 | 形态=14岁少年拟态 | 身体=低体温/饥饿 | 驱动=寻找热源 | 记录+=首次将用户识别为唯一热源");
assert.deepEqual(initial, {
    updates: {
        date: "第1天·夜",
        growth: "幼体·阶段1",
        form: "14岁少年拟态",
        body: "低体温/饥饿",
        drive: "寻找热源",
    },
    records: ["首次将用户识别为唯一热源"],
});

const partial = parseStatusPayload("身体=体温稳定 | 记录+=第一次理解“睡觉”是拒绝");
assert.deepEqual(partial, {
    updates: { body: "体温稳定" },
    records: ["第一次理解“睡觉”是拒绝"],
});

let merged = applyStatusUpdate(createInitialStatus(), initial);
merged = applyStatusUpdate(merged, partial);
assert.equal(merged.date, "第1天·夜");
assert.equal(merged.body, "体温稳定");
assert.equal(merged.drive, "寻找热源");
assert.deepEqual(merged.records, ["首次将用户识别为唯一热源", "第一次理解“睡觉”是拒绝"]);

const injury = parseStatusPayload("损伤=左上肢旧伤裂口，右下肢擦伤 | 当前状态=体温稳定");
assert.deepEqual(injury, {
    updates: {
        injury: "左上肢旧伤裂口，右下肢擦伤",
        body: "体温稳定",
    },
    records: [],
});

const locatedInjury = parseStatusPayload("损伤=左肩：抓伤，活动受限；右膝：擦伤");
assert.equal(locatedInjury.updates.injury, "左肩：抓伤，活动受限；右膝：擦伤");

const clinical = parseStatusPayload("体温=偏低 | 呼吸=急促 | 循环=偏快 | 能量=不足 | 疼痛=触碰敏感 | 组织=拟态组织不稳定 | 认知处理=只能处理热源 | 学习=进行中 | 四维异常=局部回弹 | 风险=需观察");
assert.deepEqual(clinical.updates, {
    temperature: "偏低",
    breathing: "急促",
    circulation: "偏快",
    energy: "不足",
    pain: "触碰敏感",
    tissue: "拟态组织不稳定",
    cognition: "只能处理热源",
    learning: "进行中",
    anomaly: "局部回弹",
    risk: "需观察",
});

const extended = parseStatusPayload("观察重点=确认是否能接受拒绝 | 行动能力=可独立站立 | 感官=听觉灵敏 | 沟通=仅能复述短句 | 摄入=少量饮水 | 休眠=浅眠 | 处置=清洁伤口");
assert.deepEqual(extended.updates, {
    focus: "确认是否能接受拒绝",
    mobility: "可独立站立",
    senses: "听觉灵敏",
    communication: "仅能复述短句",
    intake: "少量饮水",
    rest: "浅眠",
    care: "清洁伤口",
});

const observation = parseStatusPayload("体位=蜷缩 | 活动量=偏低 | 应激=警戒 | 触碰耐受=强烈回避 | 清洁状态=需协助 | 分泌情况=少量 | 排泄情况=正常 | 肌张力=紧张");
assert.deepEqual(observation.updates, {
    posture: "蜷缩",
    activity: "偏低",
    stress: "警戒",
    touchTolerance: "强烈回避",
    hygiene: "需协助",
    secretion: "少量",
    excretion: "正常",
    muscleTone: "紧张",
});

const characterSpecific = parseStatusPayload("三维稳定度=人形拟态稳定 | 自理能力=可独立进食 | 边界反应=会在被拒绝后停下 | 社会适应=能够遵守室内规则");
assert.deepEqual(characterSpecific.updates, {
    stability: "人形拟态稳定",
    selfCare: "可独立进食",
    boundary: "会在被拒绝后停下",
    adaptation: "能够遵守室内规则",
});

const compact = parseStatusPayload("精神=清醒 | 行动=可爬行 | 三维稳定=人形拟态不稳定 | 自理=无法独立完成 | 边界=无法理解拒绝 | 适应=不具备人类社会适应能力");
assert.deepEqual(compact.updates, {
    mental: "清醒",
    mobility: "可爬行",
    stability: "人形拟态不稳定",
    selfCare: "无法独立完成",
    boundary: "无法理解拒绝",
    adaptation: "不具备人类社会适应能力",
});

const typedRecord = parseStatusPayload("因果+=用户的童年记忆中出现了一个陌生的黑影 | 已学会+=理解“睡觉”");
assert.deepEqual(typedRecord.records, [
    "因果：用户的童年记忆中出现了一个陌生的黑影",
    "已学会：理解“睡觉”",
]);

const legacy = parseStatusPayload("第2天 | 亚幼体 | 15 | 30 | 野性本能85% | 16岁消瘦少年 | 无变动");
assert.equal(legacy.legacy, true);
assert.equal(legacy.updates.growth, "亚幼体");
assert.equal(legacy.updates.drive, "野性本能85%");

const latest = findLatestStatus(`
    [STATUS: 日期=第1天 | 成长周期=幼体 | 形态=雏形]
    [STATUS: 身体=体温稳定 | 记录+=第一次理解睡觉]
`);
assert.equal(latest.updates.body, "体温稳定");
assert.deepEqual(findStatusUpdates("[STATUS: 记录+=A] [STATUS: 记录+=B]").map(item => item.records[0]), ["A", "B"]);

assert.equal(getStoryDayKey("第十二天·深夜"), "story:12");
assert.equal(getStoryDayKey("Day 12 / morning"), "story:12");
assert.equal(getStoryDayKey("2026-08-23 23:40"), "calendar:2026-8-23");
assert.equal(isStoryDayChange("第2天·清晨", "第2天·夜"), false);
assert.equal(isStoryDayChange("第2天·夜", "第三天·清晨"), true);

const yesterday = {
    ...createInitialStatus(),
    date: "第2天·夜",
    growth: "幼体·阶段1",
    form: "少年拟态",
    body: "低温",
    injury: "左上肢：咬伤",
    intake: "少量",
    stress: "警戒",
    records: ["首次识别用户"],
};
const sameDay = applyStatusUpdate(yesterday, parseStatusPayload("日期=第2天·深夜 | 摄入=正常"));
assert.equal(sameDay.body, "低温");
assert.equal(sameDay.injury, "左上肢：咬伤");
assert.equal(sameDay.intake, "正常");

const nextDay = applyStatusUpdate(yesterday, parseStatusPayload("日期=第3天·清晨 | 身体=清醒 | 损伤=左上肢：咬伤未愈"));
assert.equal(nextDay.date, "第3天·清晨");
assert.equal(nextDay.growth, "幼体·阶段1");
assert.equal(nextDay.form, "少年拟态");
assert.equal(nextDay.body, "清醒");
assert.equal(nextDay.injury, "左上肢：咬伤未愈");
assert.equal(nextDay.intake, "");
assert.equal(nextDay.stress, "");
assert.deepEqual(nextDay.records, ["首次识别用户"]);

console.log("status parser tests passed");
