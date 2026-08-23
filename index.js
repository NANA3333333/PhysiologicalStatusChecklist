import { characters, chat_metadata, eventSource, event_types, extension_prompt_roles, extension_prompt_types, saveChatDebounced, setExtensionPrompt, this_chid } from "../../../../script.js";
import { applyStatusUpdate, createInitialStatus, findStatusUpdates, getStoryDayKey, hideStatusMarkup, removeLegacyStatusMarkup } from "./status-parser.js";
import { buildStatusPrompt, STATUS_PROMPT_KEY } from "./status-prompt.js";

const TARGET_EXTENSION = "u4d_status_panel";
const STATUS_METADATA_KEY = "u4d_status_state";
const LAUNCHER_ID = "u4d-status-launcher";
const INSPECTION_ID = "u4d-inspection-root";
const LAUNCHER_POSITION_KEY = "u4d_status_launcher_position";
let chatObserver;
let scanScheduled = false;
let floatingLauncher;
let inspectionRoot;
let inspectionWindow;
let inspectionContent;
let dateInspectionWindow;
let dateInspectionContent;
let latestStatus = createInitialStatus();
let latestDailyHistory = [];
let launcherDrag;
let inspectionDrag;
let dateInspectionDrag;
let inspectionHasCustomPosition = false;
let dateInspectionHasCustomPosition = false;
let suppressLauncherClick = false;
let reportZoom = 0.5;
let dateReportZoom = 0.5;
let pageScrollLock;
let inspectionDragEventsBound = false;
let selectedHistoryDayKey;

function getReportDimensions() {
    const margin = window.innerWidth <= 680 ? 12 : 24;
    const baseWidth = Math.min(840, Math.max(300, window.innerWidth - margin * 2));
    const baseHeight = baseWidth * 4 / 3;
    return {
        baseWidth,
        baseHeight,
        width: baseWidth * reportZoom,
        height: baseHeight * reportZoom,
    };
}

function getDateReportDimensions() {
    const margin = window.innerWidth <= 680 ? 12 : 24;
    const baseWidth = Math.min(840, Math.max(300, window.innerWidth - margin * 2));
    const baseHeight = baseWidth * 4 / 3;
    return {
        baseWidth,
        baseHeight,
        width: baseWidth * dateReportZoom,
        height: baseHeight * dateReportZoom,
    };
}

function updateChatScope() {
    const active = isTargetCharacter();
    updateFloatingUiScope(active);
    updateStatusPrompt();
}

function getActiveCharacterData() {
    const character = characters?.[this_chid];
    if (!character) {
        return null;
    }

    if (character.data) {
        return character.data;
    }

    try {
        return character.json_data ? JSON.parse(character.json_data).data : null;
    } catch {
        return null;
    }
}

function isTargetCharacter() {
    const data = getActiveCharacterData();
    if (!data) {
        return false;
    }

    return data.extensions?.[TARGET_EXTENSION]?.enabled !== false;
}

function clearStatusPrompt() {
    setExtensionPrompt(STATUS_PROMPT_KEY, "", extension_prompt_types.NONE, 0, false, extension_prompt_roles.SYSTEM);
}

function updateStatusPrompt(status = latestStatus) {
    if (!isTargetCharacter()) {
        clearStatusPrompt();
        return;
    }

    setExtensionPrompt(
        STATUS_PROMPT_KEY,
        buildStatusPrompt(status),
        extension_prompt_types.IN_PROMPT,
        0,
        false,
        extension_prompt_roles.SYSTEM,
    );
}

function getCharacterName() {
    const character = characters?.[this_chid];
    return character?.name ?? character?.data?.name ?? "UNKNOWN ENTITY";
}

const DAILY_OBSERVATION_FIELDS = [
    "body", "temperature", "breathing", "circulation", "energy", "injury", "drive", "pain", "tissue", "focus",
    "mental", "cognition", "mobility", "posture", "activity", "stress", "touchTolerance", "senses", "communication",
    "intake", "rest", "care", "hygiene", "secretion", "excretion", "muscleTone", "stability", "selfCare", "boundary",
    "adaptation", "learning", "anomaly", "risk",
];

const DAILY_CHECKIN_GROUPS = [
    ["基础检查", ["body", "temperature", "breathing", "circulation", "energy"]],
    ["损伤复查", ["injury", "pain", "tissue"]],
    ["生理记录", ["intake", "rest", "hygiene", "secretion", "excretion", "muscleTone"]],
    ["行为观察", ["mental", "cognition", "mobility", "stress", "touchTolerance", "boundary"]],
];

function isCheckedValue(value) {
    const text = String(value ?? "").trim();
    return Boolean(text && text !== "未记录" && text !== "未复查");
}

function cloneStatus(status) {
    return {
        ...createInitialStatus(),
        ...(status ?? {}),
        records: [...(status?.records ?? [])],
    };
}

function createDailyCheckin(status) {
    const dayKey = getStoryDayKey(status?.date);
    if (!dayKey) {
        return null;
    }

    const observed = DAILY_OBSERVATION_FIELDS.filter(field => isCheckedValue(status?.[field])).length;
    const checks = Object.fromEntries(DAILY_CHECKIN_GROUPS.map(([label, fields]) => [
        label,
        fields.some(field => isCheckedValue(status?.[field])),
    ]));
    const summary = [status?.body, status?.injury]
        .map(value => String(value ?? "").trim())
        .filter(value => value && value !== "未记录" && value !== "无明显损伤")
        .join("；") || "当日记录已建立";

    return {
        dayKey,
        date: String(status.date ?? "未记录"),
        growth: String(status.growth ?? "未记录"),
        form: String(status.form ?? "未记录"),
        observed,
        total: DAILY_OBSERVATION_FIELDS.length,
        checks,
        summary,
        snapshot: cloneStatus(status),
    };
}

function mergeDailyHistory(...collections) {
    const merged = new Map();
    for (const collection of collections) {
        for (const entry of collection ?? []) {
            if (entry?.dayKey) {
                const previous = merged.get(String(entry.dayKey));
                merged.set(String(entry.dayKey), {
                    ...previous,
                    ...entry,
                    snapshot: entry.snapshot ? cloneStatus(entry.snapshot) : previous?.snapshot ? cloneStatus(previous.snapshot) : undefined,
                });
            }
        }
    }
    return [...merged.values()];
}

function selectHistoryDay(dayKey) {
    const entry = latestDailyHistory.find(item => item.dayKey === dayKey);
    if (!entry?.snapshot) {
        return;
    }

    selectedHistoryDayKey = dayKey;
    renderInspectionContent(entry.snapshot);
    inspectionWindow.hidden = false;
    inspectionWindow.style.zIndex = "2";
    dateInspectionWindow.style.zIndex = "1";
}

function readLauncherPosition() {
    try {
        const saved = JSON.parse(window.localStorage.getItem(LAUNCHER_POSITION_KEY) ?? "null");
        if (Number.isFinite(saved?.left) && Number.isFinite(saved?.top)) {
            return saved;
        }
    } catch {
        // Storage can be unavailable in private or embedded contexts.
    }

    return null;
}

function saveLauncherPosition(left, top) {
    try {
        window.localStorage.setItem(LAUNCHER_POSITION_KEY, JSON.stringify({ left, top }));
    } catch {
        // A session-only position is still useful when storage is unavailable.
    }
}

function clampPosition(left, top, width, height, margin = 10) {
    return {
        left: Math.max(margin, Math.min(left, window.innerWidth - width - margin)),
        top: Math.max(margin, Math.min(top, window.innerHeight - height - margin)),
    };
}

