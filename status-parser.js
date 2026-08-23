const STATUS_PATTERN = /\[STATUS\s*:\s*([^\]\r\n]+)\]/gi;

const FIELD_ALIASES = new Map([
    ["date", "date"],
    ["日期", "date"],
    ["time", "date"],
    ["时间", "date"],
    ["growth", "growth"],
    ["成长", "growth"],
    ["成长周期", "growth"],
    ["phase", "growth"],
    ["阶段", "growth"],
    ["form", "form"],
    ["forms", "form"],
    ["形态", "form"],
    ["body", "body"],
    ["身体", "body"],
    ["身体状态", "body"],
    ["当前状态", "body"],
    ["temperature", "temperature"],
    ["体温", "temperature"],
    ["体温状态", "temperature"],
    ["体温调节", "temperature"],
    ["breathing", "breathing"],
    ["呼吸", "breathing"],
    ["呼吸状态", "breathing"],
    ["circulation", "circulation"],
    ["循环", "circulation"],
    ["循环反应", "circulation"],
    ["心率", "circulation"],
    ["energy", "energy"],
    ["能量", "energy"],
    ["能量储备", "energy"],
    ["代谢", "energy"],
    ["injury", "injury"],
    ["damage", "injury"],
    ["损伤", "injury"],
    ["伤情", "injury"],
    ["损伤记录", "injury"],
    ["drive", "drive"],
    ["驱动", "drive"],
    ["当前驱动", "drive"],
    ["instinct", "drive"],
    ["本能", "drive"],
    ["pain", "pain"],
    ["疼痛", "pain"],
    ["疼痛反应", "pain"],
    ["刺激反应", "pain"],
    ["tissue", "tissue"],
    ["皮肤", "tissue"],
    ["皮肤组织", "tissue"],
    ["组织", "tissue"],
    ["外观", "tissue"],
    ["focus", "focus"],
    ["观察重点", "focus"],
    ["观察目的", "focus"],
    ["主诉", "focus"],
    ["重点", "focus"],
    ["observationnote", "observationNote"],
    ["观察补记", "observationNote"],
    ["观察记录", "observationNote"],
    ["补记", "observationNote"],
    ["mental", "mental"],
    ["精神", "mental"],
    ["精神状态", "mental"],
    ["意识", "mental"],
    ["认知", "mental"],
    ["cognition", "cognition"],
    ["认知处理", "cognition"],
    ["认知状态", "cognition"],
    ["思考", "cognition"],
    ["mobility", "mobility"],
    ["行动", "mobility"],
    ["活动能力", "mobility"],
    ["行动能力", "mobility"],
    ["移动", "mobility"],
    ["posture", "posture"],
    ["体位", "posture"],
    ["体位姿态", "posture"],
    ["activity", "activity"],
    ["活动量", "activity"],
    ["活动程度", "activity"],
    ["stress", "stress"],
    ["应激", "stress"],
    ["应激反应", "stress"],
    ["touch", "touchTolerance"],
    ["触碰耐受", "touchTolerance"],
    ["接触耐受", "touchTolerance"],
    ["senses", "senses"],
    ["感官", "senses"],
    ["感知", "senses"],
    ["感觉", "senses"],
    ["communication", "communication"],
    ["沟通", "communication"],
    ["交流", "communication"],
    ["语言", "communication"],
    ["表达", "communication"],
    ["intake", "intake"],
    ["摄入", "intake"],
    ["进食", "intake"],
    ["饮食", "intake"],
    ["饮水", "intake"],
    ["nutrition", "intake"],
    ["rest", "rest"],
    ["休眠", "rest"],
    ["睡眠", "rest"],
    ["休息", "rest"],
    ["care", "care"],
    ["处置", "care"],
    ["处理", "care"],
    ["护理", "care"],
    ["治疗", "care"],
    ["照护", "care"],
    ["hygiene", "hygiene"],
    ["清洁状态", "hygiene"],
    ["卫生状态", "hygiene"],
    ["secretion", "secretion"],
    ["分泌情况", "secretion"],
    ["分泌物", "secretion"],
    ["excretion", "excretion"],
    ["排泄", "excretion"],
    ["排泄情况", "excretion"],
    ["muscletone", "muscleTone"],
    ["肌张力", "muscleTone"],
    ["肌肉张力", "muscleTone"],
    ["stability", "stability"],
    ["三维稳定", "stability"],
    ["三维稳定度", "stability"],
    ["人形稳定", "stability"],
    ["形态稳定", "stability"],
    ["结构稳定", "stability"],
    ["selfcare", "selfCare"],
    ["自理", "selfCare"],
    ["自理能力", "selfCare"],
    ["boundary", "boundary"],
    ["边界", "boundary"],
    ["边界反应", "boundary"],
    ["拒绝反应", "boundary"],
    ["adaptation", "adaptation"],
    ["适应", "adaptation"],
    ["社会适应", "adaptation"],
    ["人类适应", "adaptation"],
    ["社交适应", "adaptation"],
    ["learning", "learning"],
    ["学习", "learning"],
    ["学习状态", "learning"],
    ["记忆学习", "learning"],
    ["anomaly", "anomaly"],
    ["四维异常", "anomaly"],
    ["维度反应", "anomaly"],
    ["因果干扰", "anomaly"],
    ["risk", "risk"],
    ["风险", "risk"],
    ["风险评估", "risk"],
    ["观察等级", "risk"],
    ["record", "record"],
    ["records", "record"],
    ["记录", "record"],
    ["长期记录", "record"],
    ["log", "record"],
    ["causality", "record"],
    ["因果", "record"],
    ["因果日志", "record"],
    ["因果变动", "record"],
    ["learned", "record"],
    ["已学会", "record"],
    ["学会", "record"],
    ["形态库", "record"],
    ["记忆", "record"],
    ["记忆锚点", "record"],
    ["关键事件", "record"],
    ["关系记录", "record"],
]);

