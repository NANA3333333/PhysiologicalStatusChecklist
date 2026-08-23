const NEGATION_PREFIX = /(?:无|未|未见|没有|不|否认|未出现|未观察到)[^。；]{0,12}$/u;

export const CHECKLIST_FIELDS = Object.freeze({
    temperature: { label: "体温调节", options: [["正常", [/正常|稳定|平稳|未见(?:明显)?异常/u]], ["偏低", [/低温|偏低|发冷/u]], ["偏高", [/高温|偏高|发热/u]], ["异常", [/失调|无法调节|异常/u]]] },
    breathing: { label: "呼吸状态", options: [["平稳", [/平稳|正常/u]], ["急促", [/急促|喘|加快/u]], ["浅弱", [/浅|微弱|低弱/u]], ["异常", [/暂停|困难|异常/u]]] },
    circulation: { label: "循环反应", options: [["稳定", [/(?<!不)稳定|正常/u]], ["偏快", [/偏快|加快|快速/u]], ["偏弱", [/偏弱|减弱/u]], ["异常", [/紊乱|异常/u]]] },
    energy: { label: "能量储备", options: [["充足", [/充足|良好/u]], ["不足", [/不足|饥饿|缺乏/u]], ["枯竭", [/枯竭|耗尽/u]], ["恢复中", [/恢复|补充/u]]] },
    pain: { label: "疼痛反应", options: [["无明显", [/无|不明显|正常|未见(?:明显)?疼痛/u]], ["轻微", [/轻微|轻度/u]], ["明显", [/(?<!无|不|未见)明显|剧烈|强烈/u]], ["刺激性", [/刺激|触碰|敏感/u]]] },
    risk: { label: "风险评估", options: [["低风险", [/低风险|低/u]], ["需观察", [/需观察|留观/u]], ["高风险", [/高风险|危险/u]], ["不可接触", [/不可接触|禁止靠近/u]]] },
    tissue: { label: "皮肤 / 组织", options: [["完整", [/完整|正常|未见(?:明显)?异常|未见红肿|未见破损/u]], ["红肿", [/红|肿|炎症/u]], ["裂伤", [/裂|撕裂|破损/u]], ["异常修复", [/修复|再生|回弹/u]]] },
    anomaly: { label: "四维异常", options: [["无", [/无|未见(?:明显)?异常|未发现/u]], ["轻微", [/轻微|局部/u]], ["明显", [/明显|强烈/u]], ["扩散", [/扩散|持续|失控/u]]] },
    cognition: { label: "认知处理", options: [["清楚", [/清楚|清醒/u]], ["迟缓", [/迟缓|缓慢/u]], ["混乱", [/混乱|错乱/u]], ["非人类逻辑", [/非人类|异质|本能逻辑/u]]] },
    learning: { label: "学习 / 记忆", options: [["未出现", [/未|没有|无/u]], ["进行中", [/进行中|学习/u]], ["已形成", [/形成|掌握|学会/u]], ["反复", [/反复|不稳定|遗忘/u]]] },
    mental: { label: "精神 / 意识", options: [["清醒", [/清醒/u]], ["警觉", [/警觉|警醒/u]], ["惊恐", [/惊恐|恐惧/u]], ["混乱", [/混乱|昏沉/u]]] },
    mobility: { label: "行动能力", options: [["可站立", [/(?<!无法|不能|不稳)站立/u]], ["可行走", [/行走|走动/u]], ["可爬行", [/爬行/u]], ["受限", [/无法|受限|不稳/u]]] },
    senses: { label: "感官状态", options: [["正常", [/正常|未见(?:明显)?异常/u]], ["敏锐", [/敏锐|灵敏/u]], ["迟钝", [/迟钝|减弱/u]], ["异常刺激反应", [/畏光|过敏|异常/u]]] },
    communication: { label: "沟通 / 表达", options: [["无语言", [/无法|无语言/u]], ["声音", [/呜咽|低鸣|声音/u]], ["短句", [/短句|复述/u]], ["流畅", [/流畅|完整/u]]] },
    intake: { label: "摄入情况", options: [["正常", [/正常|充足/u]], ["少量", [/少量|不足/u]], ["拒绝", [/拒绝|未进食/u]], ["异常", [/呕吐|异常/u]]] },
    rest: { label: "休眠情况", options: [["正常", [/正常|稳定|平稳/u]], ["浅眠", [/浅眠/u]], ["未休眠", [/未休眠|无法休息/u]], ["易醒", [/易醒|唤醒/u]]] },
    stability: { label: "三维稳定度", options: [["稳定", [/(?<!不)稳定/u]], ["不稳定", [/不稳定|回弹/u]], ["局部异常", [/局部|异常/u]]] },
    selfCare: { label: "自理能力", options: [["可独立", [/(?<!无法|不能)独立|自行/u]], ["部分", [/部分|有限/u]], ["无法", [/无法|不能/u]]] },
    boundary: { label: "边界反应", options: [["可停止", [/停止|接受/u]], ["持续试探", [/试探|反复/u]], ["无法理解", [/无法理解|不理解/u]]] },
    adaptation: { label: "社会适应", options: [["良好", [/良好|能够遵守/u]], ["部分", [/部分|有限/u]], ["不足", [/不具备|无法|不足/u]]] },
    posture: { label: "体位姿态", options: [["站立", [/(?<!无法|不能|不稳)站立/u]], ["坐卧", [/坐|卧|躺/u]], ["蜷缩", [/蜷|蜷缩/u]], ["失衡", [/失衡|倾倒|姿态不稳/u]]] },
    activity: { label: "活动量", options: [["静止", [/^静止$/u, /静止|不动/u]], ["偏低", [/^偏低$/u, /低活动|活动少|少动/u]], ["正常", [/^正常$/u, /活动正常|适中|正常活动/u]], ["过度", [/^过度$/u, /躁动|活动过强/u]]] },
    stress: { label: "应激反应", options: [["稳定", [/(?<!不)稳定|平静/u]], ["警戒", [/警戒|警觉/u]], ["逃避", [/逃避|退避|躲避/u]], ["攻击", [/攻击|扑咬|反击/u]]] },
    touchTolerance: { label: "触碰耐受", options: [["可接触", [/可接触|接受触碰/u]], ["局部回避", [/局部回避|回避触碰|避开/u]], ["强烈回避", [/强烈回避|拒绝触碰|挣扎/u]], ["无反应", [/无反应|没有反应/u]]] },
    hygiene: { label: "清洁状态", options: [["清洁", [/清洁|干净/u]], ["需协助", [/需协助|需要清洁|协助清洁/u]], ["拒绝清洁", [/拒绝清洁|抗拒清洁/u]], ["未处理", [/未处理|未清洁/u]]] },
    secretion: { label: "分泌情况", options: [["无", [/^无$/u, /无分泌|无明显分泌|未见(?:明显)?分泌|干燥/u]], ["少量", [/^少量$/u, /少量分泌/u]], ["明显", [/^明显$/u, /明显分泌|较多|渗出/u]], ["异常", [/^异常$/u, /脓|异味/u]]] },
    excretion: { label: "排泄情况", options: [["正常", [/^正常$/u, /正常排泄|排泄正常/u]], ["减少", [/减少|少量排泄|便少|尿少/u]], ["异常", [/异常|失禁|困难|未排/u]], ["未记录", [/未记录|未观察/u]]] },
    muscleTone: { label: "肌张力", options: [["正常", [/^正常$/u, /正常张力|肌张力正常/u]], ["紧张", [/紧张|僵硬|绷紧/u]], ["松弛", [/松弛|无力|低张/u]], ["痉挛", [/痉挛|抽搐|收缩异常/u]]] },
});

export const CHECKLIST_FIELD_KEYS = new Set(Object.keys(CHECKLIST_FIELDS));

function hasNegatedMatch(text, index) {
    return NEGATION_PREFIX.test(text.slice(Math.max(0, index - 8), index));
}

export function matchesChecklistOption(value, patterns) {
    const text = String(value ?? "").trim();
    if (!text) {
        return false;
    }

    return patterns.some(pattern => {
        const flags = `${pattern.flags.replace(/[gy]/gu, "")}g`;
        return [...text.matchAll(new RegExp(pattern.source, flags))]
            .some(match => !hasNegatedMatch(text, match.index ?? 0));
    });
}

export function getMatchedChecklistOptions(fieldKey, value) {
    const definition = CHECKLIST_FIELDS[fieldKey];
    if (!definition) {
        return [];
    }

    return definition.options
        .filter(([, patterns]) => matchesChecklistOption(value, patterns))
        .map(([label]) => label);
}

export function getChecklistGuide() {
    return Object.values(CHECKLIST_FIELDS)
        .map(({ label, options }) => `${label}[${options.map(([option]) => option).join("/")}]`)
        .join("；");
}