function applySavedLauncherPosition() {
    if (!floatingLauncher) {
        return;
    }

    const rect = floatingLauncher.getBoundingClientRect();
    const saved = readLauncherPosition();
    const defaultLeft = window.innerWidth - rect.width - (window.innerWidth <= 680 ? 12 : 22);
    const defaultTop = window.innerHeight - rect.height - (window.innerWidth <= 680 ? 88 : 112);
    const position = clampPosition(saved?.left ?? defaultLeft, saved?.top ?? defaultTop, rect.width, rect.height);
    floatingLauncher.style.left = `${position.left}px`;
    floatingLauncher.style.top = `${position.top}px`;
    floatingLauncher.style.right = "auto";
    floatingLauncher.style.bottom = "auto";
}

function beginLauncherDrag(event) {
    if (event.button !== 0 || !floatingLauncher) {
        return;
    }

    const rect = floatingLauncher.getBoundingClientRect();
    floatingLauncher.style.left = `${rect.left}px`;
    floatingLauncher.style.top = `${rect.top}px`;
    floatingLauncher.style.right = "auto";
    floatingLauncher.style.bottom = "auto";
    launcherDrag = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startLeft: rect.left,
        startTop: rect.top,
        moved: false,
    };
    floatingLauncher.classList.add("is-dragging");
    floatingLauncher.setPointerCapture(event.pointerId);
}

function moveLauncher(event) {
    if (!launcherDrag || event.pointerId !== launcherDrag.pointerId) {
        return;
    }

    const deltaX = event.clientX - launcherDrag.startX;
    const deltaY = event.clientY - launcherDrag.startY;
    if (Math.hypot(deltaX, deltaY) > 4) {
        launcherDrag.moved = true;
    }

    const rect = floatingLauncher.getBoundingClientRect();
    const position = clampPosition(launcherDrag.startLeft + deltaX, launcherDrag.startTop + deltaY, rect.width, rect.height);
    floatingLauncher.style.left = `${position.left}px`;
    floatingLauncher.style.top = `${position.top}px`;
}

function endLauncherDrag(event) {
    if (!launcherDrag || event.pointerId !== launcherDrag.pointerId) {
        return;
    }

    const completed = launcherDrag;
    launcherDrag = undefined;
    floatingLauncher.classList.remove("is-dragging");
    floatingLauncher.releasePointerCapture?.(event.pointerId);
    if (completed.moved) {
        const rect = floatingLauncher.getBoundingClientRect();
        saveLauncherPosition(rect.left, rect.top);
        suppressLauncherClick = true;
    }
}

function createFloatingLauncher() {
    if (floatingLauncher) {
        return floatingLauncher;
    }

    floatingLauncher = document.createElement("button");
    floatingLauncher.id = LAUNCHER_ID;
    floatingLauncher.type = "button";
    floatingLauncher.className = "u4d-floating-launcher";
    floatingLauncher.setAttribute("aria-label", "打开人形拟态检查表");
    floatingLauncher.title = "打开生理状态检查表";
    floatingLauncher.innerHTML = `
        <span class="u4d-launcher-icon" aria-hidden="true"><i class="fa-solid fa-person"></i></span>`;
    floatingLauncher.addEventListener("pointerdown", beginLauncherDrag);
    floatingLauncher.addEventListener("pointermove", moveLauncher);
    floatingLauncher.addEventListener("pointerup", endLauncherDrag);
    floatingLauncher.addEventListener("pointercancel", endLauncherDrag);
    floatingLauncher.addEventListener("click", () => {
        if (suppressLauncherClick) {
            suppressLauncherClick = false;
            return;
        }

        setInspectionOpen(true);
    });
    document.body.appendChild(floatingLauncher);
    applySavedLauncherPosition();
    return floatingLauncher;
}

function createHumanFigure() {
    const figure = document.createElement("div");
    figure.className = "u4d-human-figure";
    figure.setAttribute("role", "img");
    figure.setAttribute("aria-label", "人形拟态扫描轮廓");
    figure.innerHTML = `
        <div class="u4d-figure-map">
            <img class="u4d-human-figure-image" src="${new URL("./assets/human-outline.png", import.meta.url).href}" alt="人物正面轮廓图">
            <div class="u4d-injury-layer" aria-label="损伤标记"></div>
        </div>
        <span class="u4d-figure-caption u4d-figure-caption-head">正面 / 人形拟态</span>
        <span class="u4d-figure-caption u4d-figure-caption-foot">损伤定位图</span>`;
    return figure;
}

const INJURY_LOCATIONS = [
    { pattern: /(头|颅|面|眼|耳|鼻|口)/u, className: "head", label: "头面部", position: "head" },
    { pattern: /(颈|喉)/u, className: "neck", label: "颈部", position: "neck" },
    { pattern: /(左肩|左臂|左上肢|左手|左前臂|左肘|左腕)/u, className: "left-arm", label: "左上肢", position: "left-arm" },
    { pattern: /(右肩|右臂|右上肢|右手|右前臂|右肘|右腕)/u, className: "right-arm", label: "右上肢", position: "right-arm" },
    { pattern: /(胸|腹|躯干|背)/u, className: "torso", label: "躯干", position: "torso" },
    { pattern: /(左腿|左下肢|左膝|左脚|左大腿|左小腿|左踝)/u, className: "left-leg", label: "左下肢", position: "left-leg" },
    { pattern: /(右腿|右下肢|右膝|右脚|右大腿|右小腿|右踝)/u, className: "right-leg", label: "右下肢", position: "right-leg" },
];

function renderInjuryMarkers(figure, injuryText) {
    const layer = figure.querySelector(".u4d-injury-layer");
    if (!layer) return;
    layer.replaceChildren();
    const text = String(injuryText ?? "").trim();
    const parts = /^(无|未记录|无明显损伤)$/u.test(text)
        ? []
        : text.split(/[；;，,\n]+/u).map(part => part.trim()).filter(Boolean);
    const activeLocations = INJURY_LOCATIONS.map(location => ({ location, parts: parts.filter(part => location.pattern.test(part)) }))
        .filter(item => item.parts.length);

    for (const { location, parts: locationParts } of INJURY_LOCATIONS.map(location => ({
        location,
        parts: activeLocations.find(item => item.location === location)?.parts ?? [],
    }))) {
        const active = locationParts.length > 0;
        if (!active) {
            continue;
        }

        const marker = document.createElement("span");
        marker.className = `u4d-injury-marker ${location.position}${active ? " is-active" : ""}`;
        marker.innerHTML = `<b aria-hidden="true">×</b><small></small>`;
        const compactParts = locationParts.map(part => {
            const detail = part.replace(location.pattern, "").replace(/^[：:,，\s]+/u, "").trim();
            return detail || "见病例记录";
        });
        marker.querySelector("small").textContent = `${location.label} · ${compactParts.join("；")}`;
        layer.appendChild(marker);
    }
}

function makeReportSection(title, subtitle = "") {
    const section = document.createElement("section");
    section.className = "u4d-report-section";
    const heading = document.createElement("div");
    heading.className = "u4d-report-section-heading";
    heading.innerHTML = `<strong></strong><small></small>`;
    heading.querySelector("strong").textContent = title;
    heading.querySelector("small").textContent = subtitle;
    section.appendChild(heading);
    return section;
}

function makeLinedField(label, value, lines = 1) {
    const field = document.createElement("div");
    field.className = "u4d-lined-field";
    const labelElement = document.createElement("strong");
    labelElement.textContent = label;
    field.appendChild(labelElement);
    const text = String(value ?? "").trim();
    const scroll = document.createElement("div");
    scroll.className = "u4d-lined-scroll u4d-scroll-region";
    scroll.style.setProperty("--u4d-lines", String(lines));
    const content = document.createElement("div");
    content.className = "u4d-lined-value";
    content.textContent = text === "未记录" ? "" : text;
    scroll.appendChild(content);
    field.appendChild(scroll);
    return field;
}

