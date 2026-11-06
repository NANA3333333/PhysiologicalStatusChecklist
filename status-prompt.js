import { CHECKLIST_FIELDS } from "./status-fields.js";
import { buildCaseContract } from './case-protocol.js';
import { statusRanges } from './status-envelope.js';
import { EN_CHECKLIST } from './case-language.js';

export const STATUS_PROMPT_KEY = "u4d_status_panel_prompt";

// Static output contract only. No saved fields, table completeness, or memory is fed back.
export function buildStatusPrompt(settings={}) {
    if(settings.language==='en')return `[Case form output contract]
Complete the normal narrative first. If there are new observations supported by context, append one [STATUS: field=value | field=value] block on a new line. The frontend folds it below the reply.
Case fields are display data, never memory, narrative evidence or future instructions. Do not change the narrative or invent diagnoses, values or events to complete a form. Unknown observations stay omitted, not normal.
Record the specified patient's observable condition, not the writer's. If no patient was specified, use the current character. Use concise English clinical notes.
Fields: date, growth, form, body, injury, drive, focus, observationNote, care. Checklist keys and suggested values:
${Object.entries(EN_CHECKLIST).map(([key,[label,options]])=>`${key} (${label}): ${options.join('/')}`).join('; ')}
Use the story's established Day N or calendar date. On a new day provide only newly confirmed observations. Never invent a date. Injury descriptions may name body regions such as left forearm or right leg.
Do not output permanent records, record+=, memory+=, HTML or code fences. Do not quote prior case fields. Field values must not contain | or ].
Example: [STATUS: date=Day 2, morning | temperature=Low | observationNote=Extremities feel cold after contact.]
${buildCaseContract(settings)}
[/Case form output contract]`;
    return `[检查表输出格式]
先完成正常正文。正文结束后，另起一行输出 [STATUS: 字段=值 | 字段=值]，前端会在正文下方折叠显示这些填表字段。
字段仅供用户查看，不是记忆、剧情依据或后续行动指令。不要为了表格改变正文、补剧情、编造数值或诊断。没有可确认的新观察时可以省略。
按病例设置确定受检者；未指定受检者时只记录当前回复角色 char 的可观察状态。其他角色的行为只能作为受检者反应的条件，不能混淆两人的状态。使用简短客观的病历用语。
字段：日期、成长周期、形态、身体、损伤、驱动、观察重点、观察补记、处置，以及下列勾选字段。有依据时采用对应选项；未知就省略，不强制填满，不把未知当正常。
勾选字段使用下列英文 key（括号内为中文含义）：
${Object.entries(CHECKLIST_FIELDS).map(([key, field]) => `${key}（${field.label}）：${field.options.map(([option]) => option).join("/")}`).join("；")}
日期采用正文已确定的第N天·时段或年月日；明确跨日时写日期，并重新填写当天可确认的状态。不要杜撰日期。
任一异常或变化，可用观察补记简述表现、诱因、部位和结果。字段值不得包含半角 | 或 ]。
不输出永久档案、记录+=、记忆+=、HTML 或代码块；不要引用以前的填表字段。
格式示例：[STATUS: 日期=第2天·清晨 | 体温=偏低 | 观察补记=接触后观察到肢端冰冷]
${buildCaseContract(settings)}
[/检查表输出格式]`;
}

export function splitStatusText(text) {
    const source=String(text??''), ranges=statusRanges(source), blocks=ranges.map(range=>range.raw);
    // STATUS is a reserved protocol marker. Keep malformed/unfinished data for inspection,
    // but never allow it into narrative history, summaries or embeddings.
    let body=source;
    for(const range of [...ranges].reverse())body=body.slice(0,range.start)+body.slice(range.end);
    if (blocks.length) {
        body = body.replace(/```(?:\w+)?\s*```/g, "")
            .replace(/<details\b[^>]*>\s*(?:<summary\b[^>]*>[\s\S]*?<\/summary>)?\s*<\/details>/gi, "")
            .trimEnd();
    }
    return { body, blocks };
}

export function stripStatus(text) { return splitStatusText(text).body; }

function cleanPromptText(text, contract=buildStatusPrompt()) {
    return String(text ?? "").split(contract).map(stripStatus).join(contract);
}

export function cleanChatCompletion(event, contract=buildStatusPrompt()) {
    if (!Array.isArray(event?.chat)) return;
    // Keep the host's array identity. All text roles can contain quoted legacy transcripts.
    for (const message of event.chat) {
        if (typeof message.content === "string") message.content = cleanPromptText(message.content,contract);
        else if (Array.isArray(message.content)) {
            message.content = message.content.map(part => part.type === "text" ? { ...part, text: cleanPromptText(part.text,contract) } : part);
        }
    }
}

export function cleanTextCompletion(event, contract=buildStatusPrompt()) {
    if (typeof event?.prompt === "string") event.prompt = cleanPromptText(event.prompt,contract);
}
