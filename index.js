import { characters, eventSource, event_types, extension_prompt_roles, extension_prompt_types, setExtensionPrompt, this_chid } from "../../../../script.js";
import { createInitialStatus, getStoryDayKey } from "./status-parser.js";
import { buildStatusPrompt, cleanChatCompletion, cleanTextCompletion, STATUS_PROMPT_KEY } from "./status-prompt.js";
import { CHECKLIST_FIELDS, matchesChecklistOption } from "./status-fields.js";
import { detachChatStatus, readTimeline } from "./status-store.js";
import { renderStatusFold } from "./status-fold.js";
import { applyHandwriting } from "./handwriting.js";
import { applyPaperSurface } from "./paper-surface.js";
import { caseProfile, fontStack } from './case-protocol.js';
import { getCaseSettings, createCaseSettingsButton } from './case-settings.js';
import { renderCasePresentation } from './case-renderer.js';
import { EN_CHECKLIST, localizePaper, printedText } from './case-language.js';

const TARGET_EXTENSION = "u4d_status_panel";
const LAUNCHER_ID = "u4d-status-launcher";
const INSPECTION_ID = "u4d-inspection-root";
const LAUNCHER_POSITION_KEY = "u4d_status_launcher_position";
const MOBILE_BREAKPOINT = 680;
const BASE_REPORT_WIDTH = 840;
const BASE_REPORT_HEIGHT = 1120;
const REPORT_WINDOW_GAP = 12;
const MIN_REPORT_ZOOM = 0.18;

function getInitialReportZoom() {
    if (typeof window === "undefined" || !isMobileViewport()) {
        return 0.5;
    }

    const mobileFitZoom = window.innerWidth > window.innerHeight
        ? Math.min(
            (window.innerWidth - 36) / (BASE_REPORT_WIDTH * 2 + 18),
            (window.innerHeight - 20) / BASE_REPORT_HEIGHT,
        )
        : Math.min(
            (window.innerWidth - 16) / BASE_REPORT_WIDTH,
            (window.innerHeight - 20 - REPORT_WINDOW_GAP) / (BASE_REPORT_HEIGHT * 2),
        );
    return Math.max(MIN_REPORT_ZOOM, Math.round(mobileFitZoom * 100) / 100);
}

const INITIAL_REPORT_ZOOM = getInitialReportZoom();
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
let reportZoom = INITIAL_REPORT_ZOOM;
let dateReportZoom = INITIAL_REPORT_ZOOM;
let pageScrollLock;
let inspectionDragEventsBound = false;
let selectedHistoryDayKey;
let inspectionPointers = new Map();
let dateInspectionPointers = new Map();
let inspectionPinch;
let dateInspectionPinch;
let viewportMode = getViewportMode();
let mobileSheet = "record";
const inspectionScrolls = new Map();
let recordingStatus = "检查结果仅用于表格，随当前聊天保存";
let initialized = false;
let currentStatusContract = buildStatusPrompt();
let casePresentation;
let reportBaseHeight = BASE_REPORT_HEIGHT;
function activeCaseProfile() {
    const settings=getCaseSettings(SillyTavern.getContext());
    return {...caseProfile(settings,getCharacterName()),explicitPatient:Boolean(settings.patient)};
}

function updateRecordingStatus(text) {
    recordingStatus = text;
    inspectionRoot?.querySelectorAll(".u4d-recording-status").forEach(element => { element.textContent = printedText(text,getCaseSettings(SillyTavern.getContext()).language); });
}

function getViewportMode() {
    if (!isMobileViewport()) {
        return "desktop";
    }

    const {width,height}=getMobileViewport();
    return width > height ? "mobile-landscape" : "mobile-portrait";
}

function getMobileViewport() {
    // Mobile Chrome may expand innerWidth to fit overflowing transformed content.
    // The screen dimensions remain in CSS pixels and keep phone layout from
    // temporarily switching to the desktop layout during orientation changes.
    const touch=navigator.maxTouchPoints>0||window.matchMedia?.('(pointer:coarse)')?.matches;
    const phone=touch&&Math.min(screen.width,screen.height)<=MOBILE_BREAKPOINT;
    return {width:phone?Math.min(innerWidth,screen.width):innerWidth,
        height:phone?Math.min(innerHeight,screen.height):innerHeight};
}

function isMobileViewport() {
    if (typeof window === "undefined") {
        return false;
    }

    const shortEdge = Math.min(window.innerWidth, window.innerHeight);
    const hasTouchInput = navigator.maxTouchPoints > 0 || window.matchMedia?.("(pointer: coarse)")?.matches;
    return window.innerWidth <= MOBILE_BREAKPOINT || (hasTouchInput &&
        (shortEdge <= MOBILE_BREAKPOINT || Math.min(screen.width,screen.height)<=MOBILE_BREAKPOINT));
}