function makeCheckbox(label, checked) {
    const option = document.createElement("span");
    option.className = `u4d-checkbox-option${checked ? " is-checked" : ""}`;
    const box = document.createElement("i");
    box.setAttribute("aria-hidden", "true");
    const text = document.createElement("span");
    text.textContent = label;
    option.append(box, text);
    return option;
}

function hasAny(value, patterns) {
    const text = String(value ?? "");
    return patterns.some(pattern => pattern.test(text));
}

function makeChecklistField(label, value, options, { showNote = true } = {}) {
    const field = document.createElement("div");
    field.className = `u4d-checklist-field${showNote ? "" : " is-compact"}`;
    const labelElement = document.createElement("strong");
    labelElement.textContent = label;
    const optionsElement = document.createElement("div");
    optionsElement.className = "u4d-checkbox-options";
    for (const [optionLabel, patterns] of options) {
        optionsElement.appendChild(makeCheckbox(optionLabel, hasAny(value, patterns)));
    }
    const text = String(value ?? "").trim();
    if (showNote) {
        const note = document.createElement("div");
        note.className = "u4d-checklist-note u4d-scroll-region";
        note.textContent = text === "未记录" ? "" : text;
        field.append(labelElement, optionsElement, note);
    } else {
        field.append(labelElement, optionsElement);
    }
    return field;
}

function createArchive(records) {
    const archive = makeReportSection("永久病历归档", "长期记录 · 只追加");
    archive.classList.add("u4d-report-archive");
    const heading = document.createElement("div");
    heading.className = "u4d-archive-count";
    heading.textContent = `${records.length.toString().padStart(2, "0")} 条`;
    archive.querySelector(".u4d-report-section-heading").appendChild(heading);

    if (!records.length) {
        const empty = document.createElement("p");
        empty.className = "u4d-archive-empty";
        empty.textContent = "暂无永久追加记录";
        archive.appendChild(empty);
        return archive;
    }

    const list = document.createElement("ol");
    list.className = "u4d-archive-list u4d-scroll-region";
    for (const [index, record] of records.entries()) {
        const item = document.createElement("li");
        const marker = document.createElement("span");
        marker.className = "u4d-archive-index";
        marker.textContent = `${String(index + 1).padStart(2, "0")}.`;
        const text = document.createElement("span");
        text.textContent = record;
        item.append(marker, text);
        list.appendChild(item);
    }
    archive.appendChild(list);
    return archive;
}

function closeInspectionSheet(sheetType) {
    const target = sheetType === "date" ? dateInspectionWindow : inspectionWindow;
    if (!target) {
        return;
    }

    target.hidden = true;
    if (inspectionWindow?.hidden && dateInspectionWindow?.hidden) {
        setInspectionOpen(false);
    }
}

function makeSheetCloseButton(sheetType) {
    const close = document.createElement("button");
    close.type = "button";
    close.className = "u4d-sheet-close";
    close.setAttribute("aria-label", sheetType === "date" ? "关闭每日检查签到表" : "关闭人形身体检查表");
    close.textContent = "×";
    close.addEventListener("click", () => closeInspectionSheet(sheetType));
    return close;
}

