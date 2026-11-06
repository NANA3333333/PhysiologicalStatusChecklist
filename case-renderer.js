import { applyHandwriting, styleHandwriting, seededRandom, HANDWRITING_SELECTOR } from './handwriting.js';
import { CASE_FONTS, fontStack, findQuote, normalizeCaseSettings } from './case-protocol.js';
import { STAIN_SCENARIOS } from './paper-effects.js';
import { fitCasePaper } from './paper-layout.js';
const NS='http://www.w3.org/2000/svg';
const clamp=(x,min,max)=>Math.max(min,Math.min(max,x));
function svg(tag,attrs,parent){const n=document.createElementNS(NS,tag);for(const [k,v]of Object.entries(attrs))n.setAttribute(k,String(v));parent?.append(n);return n;}
function rangeGlyphs(target,mark){
    const range=findQuote(target.textContent,mark.quote,mark.occurrence);
    return range?[...target.querySelectorAll('.u4d-ink-glyph')].filter(g=>+g.dataset.u4dStart<range.end&&+g.dataset.u4dEnd>range.start):[];
}
function locate(sheet,mark){
    const target=[...sheet.querySelectorAll('[data-u4d-field]')].find(n=>n.dataset.u4dField===mark.field);
    return target?{target,glyphs:rangeGlyphs(target,mark)}:{target:null,glyphs:[]};
}
function inkChanges(sheet,marks){
    const changes=new Map();
    for(const mark of marks.filter(m=>m.kind==='ink'&&!['strike','scribble'].includes(m.type))){
        for(const glyph of locate(sheet,mark).glyphs){
            const state=changes.get(glyph)||{scale:1,angle:0,blur:0};
            if(mark.type==='font')state.font=fontStack(mark.font);
            if(mark.type==='enlarge')state.scale=clamp(state.scale*mark.scale,1,1.8);
            if(mark.type==='tilt')state.angle=clamp(state.angle+mark.angle,-35,35);
            if(mark.type==='blur')state.blur=clamp(state.blur+mark.amount*1.8,0,2.5);
            changes.set(glyph,state);
        }
    }
    for(const [glyph,state]of changes){
        if(state.font)glyph.style.setProperty('font-family',state.font,'important');
        if(state.scale!==1)glyph.style.setProperty('font-size',`${state.scale}em`,'important');
        if(state.angle)glyph.style.setProperty('transform',`${glyph.style.transform} rotate(${state.angle}deg)`,'important');
        if(state.blur)glyph.style.filter=`${glyph.style.filter==='none'?'':glyph.style.filter} blur(${state.blur}px)`;
        glyph.dataset.caseInk='true';
    }
}
function rectInSheet(node,sheetBox,scale){const r=node.getBoundingClientRect();return {x:(r.x-sheetBox.x)/scale,y:(r.y-sheetBox.y)/scale,w:r.width/scale,h:r.height/scale};}
// Keep decoded image nodes and the filtered surface alive across layout updates.
// Reassigning even an unchanged feImage/image attribute can invalidate its paint.
function reconcileSvg(current,next){
    for(const attr of [...current.attributes])if(!next.hasAttribute(attr.name))current.removeAttribute(attr.name);
    for(const attr of next.attributes)if(current.getAttribute(attr.name)!==attr.value)current.setAttribute(attr.name,attr.value);
    const previous=[...current.children],children=[...next.children];
    for(const [index,child]of children.entries()){
        const key=child.getAttribute('data-case-index');
        const match=key===null?previous[index]:previous.find(n=>n.getAttribute('data-case-index')===key);
        if(match?.tagName===child.tagName){
            reconcileSvg(match,child);
            if(current.children[index]!==match)current.insertBefore(match,current.children[index]||null);
        }else current.insertBefore(child,current.children[index]||null);
    }
    while(current.children.length>children.length)current.lastElementChild.remove();
}
function drawMarks(sheet,marks){
    const existing=sheet.querySelector('.u4d-case-marks');
    const warnings=[];
    const w=sheet.offsetWidth,h=sheet.offsetHeight,box=sheet.getBoundingClientRect(),scale=box.width/w;
    if(!scale)return warnings;
    const surface=sheet.querySelector('.u4d-paper-ink-layer')||sheet.querySelector('.u4d-paper-imprint')||sheet;
    const layer=svg('svg',{class:'u4d-case-marks',viewBox:`0 0 ${w} ${h}`,width:w,height:h,'aria-hidden':true});
    for(const [index,mark]of marks.entries()){
        if(mark.kind==='ink'&&!['strike','scribble'].includes(mark.type))continue;
        const {target,glyphs}=locate(sheet,mark);
        if(!glyphs.length){warnings.push(`未找到可渲染的 ${mark.field} 原句`);continue;}
        // When a long note scrolls, its annotations follow it and hide outside its viewport.
        const region=target.closest('.u4d-scroll-region');
        const visible=region?.getBoundingClientRect();
        const lastBox=glyphs.at(-1).getBoundingClientRect();
        if(visible&&(lastBox.bottom<visible.top||lastBox.top>visible.bottom))continue;
        const rects=glyphs.map(n=>rectInSheet(n,box,scale));
        const group=svg('g',{'data-case-index':index,'data-case-kind':mark.kind,'data-case-variant':mark.variant||mark.type,'data-case-field':mark.field,'data-case-quote':mark.quote},layer);
        if(mark.kind!=='ink'){
            const material=STAIN_SCENARIOS[mark.kind][mark.variant];
            const first=rects[0],last=rects.at(-1),height=mark.size/material.ratio;
            let x=mark.position==='before'?first.x-mark.size-4:mark.position==='over'?first.x:last.x+last.w+4;
            let y=mark.position==='over'?first.y-height*.25:last.y+last.h*.3;
            const field=rectInSheet(target,box,scale);
            if(mark.position==='after'&&x+mark.size>field.x+field.w){x=field.x+4;y=last.y+last.h+3;}
            x=clamp(x+mark.dx,12,w-mark.size-12);y=clamp(y+mark.dy,12,h-height-12);
            group.setAttribute('opacity',mark.opacity);
            svg('image',{href:material.src,x,y,width:mark.size,height,preserveAspectRatio:'xMidYMid meet'},group);
        }else{
            const rows=[];
            for(const [i,glyph]of glyphs.entries()){
                let row=rows.find(r=>Math.abs(r.top-glyph.offsetTop)<3);
                if(!row){row={top:glyph.offsetTop,rects:[]};rows.push(row);}row.rects.push(rects[i]);
            }
            const random=seededRandom(`${index}:${mark.type}:${mark.field}:${mark.quote}`);
            group.setAttribute('stroke',getComputedStyle(target).color);group.setAttribute('fill','none');group.setAttribute('stroke-linecap','round');group.setAttribute('opacity',.4+mark.amount*.5);
            for(const row of rows){
                const x=Math.min(...row.rects.map(r=>r.x)),right=Math.max(...row.rects.map(r=>r.x+r.w));
                const y=row.rects.reduce((s,r)=>s+r.y+r.h*.58,0)/row.rects.length;
                if(mark.type==='strike')svg('path',{d:`M${x-1} ${y} Q${(x+right)/2} ${y-3} ${right+2} ${y+1}`,'stroke-width':.8+mark.amount},group);
                else{
                    let d='';const count=60;
                    for(let n=0;n<count;n++){const t=n/(count-1),px=x+(right-x)*t+Math.cos(t*55)*3,py=y+Math.sin(t*55)*(3+mark.amount*4)+(random()-.5)*3;d+=`${n?' L':'M'}${px} ${py}`;}
                    svg('path',{d,'stroke-width':.7+mark.amount},group);
                }
            }
        }
    }
    if(existing)reconcileSvg(existing,layer);else surface.append(layer);
    return warnings;
}