function getReportDimensions() {
    return {
        baseWidth: BASE_REPORT_WIDTH,
        baseHeight: reportBaseHeight,
        width: BASE_REPORT_WIDTH * reportZoom,
        height: reportBaseHeight * reportZoom,
    };
}

function getDateReportDimensions() {
    return {
        baseWidth: BASE_REPORT_WIDTH,
        baseHeight: BASE_REPORT_HEIGHT,
        width: BASE_REPORT_WIDTH * dateReportZoom,
        height: BASE_REPORT_HEIGHT * dateReportZoom,
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

function updateStatusPrompt() {
    const active = isTargetCharacter();
    currentStatusContract=buildStatusPrompt(activeCaseProfile());
    setExtensionPrompt(STATUS_PROMPT_KEY, active ? currentStatusContract : "",
        active ? extension_prompt_types.IN_PROMPT : extension_prompt_types.NONE, 0, false, extension_prompt_roles.SYSTEM);
}

function detachChatFields() {
    if (!isTargetCharacter()) return;
    const context = SillyTavern.getContext();
    const changed = detachChatStatus(context.chat ?? []);
    if (changed) {
        // Save the messages, not just chat metadata: this includes per-swipe extras.
        const save = context.saveChat?.() ?? context.saveChatConditional?.();
        if (save?.catch) save.catch(error => {
            console.warn("[PhysiologicalStatusChecklist] Could not save detached fields", error);
            updateRecordingStatus("保存失败，请检查聊天存储后重试");
        });
    }
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
    if (isMobileViewport()) { showMobilePaper('record'); return; }
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
            <img class="u4d-human-figure-image" src="${new URL("./assets/human-outline-generated-v2.png", import.meta.url).href}" alt="人物正面轮廓图">
            <div class="u4d-injury-layer" aria-label="损伤标记"></div>
        </div>
        <span class="u4d-figure-caption u4d-figure-caption-head">正面 / 人形拟态</span>
        <span class="u4d-figure-caption u4d-figure-caption-foot">损伤定位图</span>`;
    return figure;
}

const INJURY_LOCATIONS = [
    { pattern: /(头|颅|面|眼|耳|鼻|口)|\b(head|face|eye|ear|nose|mouth|skull)\b/iu, className: "head", label: "头面部", position: "head" },
    { pattern: /(颈|喉)|\b(neck|throat)\b/iu, className: "neck", label: "颈部", position: "neck" },
    { pattern: /(左肩|左臂|左上肢|左手|左前臂|左肘|左腕)|\bleft (shoulder|arm|hand|forearm|elbow|wrist)\b/iu, className: "left-arm", label: "左上肢", position: "left-arm" },
    { pattern: /(右肩|右臂|右上肢|右手|右前臂|右肘|右腕)|\bright (shoulder|arm|hand|forearm|elbow|wrist)\b/iu, className: "right-arm", label: "右上肢", position: "right-arm" },
    { pattern: /(胸|腹|躯干|背)|\b(chest|abdomen|torso|back)\b/iu, className: "torso", label: "躯干", position: "torso" },
    { pattern: /(左腿|左下肢|左膝|左脚|左大腿|左小腿|左踝)|\bleft (leg|knee|foot|thigh|calf|ankle)\b/iu, className: "left-leg", label: "左下肢", position: "left-leg" },
    { pattern: /(右腿|右下肢|右膝|右脚|右大腿|右小腿|右踝)|\bright (leg|knee|foot|thigh|calf|ankle)\b/iu, className: "right-leg", label: "右下肢", position: "right-leg" },
];

function renderInjuryMarkers(figure, injuryText) {
    const layer = figure.querySelector(".u4d-injury-layer");
    if (!layer) return;
    layer.replaceChildren();
    const text = String(injuryText ?? "").trim();
    const parts = /^(无|未记录|无明显损伤)$/u.test(text)
        ? []
        : text.split(/[；;，,\n]+/u).map(part => part.trim()).filter(part=>part&&!/^\s*(?:no|without|denies)\b/iu.test(part));
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
        marker.innerHTML = `<b aria-hidden="true"></b><small data-u4d-writing="true"></small>`;
        const compactParts = locationParts.map(part => {
            const detail = part.replace(location.pattern, "").replace(/^[：:,，\s]+/u, "").trim();
            return detail || "见病例记录";
        });
        const en=getCaseSettings(SillyTavern.getContext()).language==='en';
        const label=en?({'head':'Head / face','neck':'Neck','left-arm':'Left arm','right-arm':'Right arm','torso':'Torso','left-leg':'Left leg','right-leg':'Right leg'})[location.position]||location.label:location.label;
        marker.querySelector("small").textContent = en?label:`${label} · ${compactParts.join('；')}`;
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

function makeLinedField(label, value, lines = 1, key = "") {
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
    content.dataset.u4dWriting = "true";
    if(key)content.dataset.u4dField=key;
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
    text.className = "u4d-printed-option";
    text.textContent = label;
    option.append(box, text);
    return option;
}

function hasAny(value, patterns) {
    return matchesChecklistOption(value, patterns);
}

function makeStatusChecklistField(status, fieldKey, options = {}) {
    const definition = CHECKLIST_FIELDS[fieldKey];
    if (!definition) {
        throw new Error(`Unknown checklist field: ${fieldKey}`);
    }

    const english=getCaseSettings(SillyTavern.getContext()).language==='en';
    const field=makeChecklistField(english?EN_CHECKLIST[fieldKey][0]:definition.label, status[fieldKey], english?definition.options.map(([,patterns],i)=>[EN_CHECKLIST[fieldKey][1][i],patterns]):definition.options, options);
    const note=field.querySelector('.u4d-checklist-note');
    if(note)note.dataset.u4dField=fieldKey;
    return field;
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
        note.dataset.u4dWriting = "true";
        note.textContent = text === "未记录" ? "" : text;
        field.append(labelElement, optionsElement, note);
    } else {
        field.append(labelElement, optionsElement);
    }
    return field;
}

function createRecordControls() {
    const section = makeReportSection("检查记录", "随当前聊天保存");
    section.classList.add("u4d-report-archive");
    const status = document.createElement("p");
    status.className = "u4d-archive-empty u4d-recording-status";
    status.setAttribute("role", "status");
    status.textContent = recordingStatus;
    section.append(status);
    return section;
}

function closeInspectionSheet(sheetType) {
    if (isMobileViewport()) { setInspectionOpen(false); return; }
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
    const settingsButton=inspectionRoot?.querySelector('.u4d-case-settings-open');
    const settingsLabel=activeCaseProfile().language==='en'?'Case settings':'病例设置';
    if(settingsButton&&settingsButton.textContent!==settingsLabel)settingsButton.textContent=settingsLabel;

    const signature = JSON.stringify([status,getCaseSettings(SillyTavern.getContext())]);
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
    for (const [label, value, key] of [["受检对象", status.caseDesign?.patient||activeCaseProfile().patient,"patient"], ["记录日期", status.date,"date"], ["成长周期", status.growth,"growth"], ["当前形态", status.form,"form"]]) {
        const cell = document.createElement("div");
        cell.className = "u4d-report-meta-cell";
        cell.innerHTML = `<span></span><strong data-u4d-writing="true"></strong>`;
        cell.querySelector("span").textContent = label;
        cell.querySelector("strong").textContent = value;
        cell.querySelector("strong").dataset.u4dField=key;
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
        makeLinedField("身体状态", status.body, 2, "body"),
        makeStatusChecklistField(status, "temperature"),
        makeStatusChecklistField(status, "breathing"),
        makeStatusChecklistField(status, "circulation"),
        makeStatusChecklistField(status, "energy"),
        makeLinedField("当前驱动", status.drive, 2, "drive"),
        makeLinedField("观察重点", status.focus, 2, "focus"),
    );
    const responseSection = makeReportSection("边界与处置", "反应 / 处置");
    responseSection.append(
        makeStatusChecklistField(status, "pain"),
        makeStatusChecklistField(status, "risk"),
        makeLinedField("处置记录", status.care, 2, "care"),
    );
    const freeNotesSection = makeReportSection("医嘱 / 备注", "补充记录");
    freeNotesSection.append(makeLinedField("观察补记", status.observationNote, 14, "observationNote"));
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
    injurySection.append(makeLinedField("当前损伤", status.injury, 3, "injury"));
    const tissueSection = makeReportSection("组织与异常", "外观 / 四维反应");
    tissueSection.append(
        makeStatusChecklistField(status, "tissue"),
        makeStatusChecklistField(status, "anomaly"),
    );
    const cognitionSection = makeReportSection("认知与学习", "当前处理能力");
    cognitionSection.append(
        makeStatusChecklistField(status, "cognition"),
        makeStatusChecklistField(status, "learning"),
    );
    const notesSection = makeReportSection("主诉 / 自由记录", "横线补记");
    notesSection.append(makeLinedField("补充记录", "", 4));
    centerColumn.append(diagramPanel, injurySection, tissueSection, cognitionSection, notesSection);

    const rightColumn = document.createElement("div");
    rightColumn.className = "u4d-report-column u4d-report-column-right";
    const physicalSection = makeReportSection("专项检查", "勾选项目");
    physicalSection.append(
        makeStatusChecklistField(status, "mental"),
        makeStatusChecklistField(status, "mobility"),
        makeStatusChecklistField(status, "senses"),
        makeStatusChecklistField(status, "communication"),
        makeStatusChecklistField(status, "intake"),
        makeStatusChecklistField(status, "rest"),
    );
    const adaptationSection = makeReportSection("形态与适应", "成长记录");
    adaptationSection.append(
        makeStatusChecklistField(status, "stability"),
        makeStatusChecklistField(status, "selfCare"),
        makeStatusChecklistField(status, "boundary"),
        makeStatusChecklistField(status, "adaptation"),
    );
    const behaviorSection = makeReportSection("行为与反应", "追加观察");
    behaviorSection.classList.add("u4d-checklist-grid-section");
    behaviorSection.append(
        makeStatusChecklistField(status, "posture"),
        makeStatusChecklistField(status, "activity"),
        makeStatusChecklistField(status, "stress"),
        makeStatusChecklistField(status, "touchTolerance"),
    );
    const hygieneSection = makeReportSection("卫生与生理", "护理观察");
    hygieneSection.classList.add("u4d-checklist-grid-section");
    hygieneSection.append(
        makeStatusChecklistField(status, "hygiene", { showNote: false }),
        makeStatusChecklistField(status, "secretion", { showNote: false }),
        makeStatusChecklistField(status, "excretion", { showNote: false }),
        makeStatusChecklistField(status, "muscleTone", { showNote: false }),
    );
    rightColumn.append(physicalSection, adaptationSection, behaviorSection, hygieneSection);
    form.append(leftColumn, centerColumn, rightColumn);
    sheet.appendChild(form);
    sheet.appendChild(createRecordControls());

    const footer = document.createElement("footer");
    footer.className = "u4d-exam-footer";
    footer.innerHTML = `<span class="u4d-case-signature">记录者：<b data-u4d-writing="true" data-u4d-field="writer"></b></span><span class="u4d-case-feedback"></span>`;
    footer.querySelector('b').textContent=status.caseDesign?.writer||activeCaseProfile().writer||(activeCaseProfile().language==='en'?'Unsigned':'未署名');
    sheet.appendChild(footer);
    localizePaper(sheet,getCaseSettings(SillyTavern.getContext()).language);
    applyPaperSurface(sheet);
    applyHandwriting(sheet);

    const stack = document.createElement("div");
    stack.className = "u4d-report-stack";
    stack.append(sheet);
    attachInspectionDragHandle(stack);
    stack.addEventListener("wheel", handleReportWheel, { passive: false });
    stack.style.setProperty("--u4d-scale", String(reportZoom));
    casePresentation?.dispose();
    inspectionContent.replaceChildren(stack);
    casePresentation=renderCasePresentation(sheet,status.caseDesign,getCaseSettings(SillyTavern.getContext()),height=>{
        reportBaseHeight=height;applyReportZoom();
        if (isMobileViewport() && !inspectionRoot.hidden && !inspectionHasCustomPosition) fitMobilePaper("record");
    });
    applyReportZoom();
    inspectionContent.dataset.signature = signature;
    removeInspectionHoverMetadata();
}

function renderDateInspectionContent(history) {
    if (!dateInspectionContent) {
        return;
    }

    const normalizedHistory = mergeDailyHistory(history);
    const signature = JSON.stringify([normalizedHistory,activeCaseProfile().patient,activeCaseProfile().language,activeCaseProfile().font]);
    if (dateInspectionContent.dataset.signature === signature && dateInspectionContent.querySelector(".u4d-date-sheet")) {
        return;
    }

    const sheet = document.createElement("div");
    sheet.className = "u4d-exam-sheet u4d-date-sheet";
    const dateSettings=getCaseSettings(SillyTavern.getContext());
    if(dateSettings.language==='en')sheet.style.setProperty('--u4d-handwriting-font',fontStack(dateSettings.font));
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
        ["受检对象", activeCaseProfile().patient],
        ["最近日期", latest?.date ?? "未记录"],
        ["成长周期", latest?.growth ?? "未记录"],
        ["当前形态", latest?.form ?? "未记录"],
    ]) {
        const cell = document.createElement("div");
        cell.innerHTML = `<span></span><strong class="u4d-scroll-region" data-u4d-writing="true"></strong>`;
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
            row.addEventListener("pointerdown", event => { if (event.pointerType !== "touch") selectHistoryDay(entry.dayKey); }, { capture: true });
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
            date.dataset.u4dWriting = "true";
            date.textContent = entry.date;
            const phase = document.createElement("span");
            phase.className = "u4d-date-phase";
            phase.dataset.u4dWriting = "true";
            phase.textContent = `${entry.growth} / ${entry.form}`;
            const checks = document.createElement("div");
            checks.className = "u4d-date-checks";
            for (const [label] of DAILY_CHECKIN_GROUPS) {
                checks.appendChild(makeCheckbox(label.replace(/检查|记录|观察|复查/gu, ""), Boolean(entry.checks?.[label])));
            }
            const completion = document.createElement("span");
            completion.className = "u4d-date-completion";
            completion.dataset.u4dWriting = "true";
            completion.textContent = `${Number(entry.observed) || 0} / ${Number(entry.total) || DAILY_OBSERVATION_FIELDS.length}`;
            const summary = document.createElement("span");
            summary.className = "u4d-date-summary";
            summary.dataset.u4dWriting = "true";
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
    localizePaper(sheet,getCaseSettings(SillyTavern.getContext()).language);
    applyPaperSurface(sheet);
    applyHandwriting(sheet);

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
    reportZoom = Math.min(1.35, Math.max(MIN_REPORT_ZOOM, Math.round((reportZoom + delta) * 100) / 100));
    applyReportZoom();
}

function changeDateReportZoom(delta) {
    dateReportZoom = Math.min(1.35, Math.max(MIN_REPORT_ZOOM, Math.round((dateReportZoom + delta) * 100) / 100));
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

function getPointerDistance(points) {
    const [first, second] = [...points.values()];
    if (!first || !second) {
        return 0;
    }

    return Math.hypot(second.x - first.x, second.y - first.y);
}

// Scroll text in paper coordinates while keeping two-finger paper gestures available.
function beginPaperScroll(sheetType, event, handle) {
    const region = event.target.closest('.u4d-scroll-region');
    if (event.pointerType !== 'touch' || !region || region.scrollHeight <= region.clientHeight + 1) return false;
    event.preventDefault();
    inspectionScrolls.set(sheetType, {pointerId:event.pointerId, region, startY:event.clientY,
        startX:event.clientX, startTop:region.scrollTop, zoom:sheetType==='date'?dateReportZoom:reportZoom,
        dayKey:event.target.closest('[data-day-key]')?.dataset.dayKey, moved:false});
    try { handle.setPointerCapture(event.pointerId); } catch { /* Window capture remains available. */ }
    return true;
}
function movePaperScroll(sheetType, event) {
    const scroll = inspectionScrolls.get(sheetType);
    if (!scroll || scroll.pointerId !== event.pointerId) return false;
    event.preventDefault();
    scroll.moved ||= Math.hypot(event.clientX-scroll.startX,event.clientY-scroll.startY)>4;
    scroll.region.scrollTop = scroll.startTop-(event.clientY-scroll.startY)/scroll.zoom;
    return true;
}
function endPaperScroll(sheetType, event) {
    const scroll = inspectionScrolls.get(sheetType);
    if (!scroll || scroll.pointerId !== event.pointerId) return false;
    inspectionScrolls.delete(sheetType);
    if (!scroll.moved && scroll.dayKey && event.type==='pointerup') selectHistoryDay(scroll.dayKey);
    return true;
}
function clearInspectionGestures() {
    inspectionScrolls.clear();inspectionPointers.clear();dateInspectionPointers.clear();
    inspectionDrag=dateInspectionDrag=inspectionPinch=dateInspectionPinch=undefined;
    inspectionRoot?.querySelectorAll('.is-dragging').forEach(n=>n.classList.remove('is-dragging'));
}

function beginInspectionPinch(sheetType, handle) {
    const pointers = sheetType === "date" ? dateInspectionPointers : inspectionPointers;
    const distance = getPointerDistance(pointers);
    if (distance < 1) {
        return;
    }

    inspectionScrolls.delete(sheetType);
    const target = sheetType === "date" ? dateInspectionWindow : inspectionWindow;
    const rect = target.getBoundingClientRect();
    const [first, second] = [...pointers.values()];
    const zoom = sheetType === "date" ? dateReportZoom : reportZoom;
    const anchor = { x:((first.x+second.x)/2-rect.left)/zoom, y:((first.y+second.y)/2-rect.top)/zoom };
    target.classList.remove("is-dragging");
    if (sheetType === "date") {
        dateInspectionDrag = undefined;
        dateInspectionPinch = { startDistance: distance, startZoom: dateReportZoom, handle, anchor };
    } else {
        inspectionDrag = undefined;
        inspectionPinch = { startDistance: distance, startZoom: reportZoom, handle, anchor };
    }
    handle.classList.remove("is-dragging");
}

function updateInspectionPinch(sheetType, event) {
    const pointers = sheetType === "date" ? dateInspectionPointers : inspectionPointers;
    const pinch = sheetType === "date" ? dateInspectionPinch : inspectionPinch;
    if (!pinch || !pointers.has(event.pointerId)) {
        return false;
    }

    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const distance = getPointerDistance(pointers);
    if (distance < 1) {
        return true;
    }

    const nextZoom = Math.min(1.35, Math.max(MIN_REPORT_ZOOM, Math.round((pinch.startZoom * distance / pinch.startDistance) * 100) / 100));
    if (sheetType === "date") {
        dateReportZoom = nextZoom;
        applyDateReportZoom();
    } else {
        reportZoom = nextZoom;
        applyReportZoom();
    }
    const [first, second] = [...pointers.values()];
    const target = sheetType === "date" ? dateInspectionWindow : inspectionWindow;
    target.style.left = `${(first.x+second.x)/2-pinch.anchor.x*nextZoom}px`;
    target.style.top = `${(first.y+second.y)/2-pinch.anchor.y*nextZoom}px`;
    if (sheetType === "date") dateInspectionHasCustomPosition=true; else inspectionHasCustomPosition=true;
    updateMobileControls();
    event.preventDefault();
    return true;
}

function trackInspectionPointer(sheetType, event) {
    if (event.pointerType !== "touch") {
        return false;
    }

    const pointers = sheetType === "date" ? dateInspectionPointers : inspectionPointers;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size >= 2) {
        beginInspectionPinch(sheetType, event.target.closest(".u4d-report-stack"));
        event.preventDefault();
        return true;
    }
    return false;
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
    window.addEventListener("resize", handleInspectionViewportResize, { passive: true });
    window.visualViewport?.addEventListener("resize", handleInspectionViewportResize, { passive: true });
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
        if (trackInspectionPointer("date", event)) {
            return;
        }
        if (beginPaperScroll("date", event, handle)) return;
        const row = event.target.closest(".u4d-date-ledger-row[data-day-key]");
        if (row?.dataset.dayKey && event.pointerType !== "touch") {
            selectHistoryDay(row.dataset.dayKey);
        }
        beginDateInspectionDrag(event, handle, row?.dataset.dayKey);
    } else if (handle.dataset.u4dDragSurface === "record") {
        if (trackInspectionPointer("record", event)) {
            return;
        }
        if (!beginPaperScroll("record", event, handle)) beginInspectionDrag(event, handle);
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
    if (event.pointerType === "touch" && inspectionPointers.has(event.pointerId)) {
        inspectionPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    }
    if (updateInspectionPinch("record", event)) {
        return;
    }
    if (movePaperScroll("record", event)) return;
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
    if (inspectionPointers.has(event.pointerId)) {
        inspectionPointers.delete(event.pointerId);
        if (inspectionPinch) {
            if (inspectionPointers.size < 2) {
                inspectionPinch = undefined;
            }
            return;
        }
    }
    if (endPaperScroll("record", event)) return;
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
    if (event.pointerType === "touch" && dateInspectionPointers.has(event.pointerId)) {
        dateInspectionPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    }
    if (updateInspectionPinch("date", event)) {
        return;
    }
    if (movePaperScroll("date", event)) return;
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
    if (dateInspectionPointers.has(event.pointerId)) {
        dateInspectionPointers.delete(event.pointerId);
        if (dateInspectionPinch) {
            if (dateInspectionPointers.size < 2) {
                dateInspectionPinch = undefined;
            }
            return;
        }
    }
    if (endPaperScroll("date", event)) return;
    if (!dateInspectionDrag || event.pointerId !== dateInspectionDrag.pointerId) {
        return;
    }

    const completed = dateInspectionDrag;
    dateInspectionDrag = undefined;
    if (!completed.moved && completed.dayKey && event.pointerType === "touch" && event.type === "pointerup") selectHistoryDay(completed.dayKey);
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

    if (isMobileViewport()) {
        if (getViewportMode() === "mobile-landscape") {
            const gap = 18;
            const combinedWidth = record.width + gap + date.width;
            const left = Math.max(8, (window.innerWidth - combinedWidth) / 2);
            const top = Math.max(10, (window.innerHeight - Math.max(record.height, date.height)) / 2);
            return {
                record: { left, top },
                date: { left: left + record.width + gap, top },
            };
        }

        const left = Math.max(8, (window.innerWidth - record.width) / 2);
        const top = Math.max(10, (window.innerHeight - record.height - date.height - 12) / 2);
        return {
            record: { left, top },
            date: { left: Math.max(8, (window.innerWidth - date.width) / 2), top: top + record.height + 12 },
        };
    }

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

function clampInspectionWindowToViewport(target) {
    if (!target) {
        return;
    }

    const rect = target.getBoundingClientRect();
    const position = clampPosition(rect.left, rect.top, rect.width, rect.height, isMobileViewport() ? 8 : 12);
    target.style.left = `${Math.round(position.left)}px`;
    target.style.top = `${Math.round(position.top)}px`;
}

function updateMobileControls() {
    if (!inspectionRoot) return;
    const mobile=isMobileViewport(), english=getCaseSettings(SillyTavern.getContext()).language==='en';
    inspectionRoot.dataset.mobile=String(mobile);
    if(mobile){const view=getMobileViewport();
        inspectionRoot.style.setProperty('--u4d-mobile-width',`${view.width}px`);
        inspectionRoot.style.setProperty('--u4d-mobile-height',`${view.height}px`);
    }
    const settingsButton=inspectionRoot.querySelector('.u4d-case-settings-open');
    if(settingsButton)settingsButton.textContent=english?(mobile?'Settings':'Case settings'):'病例设置';
    const labels=english?{record:'Case',date:'Check-in',out:'−',fit:'Fit',in:'+',close:'Close'}:
        {record:'病例',date:'签到',out:'−',fit:'适屏',in:'+',close:'关闭'};
    const zoom=mobileSheet==='date'?dateReportZoom:reportZoom;
    for(const button of inspectionRoot.querySelectorAll('[data-mobile-action]')) {
        const action=button.dataset.mobileAction;
        button.textContent=labels[action]+(action==='fit'?` ${Math.round(zoom*100)}%`:'');
        button.setAttribute('aria-label',action==='in'?(english?'Zoom in':'放大'):action==='out'?(english?'Zoom out':'缩小'):labels[action]);
        if(action==='record'||action==='date')button.setAttribute('aria-pressed',String(mobileSheet===action));
    }
}
function fitMobilePaper(type=mobileSheet) {
    if (!inspectionRoot || !isMobileViewport()) return;
    const toolbar=inspectionRoot.querySelector('.u4d-case-toolbar').getBoundingClientRect();
    const height=type==='date'?BASE_REPORT_HEIGHT:reportBaseHeight;
    const view=getMobileViewport(),landscape=view.width>view.height;
    const width=landscape&&toolbar.width?toolbar.left-10:view.width;
    const bottom=landscape?view.height-12:toolbar.height?toolbar.top-10:view.height-124;
    const zoom=Math.max(MIN_REPORT_ZOOM,Math.floor(Math.min(1.35,(width-16)/BASE_REPORT_WIDTH,(bottom-12)/height)*100)/100);
    const target=type==='date'?dateInspectionWindow:inspectionWindow;
    if(type==='date'){dateReportZoom=zoom;dateInspectionHasCustomPosition=false;applyDateReportZoom();}
    else{reportZoom=zoom;inspectionHasCustomPosition=false;applyReportZoom();}
    target.style.left=`${Math.round((width-BASE_REPORT_WIDTH*zoom)/2)}px`;
    target.style.top=`${Math.max(12,Math.round((bottom-height*zoom)/2))}px`;
    updateMobileControls();
}
function showMobilePaper(type) {
    mobileSheet=type;clearInspectionGestures();
    inspectionWindow.hidden=type!=='record';dateInspectionWindow.hidden=type!=='date';
    if (type==='record') casePresentation?.refresh();
    updateMobileControls();fitMobilePaper(type);
}
function createMobileControls(bar) {
    for(const action of ['record','date','out','fit','in','close']) {
        const button=document.createElement('button');button.type='button';
        button.className='u4d-mobile-control';button.dataset.mobileAction=action;
        button.addEventListener('click',()=>{
            if(action==='close'){setInspectionOpen(false);return;}
            if(action==='record'||action==='date'){showMobilePaper(action);return;}
            if(action==='fit'){clearInspectionGestures();fitMobilePaper();return;}
            const target=mobileSheet==='date'?dateInspectionWindow:inspectionWindow;
            const before=target.getBoundingClientRect(),old=mobileSheet==='date'?dateReportZoom:reportZoom;
            if(mobileSheet==='date'){changeDateReportZoom(action==='in'?.12:-.12);dateInspectionHasCustomPosition=true;}
            else{changeReportZoom(action==='in'?.12:-.12);inspectionHasCustomPosition=true;}
            const zoom=mobileSheet==='date'?dateReportZoom:reportZoom;
            const toolbar=bar.getBoundingClientRect(),view=getMobileViewport(),side=view.width>view.height;
            const anchorX=(Math.min(side?toolbar.left-10:view.width,before.right)+Math.max(0,before.left))/2;
            const anchorY=(Math.min(side?view.height-12:toolbar.top-10,before.bottom)+Math.max(12,before.top))/2;
            target.style.left=`${anchorX-(anchorX-before.left)*zoom/old}px`;
            target.style.top=`${anchorY-(anchorY-before.top)*zoom/old}px`;
            updateMobileControls();
        });bar.append(button);
    }
}

function handleInspectionViewportResize() {
    if (document.querySelector('.u4d-case-settings[open]')) return;
    updateMobileControls();
    if (inspectionRoot && isMobileViewport()) {
        viewportMode=getViewportMode();applySavedLauncherPosition();
        if (!inspectionRoot.hidden) showMobilePaper(mobileSheet);
        return;
    }
    if (inspectionRoot && viewportMode!=='desktop') {
        inspectionWindow.hidden=false;dateInspectionWindow.hidden=false;
        inspectionHasCustomPosition=dateInspectionHasCustomPosition=false;
    }
    const nextViewportMode = getViewportMode();
    if (nextViewportMode !== viewportMode && !inspectionHasCustomPosition && !dateInspectionHasCustomPosition) {
        reportZoom = getInitialReportZoom();
        dateReportZoom = reportZoom;
    }
    viewportMode = nextViewportMode;
    applySavedLauncherPosition();
    if (!inspectionRoot) {
        return;
    }

    if (!inspectionHasCustomPosition) {
        positionInspectionWindow();
    } else {
        applyReportZoom();
        clampInspectionWindowToViewport(inspectionWindow);
    }
    if (!dateInspectionHasCustomPosition) {
        positionDateInspectionWindow();
    } else {
        applyDateReportZoom();
        clampInspectionWindowToViewport(dateInspectionWindow);
    }
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

    const toolbar=createCaseSettingsButton(()=>SillyTavern.getContext(),()=>{
        selectedHistoryDayKey=undefined;updateStatusPrompt();scheduleScan();updateMobileControls();
    });
    createMobileControls(toolbar);
    inspectionRoot.append(inspectionWindow, dateInspectionWindow, toolbar);
    updateMobileControls();
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
        clearInspectionGestures();
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
    updateMobileControls();
    if (isMobileViewport()) showMobilePaper("record");
    casePresentation?.refresh();
    floatingLauncher?.classList.add("is-open");
    lockPageScroll();
    (isMobileViewport()?inspectionRoot.querySelector('[data-mobile-action="record"]'):inspectionWindow.querySelector(".u4d-sheet-close"))?.focus({ preventScroll: true });
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
    const selected = latestDailyHistory.find(entry => entry.dayKey === selectedHistoryDayKey);
    if (!selected) selectedHistoryDayKey = undefined;
    renderInspectionContent(selected?.snapshot ?? latestStatus);
    renderDateInspectionContent(latestDailyHistory);
}

function buildTimeline() {
    const character = characters?.[this_chid];
    const timeline = readTimeline(SillyTavern.getContext().chat ?? [], message =>
        message.original_avatar ? message.original_avatar === character?.avatar
            : !message.name || message.name === getCharacterName(), activeCaseProfile());
    const days = new Map();
    for (const { status } of timeline.snapshots) {
        const checkin = createDailyCheckin(status);
        if (checkin) days.set(checkin.dayKey, checkin);
    }
    return { current: timeline.current, dailyHistory: [...days.values()] };
}

function renderMessage(message) {
    if (!(message instanceof HTMLElement)) {
        return;
    }

    const textRoot = message.querySelector(".mes_text");

    if (!textRoot || !isTargetCharacter() || message.getAttribute("is_user") === "true") {
        return;
    }

    const index = Number(message.getAttribute("mesid"));
    const source = SillyTavern.getContext().chat?.[index];
    if (source) renderStatusFold(message, source);
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
    for (const message of document.querySelectorAll("#chat .mes")) {
        renderMessage(message);
    }
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
    if (initialized) return;
    initialized = true;
    detachChatFields();
    updateStatusPrompt();
    createFloatingLauncher();
    createInspectionWindow();
    document.addEventListener("keydown", event => {
        if (event.key === "Escape" && inspectionRoot && !inspectionRoot.hidden) {
            setInspectionOpen(false);
        }
    });
    // Detach before built-in memory and vector listeners see the completed reply.
    for (const event of [event_types.MESSAGE_RECEIVED, event_types.CHARACTER_MESSAGE_RENDERED,
        event_types.MESSAGE_UPDATED, event_types.MESSAGE_EDITED, event_types.MESSAGE_SWIPED,
        event_types.MESSAGE_DELETED, event_types.GENERATION_ENDED, event_types.GENERATION_STOPPED]) {
        if (event) eventSource.makeFirst(event, messageId => {
            detachChatFields();
            renderMessageImmediately(messageId);
            scheduleScan();
        });
    }
    eventSource.makeFirst(event_types.MORE_MESSAGES_LOADED, renderAllMessages);
    eventSource.makeFirst(event_types.GENERATION_STARTED, () => {
        detachChatFields();
        updateStatusPrompt();
    });
    eventSource.on(event_types.CHAT_COMPLETION_PROMPT_READY, event=>cleanChatCompletion(event,currentStatusContract));
    eventSource.on(event_types.GENERATE_AFTER_COMBINE_PROMPTS, event=>cleanTextCompletion(event,currentStatusContract));
    eventSource.makeFirst(event_types.CHAT_CHANGED, () => {
        detachChatFields();
        selectedHistoryDayKey = undefined;
        updateRecordingStatus("检查字段折叠在正文下方，仅供表格查看");
        updateInspectionStatus(createInitialStatus(), []);
        updateChatScope();
        observeChat();
    });
    observeChat();
}