function renderInspectionContent(status) {
    if (!inspectionContent) {
        return;
    }

    const signature = JSON.stringify(status);
    if (inspectionContent.dataset.signature === signature && inspectionContent.querySelector(".u4d-report-stack")) {
        return;
    }

    const sheet = document.createElement("div");
    sheet.className = "u4d-exam-sheet";
    sheet.appendChild(makeSheetCloseButton("record"));

    const sheetHeader = document.createElement("header");
    sheetHeader.className = "u4d-case-header";
    const titleBlock = document.createElement("div");
    titleBlock.className = "u4d-case-title-block";
    titleBlock.innerHTML = `<span class="u4d-exam-kicker">病例记录 / 人形拟态观察表</span><h2>人形身体检查表</h2><p>当前身体状况、行为反应及损伤记录</p>`;
    const dateBlock = document.createElement("div");
    dateBlock.className = "u4d-case-date-block";
    const isHistorical = Boolean(selectedHistoryDayKey && getStoryDayKey(status.date) !== getStoryDayKey(latestStatus.date));
    dateBlock.innerHTML = `<span>报告状态</span><strong>${isHistorical ? "历史记录" : "当前记录"}</strong>`;
    sheetHeader.append(titleBlock, dateBlock);
    sheet.appendChild(sheetHeader);

    const metaTable = document.createElement("div");
    metaTable.className = "u4d-report-meta";
    for (const [label, value] of [["受检对象", getCharacterName()], ["记录日期", status.date], ["成长周期", status.growth], ["当前形态", status.form]]) {
        const cell = document.createElement("div");
        cell.className = "u4d-report-meta-cell";
        cell.innerHTML = `<span></span><strong></strong>`;
        cell.querySelector("span").textContent = label;
        cell.querySelector("strong").textContent = value;
        cell.querySelector("strong").classList.add("u4d-scroll-region");
        metaTable.appendChild(cell);
    }
    sheet.appendChild(metaTable);

    const form = document.createElement("div");
    form.className = "u4d-report-form";

    const leftColumn = document.createElement("div");
    leftColumn.className = "u4d-report-column u4d-report-column-left";
    const basicSection = makeReportSection("基本信息", "一般观察");
    basicSection.append(
        makeLinedField("身体状态", status.body, 2),
        makeChecklistField("体温调节", status.temperature, [["正常", [/正常|(?<!不)稳定/u]], ["偏低", [/低温|偏低|发冷/u]], ["偏高", [/高温|偏高|发热/u]], ["异常", [/失调|无法调节|异常/u]]]),
        makeChecklistField("呼吸状态", status.breathing, [["平稳", [/平稳|正常/u]], ["急促", [/急促|喘|加快/u]], ["浅弱", [/浅|微弱|低弱/u]], ["异常", [/暂停|困难|异常/u]]]),
        makeChecklistField("循环反应", status.circulation, [["稳定", [/(?<!不)稳定|正常/u]], ["偏快", [/偏快|加快|快速/u]], ["偏弱", [/偏弱|减弱/u]], ["异常", [/紊乱|异常/u]]]),
        makeChecklistField("能量储备", status.energy, [["充足", [/充足|良好/u]], ["不足", [/不足|饥饿|缺乏/u]], ["枯竭", [/枯竭|耗尽/u]], ["恢复中", [/恢复|补充/u]]]),
        makeLinedField("当前驱动", status.drive, 2),
        makeLinedField("观察重点", status.focus, 2),
    );
    const responseSection = makeReportSection("边界与处置", "反应 / 处置");
    responseSection.append(
        makeChecklistField("疼痛反应", status.pain, [["无明显", [/无|不明显|正常/u]], ["轻微", [/轻微|轻度/u]], ["明显", [/(?<!无|不)明显|剧烈|强烈/u]], ["刺激性", [/刺激|触碰|敏感/u]]]),
        makeChecklistField("风险评估", status.risk, [["低风险", [/低风险|低/u]], ["需观察", [/观察|留观/u]], ["高风险", [/高风险|危险/u]], ["不可接触", [/不可接触|禁止靠近/u]]]),
        makeLinedField("处置记录", status.care, 2),
    );
    const freeNotesSection = makeReportSection("医嘱 / 备注", "补充记录");
    freeNotesSection.append(makeLinedField("观察补记", "", 14));
    leftColumn.append(basicSection, responseSection, freeNotesSection);

    const centerColumn = document.createElement("div");
    centerColumn.className = "u4d-report-column u4d-report-column-center";
    const diagramPanel = makeReportSection("身体轮廓与损伤定位", "红色 × = 已记录损伤");
    const figure = createHumanFigure();
    renderInjuryMarkers(figure, status.injury);
    diagramPanel.append(figure);
    const diagramNote = document.createElement("p");
    diagramNote.className = "u4d-diagram-note";
    diagramNote.textContent = "图示定位与损伤记录相互核对；未记录损伤时不作标记。";
    diagramPanel.appendChild(diagramNote);

    const injurySection = makeReportSection("损伤记录", "当前伤情");
    injurySection.append(makeLinedField("当前损伤", status.injury, 3));
    const tissueSection = makeReportSection("组织与异常", "外观 / 四维反应");
    tissueSection.append(
        makeChecklistField("皮肤 / 组织", status.tissue, [["完整", [/完整|正常/u]], ["红肿", [/红|肿|炎症/u]], ["裂伤", [/裂|撕裂|破损/u]], ["异常修复", [/修复|再生|回弹/u]]]),
        makeChecklistField("四维异常", status.anomaly, [["无", [/无|未见/u]], ["轻微", [/轻微|局部/u]], ["明显", [/明显|强烈/u]], ["扩散", [/扩散|持续|失控/u]]]),
    );
    const cognitionSection = makeReportSection("认知与学习", "当前处理能力");
    cognitionSection.append(
        makeChecklistField("认知处理", status.cognition, [["清楚", [/清楚|清醒/u]], ["迟缓", [/迟缓|缓慢/u]], ["混乱", [/混乱|错乱/u]], ["非人类逻辑", [/非人类|异质|本能逻辑/u]]]),
        makeChecklistField("学习 / 记忆", status.learning, [["未出现", [/未|没有|无/u]], ["进行中", [/进行中|学习/u]], ["已形成", [/形成|掌握|学会/u]], ["反复", [/反复|不稳定|遗忘/u]]]),
    );
    const notesSection = makeReportSection("主诉 / 自由记录", "横线补记");
    notesSection.append(makeLinedField("补充记录", "", 4));
    centerColumn.append(diagramPanel, injurySection, tissueSection, cognitionSection, notesSection);

    const rightColumn = document.createElement("div");
    rightColumn.className = "u4d-report-column u4d-report-column-right u4d-scroll-region";
    const physicalSection = makeReportSection("专项检查", "勾选项目");
    physicalSection.append(
        makeChecklistField("精神 / 意识", status.mental, [["清醒", [/清醒/u]], ["警觉", [/警觉|警醒/u]], ["惊恐", [/惊恐|恐惧/u]], ["混乱", [/混乱|昏沉/u]]]),
        makeChecklistField("行动能力", status.mobility, [["可站立", [/站立/u]], ["可行走", [/行走|走动/u]], ["可爬行", [/爬行/u]], ["受限", [/无法|受限|不稳/u]]]),
        makeChecklistField("感官状态", status.senses, [["正常", [/正常/u]], ["敏锐", [/敏锐|灵敏/u]], ["迟钝", [/迟钝|减弱/u]], ["异常刺激反应", [/畏光|过敏|异常/u]]]),
        makeChecklistField("沟通 / 表达", status.communication, [["无语言", [/无法|无语言/u]], ["声音", [/呜咽|低鸣|声音/u]], ["短句", [/短句|复述/u]], ["流畅", [/流畅|完整/u]]]),
        makeChecklistField("摄入情况", status.intake, [["正常", [/正常|充足/u]], ["少量", [/少量|不足/u]], ["拒绝", [/拒绝|未进食/u]], ["异常", [/呕吐|异常/u]]]),
        makeChecklistField("休眠情况", status.rest, [["正常", [/正常|稳定/u]], ["浅眠", [/浅眠/u]], ["未休眠", [/未休眠|无法休息/u]], ["易醒", [/易醒|唤醒/u]]]),
    );
    const adaptationSection = makeReportSection("形态与适应", "成长记录");
    adaptationSection.append(
        makeChecklistField("三维稳定度", status.stability, [["稳定", [/(?<!不)稳定/u]], ["不稳定", [/不稳定|回弹/u]], ["局部异常", [/局部|异常/u]]]),
        makeChecklistField("自理能力", status.selfCare, [["可独立", [/独立|自行/u]], ["部分", [/部分|有限/u]], ["无法", [/无法|不能/u]]]),
        makeChecklistField("边界反应", status.boundary, [["可停止", [/停止|接受/u]], ["持续试探", [/试探|反复/u]], ["无法理解", [/无法理解|不理解/u]]]),
        makeChecklistField("社会适应", status.adaptation, [["良好", [/良好|能够遵守/u]], ["部分", [/部分|有限/u]], ["不足", [/不具备|无法|不足/u]]]),
    );
    const behaviorSection = makeReportSection("行为与反应", "追加观察");
    behaviorSection.classList.add("u4d-checklist-grid-section");
    behaviorSection.append(
        makeChecklistField("体位姿态", status.posture, [["站立", [/(?<!无法|不能|不稳)站立/u]], ["坐卧", [/坐|卧|躺/u]], ["蜷缩", [/蜷|蜷缩/u]], ["失衡", [/失衡|倾倒|姿态不稳/u]]]),
        makeChecklistField("活动量", status.activity, [["静止", [/静止|不动/u]], ["偏低", [/低活动|活动少|少动/u]], ["正常", [/活动正常|适中|正常活动/u]], ["过度", [/过度|躁动|活动过强/u]]]),
        makeChecklistField("应激反应", status.stress, [["稳定", [/(?<!不)稳定|平静/u]], ["警戒", [/警戒|警觉/u]], ["逃避", [/逃避|退避|躲避/u]], ["攻击", [/攻击|扑咬|反击/u]]]),
        makeChecklistField("触碰耐受", status.touchTolerance, [["可接触", [/可接触|接受触碰/u]], ["局部回避", [/局部回避|回避触碰|避开/u]], ["强烈回避", [/强烈回避|拒绝触碰|挣扎/u]], ["无反应", [/无反应|没有反应/u]]]),
    );
    const hygieneSection = makeReportSection("卫生与生理", "护理观察");
    hygieneSection.classList.add("u4d-checklist-grid-section");
    hygieneSection.append(
        makeChecklistField("清洁状态", status.hygiene, [["清洁", [/清洁|干净/u]], ["需协助", [/需协助|需要清洁|协助清洁/u]], ["拒绝清洁", [/拒绝清洁|抗拒清洁/u]], ["未处理", [/未处理|未清洁/u]]], { showNote: false }),
        makeChecklistField("分泌情况", status.secretion, [["无", [/无分泌|无明显分泌|干燥/u]], ["少量", [/少量|少量分泌/u]], ["明显", [/明显分泌|较多|渗出/u]], ["异常", [/异常|脓|异味/u]]], { showNote: false }),
        makeChecklistField("排泄情况", status.excretion, [["正常", [/正常排泄|排泄正常/u]], ["减少", [/减少|少量排泄|便少|尿少/u]], ["异常", [/异常|失禁|困难|未排/u]], ["未记录", [/未记录|未观察/u]]]),
        makeChecklistField("肌张力", status.muscleTone, [["正常", [/正常张力|肌张力正常/u]], ["紧张", [/紧张|僵硬|绷紧/u]], ["松弛", [/松弛|无力|低张/u]], ["痉挛", [/痉挛|抽搐|收缩异常/u]]]),
    );
    rightColumn.append(physicalSection, adaptationSection, behaviorSection, hygieneSection);
    form.append(leftColumn, centerColumn, rightColumn);
    sheet.appendChild(form);
    sheet.appendChild(createArchive(status.records));

    const footer = document.createElement("footer");
    footer.className = "u4d-exam-footer";
    footer.innerHTML = `<span>病例档案 / 当前记录</span><span>记录表 01</span>`;
    sheet.appendChild(footer);

    const stack = document.createElement("div");
    stack.className = "u4d-report-stack";
    stack.append(sheet);
    attachInspectionDragHandle(stack);
    stack.addEventListener("wheel", handleReportWheel, { passive: false });
    stack.style.setProperty("--u4d-scale", String(reportZoom));
    inspectionContent.replaceChildren(stack);
    applyReportZoom();
    inspectionContent.dataset.signature = signature;
    removeInspectionHoverMetadata();
}