export function renderCasePresentation(sheet,design,options={},onLayout=()=>{}){
    const settings=normalizeCaseSettings(options);
    const chosen=settings.autoStyle?design?.style??{}:{};
    const font=chosen.font||settings.font;
    sheet.style.setProperty('--u4d-handwriting-font',fontStack(font));
    sheet.style.setProperty('--u4d-writing-size',`${chosen.size??settings.fontSize}px`);
    applyHandwriting(sheet);
    [...sheet.querySelectorAll(HANDWRITING_SELECTOR)].forEach((n,i)=>styleHandwriting(n,String(i),{
        strength:(chosen.tilt??settings.tilt/100)*4,blur:chosen.blur??settings.blur/100,messiness:chosen.messiness??settings.messiness/100,
    }));
    const marks=(design?.marks??[]).filter(m=>m.kind==='ink'?(['strike','scribble'].includes(m.type)?settings.corrections:settings.autoStyle):settings[m.kind]);
    inkChanges(sheet,marks);
    let disposed=false,frame=0,needsLayout=false;
    function refresh(layout=true){
        if(disposed||!sheet.isConnected||!sheet.offsetWidth)return;
        if(layout){const height=fitCasePaper(sheet,settings.printScale);onLayout(height);}
        const warnings=[...(design?.warnings??[]),...drawMarks(sheet,marks)];
        const feedback=sheet.querySelector('.u4d-case-feedback');
        if(feedback){
            const text=settings.language==='en'?(warnings.length?`${warnings.length} marks skipped; expand the reply fields`:'Marks saved with this case'):(warnings.length?`${warnings.length} 个纸面标记已跳过；展开回复下方字段查看`:'纸面标记随当前病例保存');
            if(feedback.textContent!==text)feedback.textContent=text;
            if(feedback.dataset.warnings!==String(warnings.length))feedback.dataset.warnings=String(warnings.length);
        }
    }
    const schedule=(layout)=>{
        if(disposed)return;
        needsLayout ||=layout;
        if(!frame)frame=requestAnimationFrame(()=>{frame=0;const layout=needsLayout;needsLayout=false;refresh(layout);});
    };
    // Scrolling only moves annotations. Refitting the entire sheet here can itself
    // scroll/clamp note viewports and feed another round of scroll events.
    const onScroll=()=>schedule(false),onResize=()=>schedule(true);
    sheet.addEventListener('scroll',onScroll,true);
    const observer=new ResizeObserver(onResize);observer.observe(sheet);
    for(const target of sheet.querySelectorAll(HANDWRITING_SELECTOR))observer.observe(target);
    const fontNames=new Set([font,...marks.filter(m=>m.type==='font').map(m=>m.font)]);
    Promise.all([...fontNames].filter(k=>k!=='system').map(k=>document.fonts.load(`15px ${CASE_FONTS[k].family}`))).then(onResize).catch(onResize);
    refresh();
    return {refresh,dispose(){disposed=true;cancelAnimationFrame(frame);observer.disconnect();sheet.removeEventListener('scroll',onScroll,true);}};
}