export function createInitialStatus() {
    return {
        date: "未记录",
        growth: "未记录",
        form: "未记录",
        body: "未记录",
        temperature: "",
        breathing: "",
        circulation: "",
        energy: "",
        injury: "未记录",
        drive: "未记录",
        pain: "",
        tissue: "",
        focus: "",
        observationNote: "",
        mental: "",
        cognition: "",
        mobility: "",
        posture: "",
        activity: "",
        stress: "",
        touchTolerance: "",
        senses: "",
        communication: "",
        intake: "",
        rest: "",
        care: "",
        hygiene: "",
        secretion: "",
        excretion: "",
        muscleTone: "",
        stability: "",
        selfCare: "",
        boundary: "",
        adaptation: "",
        learning: "",
        anomaly: "",
        risk: "",
        records: [],
    };
}

const DAILY_CARRY_FIELDS = ["growth", "form"];

function parseChineseInteger(value) {
    const digits = new Map([
        ["零", 0], ["〇", 0], ["一", 1], ["二", 2], ["两", 2], ["三", 3], ["四", 4],
        ["五", 5], ["六", 6], ["七", 7], ["八", 8], ["九", 9],
    ]);
    const units = new Map([["十", 10], ["百", 100], ["千", 1000]]);
    let section = 0;
    let digit = 0;

    for (const character of String(value)) {
        if (digits.has(character)) {
            digit = digits.get(character);
            continue;
        }

        const unit = units.get(character);
        if (!unit) {
            return null;
        }
        section += (digit || 1) * unit;
        digit = 0;
    }

    return section + digit;
}

function normalizeDayNumber(value) {
    const text = String(value).trim();
    if (/^\d+$/u.test(text)) {
        return String(Number(text));
    }

    const parsed = parseChineseInteger(text);
    return parsed === null ? text : String(parsed);
}

export function getStoryDayKey(value) {
    const text = String(value ?? "").trim();
    if (!text || text === "未记录") {
        return null;
    }

    const compact = text.replace(/\s+/gu, "");
    const calendar = compact.match(/(\d{2,4})[年\-/.](\d{1,2})[月\-/.](\d{1,2})日?/u);
    if (calendar) {
        return `calendar:${Number(calendar[1])}-${Number(calendar[2])}-${Number(calendar[3])}`;
    }

    const numberedDay = compact.match(/第([\d零〇一二两三四五六七八九十百千]+)天/u);
    if (numberedDay) {
        return `story:${normalizeDayNumber(numberedDay[1])}`;
    }

    const englishDay = compact.match(/(?:day|d)[-_:：]?([0-9]+)/iu);
    if (englishDay) {
        return `story:${Number(englishDay[1])}`;
    }

    return null;
}

export function isStoryDayChange(previousDate, nextDate) {
    const previousDay = getStoryDayKey(previousDate);
    const nextDay = getStoryDayKey(nextDate);
    return Boolean(previousDay && nextDay && previousDay !== nextDay);
}

function createNextDayStatus(previous) {
    const next = createInitialStatus();
    for (const field of DAILY_CARRY_FIELDS) {
        next[field] = previous?.[field] ?? next[field];
    }
    next.records = [...(previous?.records ?? [])];
    return next;
}

function normalizeKey(key) {
    return String(key)
        .trim()
        .toLowerCase()
        .replace(/[ _-]/g, "");
}

function canonicalField(key) {
    return FIELD_ALIASES.get(normalizeKey(key)) ?? null;
}