function renderDateInspectionContent(history) {
    if (!dateInspectionContent) {
        return;
    }

    const normalizedHistory = mergeDailyHistory(history);
    const signature = JSON.stringify(normalizedHistory);
    if (dateInspectionContent.dataset.signature === signature && dateInspectionContent.querySelector(".u4d-date-sheet")) {
        return;
    }

    const sheet = document.createElement("div");
    sheet.className = "u4d-exam-sheet u4d-date-sheet";
    sheet.appendChild(makeSheetCloseButton("date"));

    const header = document.createElement("header");
    header.className = "u4d-case-header";
    const titleBlock = document.createElement("div");
    titleBlock.className = "u4d-case-title-block";
    titleBlock.innerHTML = `<span class="u4d-exam-kicker">观察档案 / DAILY CHECK-IN</span><h2>每日检查签到表</h2><p>按剧情日期归档每日复查完成情况</p>`;
    const countBlock = document.createElement("div");
    countBlock.className = "u4d-case-date-block";
    countBlock.innerHTML = `<span>已签到</span><strong>${String(normalizedHistory.length).padStart(2, "0")} 日</strong>`;
    header.append(titleBlock, countBlock);
    sheet.appendChild(header);

    const latest = normalizedHistory.at(-1);
    const meta = document.createElement("div");
    meta.className = "u4d-date-meta";
    for (const [label, value] of [
        ["受检对象", getCharacterName()],
        ["最近日期", latest?.date ?? "未记录"],
        ["成长周期", latest?.growth ?? "未记录"],
        ["当前形态", latest?.form ?? "未记录"],
    ]) {
        const cell = document.createElement("div");
        cell.innerHTML = `<span></span><strong class="u4d-scroll-region"></strong>`;
        cell.querySelector("span").textContent = label;
        cell.querySelector("strong").textContent = value;
        meta.appendChild(cell);
    }
    sheet.appendChild(meta);

    const ledger = document.createElement("div");
    ledger.className = "u4d-date-ledger u4d-scroll-region";
    const ledgerHeader = document.createElement("div");
    ledgerHeader.className = "u4d-date-ledger-row u4d-date-ledger-header";
    for (const label of ["序", "剧情日期", "成长 / 形态", "每日复查", "完成度", "当日摘要"]) {
        const cell = document.createElement("strong");
        cell.textContent = label;
        ledgerHeader.appendChild(cell);
    }
    ledger.appendChild(ledgerHeader);

    if (normalizedHistory.length) {
        const reversed = [...normalizedHistory].reverse();
        for (const [index, entry] of reversed.entries()) {
            const row = document.createElement("div");
            row.className = "u4d-date-ledger-row";
            row.dataset.dayKey = entry.dayKey;
            row.setAttribute("role", "button");
            row.tabIndex = 0;
            row.addEventListener("pointerdown", () => selectHistoryDay(entry.dayKey), { capture: true });
            row.addEventListener("keydown", event => {
                if (event.key !== "Enter" && event.key !== " ") {
                    return;
                }

                event.preventDefault();
                selectHistoryDay(entry.dayKey);
            });

            const sequence = document.createElement("span");
            sequence.className = "u4d-date-sequence";
            sequence.textContent = String(normalizedHistory.length - index).padStart(2, "0");
            const date = document.createElement("strong");
            date.className = "u4d-date-value";
            date.textContent = entry.date;
            const phase = document.createElement("span");
            phase.className = "u4d-date-phase";
            phase.textContent = `${entry.growth} / ${entry.form}`;
            const checks = document.createElement("div");
            checks.className = "u4d-date-checks";
            for (const [label] of DAILY_CHECKIN_GROUPS) {
                checks.appendChild(makeCheckbox(label.replace(/检查|记录|观察|复查/gu, ""), Boolean(entry.checks?.[label])));
            }
            const completion = document.createElement("span");
            completion.className = "u4d-date-completion";
            completion.textContent = `${Number(entry.observed) || 0} / ${Number(entry.total) || DAILY_OBSERVATION_FIELDS.length}`;
            const summary = document.createElement("span");
            summary.className = "u4d-date-summary";
            summary.textContent = entry.summary || "当日记录已建立";
            row.append(sequence, date, phase, checks, completion, summary);
            ledger.appendChild(row);
        }
    }
    for (let index = normalizedHistory.length; index < 18; index += 1) {
        const row = document.createElement("div");
        row.className = "u4d-date-ledger-row is-empty";
        for (let cellIndex = 0; cellIndex < 6; cellIndex += 1) {
            row.appendChild(document.createElement("span"));
        }
        ledger.appendChild(row);
    }
    sheet.appendChild(ledger);

    const note = document.createElement("section");
    note.className = "u4d-date-note";
    note.innerHTML = `<strong>登记规则</strong><p>同一剧情日合并为一行；跨日建立新行。勾选表示当日至少记录过该组中的一项检查。</p>`;
    sheet.appendChild(note);

    const footer = document.createElement("footer");
    footer.className = "u4d-exam-footer";
    footer.innerHTML = `<span>日期档案 / 随聊天保存</span><span>签到表 01</span>`;
    sheet.appendChild(footer);

    const stack = document.createElement("div");
    stack.className = "u4d-report-stack u4d-date-report-stack";
    stack.appendChild(sheet);
    attachDateInspectionDragHandle(stack);
    stack.addEventListener("wheel", handleDateReportWheel, { passive: false });
    stack.style.setProperty("--u4d-scale", String(dateReportZoom));
    dateInspectionContent.replaceChildren(stack);
    applyDateReportZoom();
    dateInspectionContent.dataset.signature = signature;
    removeInspectionHoverMetadata();
}

function removeInspectionHoverMetadata() {
    inspectionRoot?.querySelectorAll(".u4d-exam-sheet [title], .u4d-exam-sheet [data-tooltip], .u4d-exam-sheet [data-original-title]").forEach(element => {
        element.removeAttribute("title");
        element.removeAttribute("data-tooltip");
        element.removeAttribute("data-original-title");
    });
}

function applyReportZoom() {
    const stack = inspectionContent?.querySelector(".u4d-report-stack");
    if (!stack || !inspectionWindow) {
        return;
    }

    const dimensions = getReportDimensions();
    inspectionWindow.style.width = `${dimensions.width}px`;
    inspectionWindow.style.height = `${dimensions.height}px`;
    inspectionWindow.style.setProperty("--u4d-base-width", `${dimensions.baseWidth}px`);
    inspectionWindow.style.setProperty("--u4d-base-height", `${dimensions.baseHeight}px`);
    stack.style.setProperty("--u4d-scale", String(reportZoom));
}

function applyDateReportZoom() {
    const stack = dateInspectionContent?.querySelector(".u4d-date-report-stack");
    if (!stack || !dateInspectionWindow) {
        return;
    }

    const dimensions = getDateReportDimensions();
    dateInspectionWindow.style.width = `${dimensions.width}px`;
    dateInspectionWindow.style.height = `${dimensions.height}px`;
    dateInspectionWindow.style.setProperty("--u4d-base-width", `${dimensions.baseWidth}px`);
    dateInspectionWindow.style.setProperty("--u4d-base-height", `${dimensions.baseHeight}px`);
    stack.style.setProperty("--u4d-scale", String(dateReportZoom));
}

