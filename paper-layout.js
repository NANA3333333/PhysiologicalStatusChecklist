import { resizePaperSurface } from './paper-surface.js';

export function fitCasePaper(sheet,printScale=100) {
    const scale=Math.max(.8,Math.min(1.3,printScale/100));
    sheet.style.setProperty('--u4d-print-scale',String(scale));
    const width=Math.max(0,scale-1)*.32;
    sheet.style.setProperty('--u4d-center-column',`${1.14-width}fr`);
    sheet.style.setProperty('--u4d-right-column',`${1.16+width}fr`);
    if(!sheet.offsetWidth)return 1120;
    const scrollPositions=[...sheet.querySelectorAll('.u4d-scroll-region')].map(n=>[n,n.scrollTop,n.scrollLeft]);
    sheet.style.setProperty('--u4d-base-height','1120px');
    const column=sheet.querySelector('.u4d-report-column-right');
    let extra=column?Math.max(0,column.scrollHeight-column.clientHeight):0;
    for(const [selector,min] of [['.u4d-report-column-left',140],['.u4d-report-column-center',76]]){
        const notes=sheet.querySelector(`${selector} .u4d-report-section:last-child .u4d-lined-scroll`);
        if(notes)extra=Math.max(extra,min-notes.clientHeight);
    }
    const height=1120+(extra>0?Math.ceil(extra)+6:0);
    sheet.style.setProperty('--u4d-base-height',`${height}px`);
    // Measuring at the base size must not reset the reader's position in a note.
    for(const [node,top,left]of scrollPositions){if(node.scrollTop!==top)node.scrollTop=top;if(node.scrollLeft!==left)node.scrollLeft=left;}
    resizePaperSurface(sheet);
    return height;
}