function addRecord(records, value) {
    const text = String(value ?? "").trim();
    if (!text || records.includes(text)) {
        return;
    }

    records.push(text);
}

function parseKeyedPayload(payload) {
    const updates = {};
    const records = [];
    let recognized = false;

    for (const part of String(payload).split("|")) {
        const match = part.match(/^\s*([^=:|]+?)\s*(\+)?\s*[=:：]\s*(.*?)\s*$/u);
        if (!match) {
            continue;
        }

        const rawKey = match[1].trim();
        const value = match[3].trim();
        const field = canonicalField(rawKey);
        if (!field || !value) {
            continue;
        }

        recognized = true;
        if (field === "record") {
            const normalized = normalizeKey(rawKey);
            const genericRecord = normalized === "record" || normalized === "records" || normalized === "记录" || normalized === "长期记录" || normalized === "log";
            addRecord(records, genericRecord ? value : `${rawKey}：${value}`);
        } else {
            updates[field] = value;
        }
    }

    if (!recognized) {
        return null;
    }

    return { updates, records };
}

function parseLegacyPayload(payload) {
    const parts = String(payload)
        .split("|")
        .map(part => part.trim());

    if (parts.length < 7) {
        return null;
    }

    const legacyNumbers = [Number(parts[2]), Number(parts[3])];
    if (legacyNumbers.some(value => !Number.isFinite(value))) {
        return null;
    }

    const records = [];
    if (parts[6] && !/^无(?:变动|记录)?$/u.test(parts[6])) {
        records.push(`因果：${parts[6]}`);
    }

    return {
        updates: {
            date: parts[0],
            growth: parts[1],
            drive: parts[4],
            form: parts[5],
        },
        records,
        legacy: true,
    };
}

export function parseStatusPayload(payload) {
    return parseKeyedPayload(payload) ?? parseLegacyPayload(payload);
}

export function findStatusUpdates(text) {
    const updates = [];
    for (const match of String(text).matchAll(STATUS_PATTERN)) {
        const parsed = parseStatusPayload(match[1]);
        if (parsed) {
            updates.push({ ...parsed, raw: match[0] });
        }
    }

    return updates;
}

export function findLatestStatus(text) {
    const updates = findStatusUpdates(text);
    return updates.at(-1) ?? null;
}

export function removeLegacyStatusMarkup(root) {
    if (!(root instanceof HTMLElement)) {
        return;
    }

    root.querySelectorAll([
        "style",
        ".status-panel",
        ".custom-status-panel",
        ".status-row",
        ".custom-status-row",
        ".status-title",
        ".custom-status-title",
        ".status-label",
        ".custom-status-label",
        ".status-val",
        ".custom-status-val",
    ].join(", ")).forEach(element => element.remove());
}

export function applyStatusUpdate(previous, parsed) {
    const previousStatus = {
        ...createInitialStatus(),
        ...(previous ?? {}),
        records: [...(previous?.records ?? [])],
    };
    const nextDate = parsed?.updates?.date;
    const base = nextDate && isStoryDayChange(previousStatus.date, nextDate)
        ? createNextDayStatus(previousStatus)
        : previousStatus;
    const next = {
        ...base,
        ...(parsed?.updates ?? {}),
        records: [...base.records],
    };

    for (const record of parsed?.records ?? []) {
        addRecord(next.records, record);
    }

    return next;
}

export function hideStatusMarkup(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const textNodes = [];
    let current;

    while ((current = walker.nextNode())) {
        if (current.parentElement?.classList.contains("u4d-status-source")) {
            continue;
        }

        if (STATUS_PATTERN.test(current.nodeValue)) {
            textNodes.push(current);
        }
        STATUS_PATTERN.lastIndex = 0;
    }

    for (const node of textNodes) {
        const fragment = document.createDocumentFragment();
        let cursor = 0;
        for (const match of node.nodeValue.matchAll(STATUS_PATTERN)) {
            if (match.index > cursor) {
                fragment.appendChild(document.createTextNode(node.nodeValue.slice(cursor, match.index)));
            }

            const hidden = document.createElement("span");
            hidden.className = "u4d-status-source";
            hidden.textContent = match[0];
            hidden.setAttribute("aria-hidden", "true");
            fragment.appendChild(hidden);
            cursor = match.index + match[0].length;
        }

        if (cursor < node.nodeValue.length) {
            fragment.appendChild(document.createTextNode(node.nodeValue.slice(cursor)));
        }

        const parent = node.parentElement;
        node.replaceWith(fragment);
        if (parent && parent !== root && !parent.textContent.trim() && /^(P|DIV|SECTION|ARTICLE|LI)$/u.test(parent.tagName)) {
            parent.remove();
        }
        STATUS_PATTERN.lastIndex = 0;
    }
}