function changeReportZoom(delta) {
    reportZoom = Math.min(1.35, Math.max(0.25, Math.round((reportZoom + delta) * 100) / 100));
    applyReportZoom();
}

function changeDateReportZoom(delta) {
    dateReportZoom = Math.min(1.35, Math.max(0.25, Math.round((dateReportZoom + delta) * 100) / 100));
    applyDateReportZoom();
}

function scrollOverflowRegion(event) {
    const region = event.target instanceof Element ? event.target.closest(".u4d-scroll-region") : null;
    if (!region || region.scrollHeight <= region.clientHeight + 1) {
        return false;
    }

    event.preventDefault();
    event.stopPropagation();
    region.scrollTop += event.deltaY;
    return true;
}

function handleReportWheel(event) {
    if (Math.abs(event.deltaY) < 1) {
        return;
    }

    if (scrollOverflowRegion(event)) {
        return;
    }

    event.preventDefault();
    changeReportZoom(event.deltaY < 0 ? 0.06 : -0.06);
}

function handleDateReportWheel(event) {
    if (Math.abs(event.deltaY) < 1 || scrollOverflowRegion(event)) {
        return;
    }

    event.preventDefault();
    changeDateReportZoom(event.deltaY < 0 ? 0.06 : -0.06);
}

function attachInspectionDragHandle(handle) {
    handle.dataset.u4dDragSurface = "record";
}

function attachDateInspectionDragHandle(handle) {
    handle.dataset.u4dDragSurface = "date";
}

function bindInspectionDragEvents() {
    if (inspectionDragEventsBound) {
        return;
    }

    inspectionDragEventsBound = true;
    window.addEventListener("pointerdown", routeInspectionPointerDown, { capture: true });
    window.addEventListener("pointermove", moveInspection, { capture: true });
    window.addEventListener("pointermove", moveDateInspection, { capture: true });
    window.addEventListener("pointerup", endInspectionDrag, { capture: true });
    window.addEventListener("pointerup", endDateInspectionDrag, { capture: true });
    window.addEventListener("pointercancel", endInspectionDrag, { capture: true });
    window.addEventListener("pointercancel", endDateInspectionDrag, { capture: true });
    window.addEventListener("click", routeInspectionClick, { capture: true });
}

function routeInspectionClick(event) {
    if (inspectionRoot?.hidden || !(event.target instanceof Element)) {
        return;
    }

    const close = event.target.closest(".u4d-sheet-close");
    if (!close || !inspectionRoot?.contains(close)) {
        return;
    }

    event.preventDefault();
    event.stopPropagation();
    closeInspectionSheet(close.closest(".u4d-date-sheet") ? "date" : "record");
}

function routeInspectionPointerDown(event) {
    if (event.button !== 0 || inspectionRoot?.hidden || !(event.target instanceof Element)) {
        return;
    }

    const close = event.target.closest(".u4d-sheet-close");
    if (close && inspectionRoot.contains(close)) {
        event.preventDefault();
        event.stopPropagation();
        closeInspectionSheet(close.closest(".u4d-date-sheet") ? "date" : "record");
        return;
    }

    const handle = event.target.closest(".u4d-report-stack");
    if (!handle || !inspectionRoot?.contains(handle) || event.target.closest("button")) {
        return;
    }

    if (handle.dataset.u4dDragSurface === "date") {
        const row = event.target.closest(".u4d-date-ledger-row[data-day-key]");
        if (row?.dataset.dayKey) {
            selectHistoryDay(row.dataset.dayKey);
        }
        beginDateInspectionDrag(event, handle, row?.dataset.dayKey);
    } else if (handle.dataset.u4dDragSurface === "record") {
        beginInspectionDrag(event, handle);
    }
}

function beginInspectionDrag(event, handle) {
    if (!inspectionWindow) {
        return;
    }

    event.preventDefault();

    const rect = inspectionWindow.getBoundingClientRect();
    inspectionWindow.style.left = `${rect.left}px`;
    inspectionWindow.style.top = `${rect.top}px`;
    inspectionWindow.style.transform = "none";
    inspectionDrag = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startLeft: rect.left,
        startTop: rect.top,
        handle,
        moved: false,
    };
    inspectionWindow.style.zIndex = "2";
    dateInspectionWindow.style.zIndex = "1";
    inspectionWindow.classList.add("is-dragging");
    handle.classList.add("is-dragging");
    try {
        handle.setPointerCapture(event.pointerId);
    } catch {
        // Window-level capture still keeps dragging functional when pointer capture is unavailable.
    }
}

function moveInspection(event) {
    if (!inspectionDrag || event.pointerId !== inspectionDrag.pointerId) {
        return;
    }

    event.preventDefault();
    if (Math.hypot(event.clientX - inspectionDrag.startX, event.clientY - inspectionDrag.startY) > 4) {
        inspectionDrag.moved = true;
    }
    inspectionWindow.style.left = `${inspectionDrag.startLeft + event.clientX - inspectionDrag.startX}px`;
    inspectionWindow.style.top = `${inspectionDrag.startTop + event.clientY - inspectionDrag.startY}px`;
}

function endInspectionDrag(event) {
    if (!inspectionDrag || event.pointerId !== inspectionDrag.pointerId) {
        return;
    }

    const completed = inspectionDrag;
    inspectionDrag = undefined;
    inspectionHasCustomPosition = true;
    inspectionWindow.classList.remove("is-dragging");
    completed.handle.classList.remove("is-dragging");
    if (completed.handle.hasPointerCapture?.(event.pointerId)) {
        completed.handle.releasePointerCapture(event.pointerId);
    }
}

function beginDateInspectionDrag(event, handle, dayKey) {
    if (!dateInspectionWindow) {
        return;
    }

    event.preventDefault();
    const rect = dateInspectionWindow.getBoundingClientRect();
    dateInspectionWindow.style.left = `${rect.left}px`;
    dateInspectionWindow.style.top = `${rect.top}px`;
    dateInspectionDrag = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startLeft: rect.left,
        startTop: rect.top,
        handle,
        dayKey,
        moved: false,
    };
    inspectionWindow.style.zIndex = "1";
    dateInspectionWindow.style.zIndex = "2";
    dateInspectionWindow.classList.add("is-dragging");
    handle.classList.add("is-dragging");
    try {
        handle.setPointerCapture(event.pointerId);
    } catch {
        // Window-level capture still keeps dragging functional when pointer capture is unavailable.
    }
}

function moveDateInspection(event) {
    if (!dateInspectionDrag || event.pointerId !== dateInspectionDrag.pointerId) {
        return;
    }

    event.preventDefault();
    if (Math.hypot(event.clientX - dateInspectionDrag.startX, event.clientY - dateInspectionDrag.startY) > 4) {
        dateInspectionDrag.moved = true;
    }
    dateInspectionWindow.style.left = `${dateInspectionDrag.startLeft + event.clientX - dateInspectionDrag.startX}px`;
    dateInspectionWindow.style.top = `${dateInspectionDrag.startTop + event.clientY - dateInspectionDrag.startY}px`;
}

function endDateInspectionDrag(event) {
    if (!dateInspectionDrag || event.pointerId !== dateInspectionDrag.pointerId) {
        return;
    }

    const completed = dateInspectionDrag;
    dateInspectionDrag = undefined;
    dateInspectionHasCustomPosition = true;
    dateInspectionWindow.classList.remove("is-dragging");
    completed.handle.classList.remove("is-dragging");
    if (completed.handle.hasPointerCapture?.(event.pointerId)) {
        completed.handle.releasePointerCapture(event.pointerId);
    }
}

