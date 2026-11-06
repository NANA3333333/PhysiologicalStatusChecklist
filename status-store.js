import { applyStatusUpdate, createInitialStatus, findStatusUpdates } from "./status-parser.js";
import { splitStatusText } from "./status-prompt.js";
import { parseCaseDirectives, validateCaseDesign, designMatchesProfile } from './case-protocol.js';

export const STATUS_DATA_KEY = "u4d_status_fields";

export function isCharacterMessage(message) {
    return Boolean(message && !message.is_user && !message.is_system);
}

function validData(data, body) {
    return data?.version === 1 && data.body === body && Array.isArray(data.blocks) && data.blocks.every(block => typeof block === "string");
}

function detach(text, extra, fallback, contextHash) {
    const { body, blocks } = splitStatusText(text);
    const saved = extra?.[STATUS_DATA_KEY];
    let data = blocks.length ? { version: 1, body, blocks, contextHash }
        : validData(saved, body) ? saved : validData(fallback, body) ? fallback : undefined;
    if (data && !data.contextHash && contextHash) data = { ...data, contextHash };
    const nextExtra = { ...extra };
    if (data) nextExtra[STATUS_DATA_KEY] = data;
    else delete nextExtra[STATUS_DATA_KEY];
    return { body, extra: nextExtra };
}

// Run synchronously before memory/vector MESSAGE_RECEIVED listeners. The host persists extra
// with each message and each swipe; only clean narrative remains in mes and swipes.
export function detachStatusFields(message, contextHash) {
    if (!isCharacterMessage(message)) return false;
    const before = JSON.stringify([message.mes, message.extra, message.swipes, message.swipe_info]);
    const selected = Number.isInteger(message.swipe_id) ? message.swipe_id : 0;
    const current = detach(message.mes, message.extra, message.swipe_info?.[selected]?.extra?.[STATUS_DATA_KEY], contextHash);
    message.mes = current.body;
    message.extra = current.extra;
    if (Array.isArray(message.swipes)) {
        message.swipe_info ??= [];
        message.swipes.forEach((text, index) => {
            const info = message.swipe_info[index] ?? {};
            const result = index === selected ? current : detach(text, info.extra, undefined, contextHash);
            message.swipes[index] = result.body;
            message.swipe_info[index] = { ...info, extra: { ...info.extra, ...result.extra } };
            if (!result.extra[STATUS_DATA_KEY]) delete message.swipe_info[index].extra[STATUS_DATA_KEY];
        });
    }
    return before !== JSON.stringify([message.mes, message.extra, message.swipes, message.swipe_info]);
}

function advanceContext(prefix, message) {
    // A compact, deterministic change detector, not a security identity.
    const source = JSON.stringify([prefix, !!message.is_user, !!message.is_system, message.name, message.original_avatar, splitStatusText(message.mes).body]);
    let first = 2166136261, second = 5381;
    for (const char of source) {
        first = Math.imul(first ^ char.codePointAt(0), 16777619);
        second = Math.imul(second, 33) ^ char.codePointAt(0);
    }
    return `${first >>> 0}:${second >>> 0}`;
}

export function detachChatStatus(messages) {
    let prefix = "root", changed = false;
    for (const message of messages) {
        changed = detachStatusFields(message, prefix) || changed;
        prefix = advanceContext(prefix, message);
    }
    return changed;
}

export function getStatusBlocks(message) {
    if (!isCharacterMessage(message)) return [];
    const split = splitStatusText(message.mes);
    if (split.blocks.length) return split.blocks;
    const data = message.extra?.[STATUS_DATA_KEY];
    return validData(data, split.body) ? data.blocks : [];
}

export function readTimeline(messages, belongsToSubject = () => true, profile) {
    let current = createInitialStatus();
    let prefix = "root";
    const snapshots = [];
    for (const [index, message] of messages.entries()) {
        const sourcePath = prefix;
        prefix = advanceContext(prefix, message);
        if (!isCharacterMessage(message) || !belongsToSubject(message)) continue;
        const boundPath = message.extra?.[STATUS_DATA_KEY]?.contextHash;
        if (boundPath && boundPath !== sourcePath) continue;
        const blocks=getStatusBlocks(message);
        const design={present:false,writer:'',patient:'',style:{},marks:[],warnings:[]};
        for(const block of blocks){
            const part=parseCaseDirectives(block);
            if(part.present){design.present=true;design.writer=part.writer||design.writer;design.patient=part.patient||design.patient;Object.assign(design.style,part.style);}
            design.marks.push(...part.marks);design.warnings.push(...part.warnings);
        }
        if(!designMatchesProfile(design,profile))continue;
        if(design.present&&current.caseDesign&&(design.writer!==current.caseDesign.writer||design.patient!==current.caseDesign.patient))current=createInitialStatus();
        let changed = false;
        for (const block of blocks) {
            for (const update of findStatusUpdates(block)) {
                // Historical record+= stays in the fold, never promoted to memory.
                current = applyStatusUpdate(current, { updates: update.updates, records: [] });
                changed = true;
            }
        }
        if(design.present && blocks.some(block=>block.trimEnd().endsWith(']'))){
            current={...current,caseDesign:validateCaseDesign(design,current)};changed=true;
        }else if(changed&&current.caseDesign){current={...current,caseDesign:undefined};}
        if (changed) snapshots.push({ index, status: current });
    }
    return { current, snapshots };
}
