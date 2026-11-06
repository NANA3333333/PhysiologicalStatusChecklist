import { getStatusBlocks } from "./status-store.js";
import { findStatusUpdates } from './status-parser.js';
import { parseCaseDirectives, validateCaseDesign } from './case-protocol.js';
import { statusRanges } from './status-envelope.js';

function removeProtocolFromDom(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    let text = "", node;
    while ((node = walker.nextNode())) {
        nodes.push({ node, start: text.length, end: text.length + node.length });
        text += node.nodeValue;
    }
    // Ranges also handle Markdown splitting a STATUS line across spans/strong/code nodes.
    for (const match of statusRanges(text).reverse()) {
        const start = nodes.find(item => item.end > match.start);
        const end = nodes.find(item => item.end >= match.end);
        if (!start || !end) continue;
        const range = document.createRange();
        range.setStart(start.node, match.start - start.start);
        range.setEnd(end.node, match.end - end.start);
        range.deleteContents();
    }
    root.querySelectorAll(".u4d-status-source").forEach(node => node.remove());
}

export function renderStatusFold(messageElement, message) {
    const root = messageElement.querySelector(".mes_text");
    if (!root) return;
    const blocks = getStatusBlocks(message);
    const english=blocks.some(block=>/\b(?:writer|patient|writing|ink|blood|water)\s*=/i.test(block));
    const existing = messageElement.querySelector(".u4d-status-fold");
    removeProtocolFromDom(root);
    if (!blocks.length) { existing?.remove(); return; }
    const signature = JSON.stringify(blocks);
    if (existing?.dataset.signature === signature) return;
    const details = document.createElement("details");
    details.className = "u4d-status-fold";
    details.dataset.signature = signature;
    details.open = existing?.open ?? false;
    const summary = document.createElement("summary");
    summary.textContent = english?'Case fields':"检查字段";
    const note = document.createElement("small");
    note.textContent = english?'For the form only':"仅供表格查看";
    summary.append(note);
    const content = document.createElement("pre");
    content.textContent = blocks.join("\n");
    details.append(summary, content);
    const plan={present:false,writer:'',patient:'',style:{},marks:[],warnings:[]},fields={};
    for(const block of blocks){
        for(const update of findStatusUpdates(block))Object.assign(fields,update.updates);
        const part=parseCaseDirectives(block);
        plan.present ||=part.present;plan.writer=part.writer||plan.writer;plan.patient=part.patient||plan.patient;
        plan.marks.push(...part.marks);plan.warnings.push(...part.warnings);
    }
    if(plan.present){
        summary.firstChild.textContent=english?'Case fields & paper marks':'病例字段与纸面标记';
        const checked=validateCaseDesign(plan,fields);
        if(checked.warnings.length){const feedback=document.createElement('p');feedback.className='u4d-case-validation';feedback.textContent=(english?'Mark validation:\n':'标记校验：\n')+checked.warnings.join('\n');details.append(feedback);}
    }
    if (existing) existing.replaceWith(details);
    else root.after(details);
}