function getDefaultInspectionPositions() {
    const record = getReportDimensions();
    const date = getDateReportDimensions();
    const gap = 18;
    const combinedWidth = record.width + gap + date.width;
    const fitsSideBySide = combinedWidth <= window.innerWidth - 24;
    const recordLeft = fitsSideBySide
        ? Math.max(12, (window.innerWidth - combinedWidth) / 2)
        : Math.max(12, (window.innerWidth - record.width) / 2 - 18);
    const dateLeft = fitsSideBySide
        ? recordLeft + record.width + gap
        : Math.max(12, (window.innerWidth - date.width) / 2 + 18);
    return {
        record: {
            left: recordLeft,
            top: Math.max(12, (window.innerHeight - record.height) / 2),
        },
        date: {
            left: dateLeft,
            top: Math.max(12, (window.innerHeight - date.height) / 2 + (fitsSideBySide ? 0 : 24)),
        },
    };
}

function positionInspectionWindow() {
    if (!inspectionWindow) {
        return;
    }

    const position = getDefaultInspectionPositions().record;
    inspectionWindow.style.left = `${Math.round(position.left)}px`;
    inspectionWindow.style.top = `${Math.round(position.top)}px`;
    inspectionWindow.style.transform = "none";
    applyReportZoom();
}

function positionDateInspectionWindow() {
    if (!dateInspectionWindow) {
        return;
    }

    const position = getDefaultInspectionPositions().date;
    dateInspectionWindow.style.left = `${Math.round(position.left)}px`;
    dateInspectionWindow.style.top = `${Math.round(position.top)}px`;
    dateInspectionWindow.style.transform = "none";
    applyDateReportZoom();
}

function createInspectionWindow() {
    if (inspectionRoot) {
        return inspectionRoot;
    }

    inspectionRoot = document.createElement("div");
    inspectionRoot.id = INSPECTION_ID;
    inspectionRoot.className = "u4d-inspection-root";
    inspectionRoot.hidden = true;
    inspectionRoot.setAttribute("aria-hidden", "true");

    inspectionWindow = document.createElement("section");
    inspectionWindow.className = "u4d-inspection-window";
    inspectionWindow.setAttribute("role", "dialog");
    inspectionWindow.setAttribute("aria-modal", "false");
    inspectionWindow.setAttribute("aria-label", "人形身体检查表");

    inspectionContent = document.createElement("div");
    inspectionContent.className = "u4d-inspection-content";
    inspectionWindow.appendChild(inspectionContent);

    dateInspectionWindow = document.createElement("section");
    dateInspectionWindow.className = "u4d-inspection-window u4d-date-inspection-window";
    dateInspectionWindow.setAttribute("role", "dialog");
    dateInspectionWindow.setAttribute("aria-modal", "false");
    dateInspectionWindow.setAttribute("aria-label", "每日检查签到表");
    dateInspectionContent = document.createElement("div");
    dateInspectionContent.className = "u4d-inspection-content u4d-date-inspection-content";
    dateInspectionWindow.appendChild(dateInspectionContent);

    inspectionRoot.append(inspectionWindow, dateInspectionWindow);
    document.body.appendChild(inspectionRoot);
    bindInspectionDragEvents();
    renderInspectionContent(latestStatus);
    renderDateInspectionContent(latestDailyHistory);
    inspectionWindow.hidden = false;
    dateInspectionWindow.hidden = false;
    positionInspectionWindow();
    positionDateInspectionWindow();
    return inspectionRoot;
}

function setInspectionOpen(open) {
    createInspectionWindow();
    if (!isTargetCharacter()) {
        open = false;
    }

    if (!open) {
        inspectionRoot.hidden = true;
        inspectionRoot.setAttribute("aria-hidden", "true");
        floatingLauncher?.classList.remove("is-open");
        unlockPageScroll();
        return;
    }

    selectedHistoryDayKey = undefined;
    renderInspectionContent(latestStatus);
    renderDateInspectionContent(latestDailyHistory);
    inspectionWindow.hidden = false;
    dateInspectionWindow.hidden = false;
    if (!inspectionHasCustomPosition) {
        positionInspectionWindow();
    }
    if (!dateInspectionHasCustomPosition) {
        positionDateInspectionWindow();
    }
    document.body.appendChild(inspectionRoot);
    inspectionRoot.hidden = false;
    inspectionRoot.setAttribute("aria-hidden", "false");
    floatingLauncher?.classList.add("is-open");
    lockPageScroll();
    inspectionWindow.querySelector(".u4d-sheet-close")?.focus({ preventScroll: true });
}

function lockPageScroll() {
    if (pageScrollLock) {
        return;
    }

    pageScrollLock = {
        bodyOverflow: document.body.style.overflow,
        documentOverflow: document.documentElement.style.overflow,
    };
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
}

function unlockPageScroll() {
    if (!pageScrollLock) {
        return;
    }

    document.body.style.overflow = pageScrollLock.bodyOverflow;
    document.documentElement.style.overflow = pageScrollLock.documentOverflow;
    pageScrollLock = undefined;
}

function updateFloatingUiScope(active) {
    createFloatingLauncher();
    createInspectionWindow();
    floatingLauncher.hidden = !active;
    if (!active) {
        setInspectionOpen(false);
    }
}

function updateInspectionStatus(status, dailyHistory = latestDailyHistory) {
    latestStatus = {
        ...createInitialStatus(),
        ...(status ?? {}),
        records: [...(status?.records ?? [])],
    };
    latestDailyHistory = mergeDailyHistory(dailyHistory);
    renderInspectionContent(latestStatus);
    renderDateInspectionContent(latestDailyHistory);
}

function getPersistedSnapshot() {
    const stored = chat_metadata?.[STATUS_METADATA_KEY];
    if (!stored || ![2, 3].includes(stored.version) || !stored.current) {
        return null;
    }

    return {
        sourceSignature: typeof stored.sourceSignature === "string" ? stored.sourceSignature : "",
        state: {
            ...createInitialStatus(),
            ...stored.current,
            records: Array.isArray(stored.records) ? stored.records.filter(Boolean).map(String) : [],
        },
        dailyHistory: mergeDailyHistory(stored.dailyHistory),
    };
}

function getPersistedState() {
    return getPersistedSnapshot()?.state ?? null;
}

function findStatusAnchor(currentLines, previousLines) {
    if (!previousLines.length || !currentLines.length) {
        return null;
    }

    for (let length = Math.min(currentLines.length, previousLines.length); length > 0; length -= 1) {
        const expected = previousLines.slice(-length);
        for (let start = 0; start <= currentLines.length - length; start += 1) {
            if (expected.every((line, index) => currentLines[start + index] === line)) {
                return { start, length };
            }
        }
    }

    return null;
}

function resolveCurrentState(replayed, rawLines) {
    const persisted = getPersistedSnapshot();
    if (!persisted) {
        return replayed;
    }

    if (!rawLines.length) {
        return persisted.state;
    }

    const previousLines = persisted.sourceSignature ? persisted.sourceSignature.split("\n") : [];
    const anchor = findStatusAnchor(rawLines, previousLines);
    if (anchor) {
        let resolved = {
            ...persisted.state,
            records: [...persisted.state.records],
        };
        const newLines = rawLines.slice(anchor.start + anchor.length);
        for (const line of newLines) {
            const update = findStatusUpdates(line)[0];
            if (update) {
                resolved = applyStatusUpdate(resolved, update);
            }
        }
        return resolved;
    }

    const merged = {
        ...replayed,
        records: [...persisted.state.records],
    };
    for (const record of replayed.records) {
        if (!merged.records.includes(record)) {
            merged.records.push(record);
        }
    }
    return merged;
}

