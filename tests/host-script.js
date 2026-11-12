export const characters = [{ name: "Orion", avatar: "orion.png", data: { name: "Orion", extensions: {} } }];
export const this_chid = 0;
export const extension_prompt_roles = { SYSTEM: 0 };
export const extension_prompt_types = { NONE: -1, IN_PROMPT: 0 };
export const event_types = Object.fromEntries([
    "CHARACTER_MESSAGE_RENDERED", "MESSAGE_RECEIVED", "MESSAGE_UPDATED", "MESSAGE_EDITED", "MESSAGE_SWIPED",
    "MORE_MESSAGES_LOADED", "GENERATION_STARTED", "GENERATION_ENDED", "GENERATION_STOPPED", "CHAT_CHANGED",
    "CHAT_COMPLETION_PROMPT_READY", "GENERATE_AFTER_COMBINE_PROMPTS", "MESSAGE_DELETED",
].map(key => [key, key]));
const handlers = new Map();
export const eventSource = {
    makeFirst(event, fn) { handlers.set(event, [fn, ...(handlers.get(event) ?? [])]); },
    on(event, fn) { handlers.set(event, [...(handlers.get(event) ?? []), fn]); },
    async emit(event, ...args) { for (const fn of handlers.get(event) ?? []) await fn(...args); },
};
export function setExtensionPrompt(key, value) { window.promptWrites.push({ key, value }); window.prompts[key] = value; }
window.promptWrites = [];
window.prompts = {};
window.requests = [];
window.memoryReads = [];
window.characters = characters;
const isPreview = new URLSearchParams(location.search).has("preview");
const storageKey=location.pathname==='/case-demo.html'?'physiology-case-demo-chat':'physiology-test-chat';
const saved = isPreview ? null : JSON.parse(localStorage.getItem(storageKey) || "null");
window.context = {
    characterId: 0, name2: "Orion", chatId: "original", onlineStatus: "connected",
    chat: saved?.chat ?? [
        { name: "Orion", mes: "第一天，他的左前臂有擦伤。\n[STATUS: 日期=第1天·夜 | 形态=人形拟态 | 损伤=左前臂浅表擦伤 | 记录+=旧剧情记忆]" },
        { name: "User", is_user: true, mes: "第二天醒来，你感觉如何？" },
        { name: "Orion", mes: "第二天早晨，他伸出仍然冰冷的手，缓缓坐在窗边。\n[STATUS: 日期=第2天·清晨 | 成长周期=幼体·阶段2 | 形态=人形拟态 | 身体=清醒，肢端冰冷 | 体温=偏低 | 呼吸=平稳 | 循环=稳定 | 能量=不足 | 损伤=左前臂擦伤，无活动性出血 | 疼痛=轻微 | 精神=清醒 | 行动=可站立 | 摄入=少量 | 处置=覆盖薄毯并观察反应 | 观察补记=触碰后左手短暂回缩，未见持续抖动。末梢触觉仍保留。]" },
    ],
    chatMetadata: saved?.metadata ?? {},
    async saveChat() { if (!isPreview) localStorage.setItem(storageKey, JSON.stringify({ chat: window.context.chat, metadata: window.context.chatMetadata })); },
    async generateRaw() { window.requests.push("UNEXPECTED MODEL CALL"); throw new Error("Should not call a second model"); },
};
// Register consumers BEFORE the plugin, matching already-loaded memory and vector extensions.
for (const event of ["MESSAGE_RECEIVED", "CHARACTER_MESSAGE_RENDERED", "CHAT_CHANGED"])
    eventSource.on(event, () => window.memoryReads.push(window.context.chat.filter(m => !m.is_system && m.mes).map(m => m.mes)));
window.SillyTavern = { getContext: () => window.context };
window.emit = (...args) => eventSource.emit(...args);
export function renderChat() {
    // Paginated view: only latest message appears in DOM; table still reads complete history.
    const index = window.context.chat.length - 1;
    const message = window.context.chat[index];
    const element = document.createElement("div"); element.className = "mes";
    element.setAttribute("mesid", index); element.setAttribute("is_user", String(Boolean(message?.is_user)));
    const text = document.createElement("div"); text.className = "mes_text"; text.textContent = message?.mes ?? "";
    element.append(text); document.querySelector("#chat").replaceChildren(element);
}
window.renderChat = renderChat;