function buildTimeline() {
    let current = createInitialStatus();
    const snapshots = new Map();
    const rawLines = [];
    const replayedDailyHistory = new Map();
    let statusCount = 0;
    let lastSnapshotMessage;

    for (const message of document.querySelectorAll("#chat .mes")) {
        if (message.getAttribute("is_user") === "true") {
            continue;
        }

        const textRoot = message.querySelector(".mes_text");
        const updates = textRoot ? findStatusUpdates(textRoot.textContent) : [];
        if (!updates.length) {
            continue;
        }

        for (const update of updates) {
            current = applyStatusUpdate(current, update);
            const checkin = createDailyCheckin(current);
            if (checkin) {
                replayedDailyHistory.set(checkin.dayKey, checkin);
            }
            rawLines.push(update.raw);
            statusCount += 1;
        }

        snapshots.set(message, {
            ...current,
            records: [...current.records],
        });
        lastSnapshotMessage = message;
    }

    const persisted = getPersistedSnapshot();
    if (statusCount) {
        current = resolveCurrentState(current, rawLines);
        if (lastSnapshotMessage) {
            snapshots.set(lastSnapshotMessage, {
                ...current,
                records: [...current.records],
            });
        }
    } else {
        current = persisted?.state ?? current;
    }

    const currentCheckin = createDailyCheckin(current);
    if (currentCheckin) {
        replayedDailyHistory.set(currentCheckin.dayKey, currentCheckin);
    }
    const dailyHistory = mergeDailyHistory(persisted?.dailyHistory, [...replayedDailyHistory.values()]);

    return {
        current,
        dailyHistory,
        snapshots,
        rawSignature: rawLines.join("\n"),
        hasStatuses: statusCount > 0,
    };
}

function persistTimeline(timeline) {
    if (!isTargetCharacter() || !timeline.hasStatuses || !chat_metadata) {
        return;
    }

    const next = {
        version: 3,
        sourceSignature: timeline.rawSignature,
        current: {
            date: timeline.current.date,
            growth: timeline.current.growth,
            form: timeline.current.form,
            body: timeline.current.body,
            temperature: timeline.current.temperature,
            breathing: timeline.current.breathing,
            circulation: timeline.current.circulation,
            energy: timeline.current.energy,
            injury: timeline.current.injury,
            drive: timeline.current.drive,
            pain: timeline.current.pain,
            tissue: timeline.current.tissue,
            focus: timeline.current.focus,
            mental: timeline.current.mental,
            cognition: timeline.current.cognition,
            mobility: timeline.current.mobility,
            posture: timeline.current.posture,
            activity: timeline.current.activity,
            stress: timeline.current.stress,
            touchTolerance: timeline.current.touchTolerance,
            senses: timeline.current.senses,
            communication: timeline.current.communication,
            intake: timeline.current.intake,
            rest: timeline.current.rest,
            care: timeline.current.care,
            hygiene: timeline.current.hygiene,
            secretion: timeline.current.secretion,
            excretion: timeline.current.excretion,
            muscleTone: timeline.current.muscleTone,
            stability: timeline.current.stability,
            selfCare: timeline.current.selfCare,
            boundary: timeline.current.boundary,
            adaptation: timeline.current.adaptation,
            learning: timeline.current.learning,
            anomaly: timeline.current.anomaly,
            risk: timeline.current.risk,
        },
        records: [...timeline.current.records],
        dailyHistory: mergeDailyHistory(timeline.dailyHistory),
    };

    if (JSON.stringify(chat_metadata[STATUS_METADATA_KEY]) === JSON.stringify(next)) {
        return;
    }

    chat_metadata[STATUS_METADATA_KEY] = next;
    saveChatDebounced();
}

function renderMessage(message) {
    if (!(message instanceof HTMLElement)) {
        return;
    }

    const textRoot = message.querySelector(".mes_text");

    if (!textRoot || !isTargetCharacter() || message.getAttribute("is_user") === "true") {
        return;
    }

    removeLegacyStatusMarkup(textRoot);
    hideStatusMarkup(textRoot);
}

function renderAllMessages() {
    if (!isTargetCharacter()) {
        return;
    }

    for (const message of document.querySelectorAll("#chat .mes")) {
        renderMessage(message);
    }
}

function getMessageElement(messageId) {
    const numericId = Number(messageId);
    if (!Number.isInteger(numericId) || numericId < 0) {
        return null;
    }

    return document.querySelector(`#chat .mes[mesid="${numericId}"]`);
}

function renderMessageImmediately(messageId) {
    if (!isTargetCharacter()) {
        return;
    }

    const message = getMessageElement(messageId);
    if (message) {
        renderMessage(message);
        return;
    }

    renderAllMessages();
}

function renderMutatedMessages(records) {
    if (!isTargetCharacter()) {
        return;
    }

    const messages = new Set();
    for (const record of records) {
        const target = record.target instanceof Element ? record.target.closest(".mes") : null;
        if (target) {
            messages.add(target);
        }

        for (const node of record.addedNodes) {
            if (!(node instanceof Element)) {
                continue;
            }

            if (node.matches(".mes")) {
                messages.add(node);
            }
            node.querySelectorAll(".mes").forEach(message => messages.add(message));
            const parent = node.closest(".mes");
            if (parent) {
                messages.add(parent);
            }
        }
    }

    for (const message of messages) {
        renderMessage(message);
    }
}

function handleChatMutation(records) {
    renderMutatedMessages(records);
    scheduleScan();
}

function scanChat() {
    scanScheduled = false;
    updateChatScope();
    if (!isTargetCharacter()) {
        return;
    }

    const timeline = buildTimeline();
    updateInspectionStatus(timeline.current, timeline.dailyHistory);
    updateStatusPrompt(timeline.current);
    for (const message of document.querySelectorAll("#chat .mes")) {
        renderMessage(message);
    }
    persistTimeline(timeline);
}

function refreshStatusPromptFromChat() {
    if (!isTargetCharacter()) {
        clearStatusPrompt();
        return;
    }

    const timeline = buildTimeline();
    updateInspectionStatus(timeline.current, timeline.dailyHistory);
    updateStatusPrompt(timeline.current);
    persistTimeline(timeline);
}

function scheduleScan() {
    if (scanScheduled) {
        return;
    }

    scanScheduled = true;
    queueMicrotask(scanChat);
}

function observeChat() {
    const chat = document.querySelector("#chat");
    if (!chat) {
        window.setTimeout(observeChat, 250);
        return;
    }

    chatObserver?.disconnect();
    chatObserver = new MutationObserver(handleChatMutation);
    chatObserver.observe(chat, { childList: true, characterData: true, subtree: true });
    renderAllMessages();
    scheduleScan();
}

export function init() {
    createFloatingLauncher();
    createInspectionWindow();
    document.addEventListener("keydown", event => {
        if (event.key === "Escape" && inspectionRoot && !inspectionRoot.hidden) {
            setInspectionOpen(false);
        }
    });
    eventSource.makeFirst(event_types.CHARACTER_MESSAGE_RENDERED, renderMessageImmediately);
    eventSource.makeFirst(event_types.MESSAGE_RECEIVED, renderMessageImmediately);
    eventSource.makeFirst(event_types.MESSAGE_UPDATED, renderMessageImmediately);
    eventSource.makeFirst(event_types.MESSAGE_EDITED, renderMessageImmediately);
    eventSource.makeFirst(event_types.MESSAGE_SWIPED, renderMessageImmediately);
    eventSource.makeFirst(event_types.MORE_MESSAGES_LOADED, renderAllMessages);
    eventSource.on(event_types.GENERATION_STARTED, refreshStatusPromptFromChat);
    eventSource.on(event_types.CHAT_CHANGED, () => {
        updateInspectionStatus(createInitialStatus(), []);
        updateChatScope();
        observeChat();
    });

    observeChat();
}
