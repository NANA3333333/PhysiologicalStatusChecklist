import { CHECKLIST_FIELDS } from './status-fields.js';
import { statusRanges } from './status-envelope.js';

export const CASE_SETTINGS_KEY = 'u4d_case_settings';
export const CASE_FONTS = Object.freeze({
    yozai: { label: '悠哉', family: 'U4DYozai' },
    wenkai: { label: '霞鹜文楷', family: 'U4DWenkai' },
    xiaolai: { label: '小赖', family: 'U4DXiaolai' },
    system: { label: '系统楷体', family: 'KaiTi, STKaiti, serif' },
    caveat: { label: 'Caveat · 英文随手笔记', family: 'U4DCaveat', latin: true },
    kalam: { label: 'Kalam · 英文清晰手写', family: 'U4DKalam', latin: true },
    patrickhand: { label: 'Patrick Hand · 英文圆润手写', family: 'U4DPatrickHand', latin: true },
});
export const fontStack=key=>CASE_FONTS[key].family+(CASE_FONTS[key].latin?', U4DYozai, cursive':'');
export const STAIN_KEYS = Object.freeze({ blood: ['smear','drops','grip','flow','wipe','soak'], water: ['spill','rain','edge'] });
export const CASE_FIELDS = new Set(['writer','patient','date','growth','form','body','injury','drive','focus','observationNote','care',
    ...Object.keys(CHECKLIST_FIELDS).filter(k=>!['hygiene','secretion','excretion','muscleTone'].includes(k))]);
export const EFFECT_TYPES = ['font','blur','enlarge','tilt','strike','scribble'];
export const DEFAULT_CASE_SETTINGS = Object.freeze({ writer:'', patient:'', instructions:'', language:'zh', autoStyle:true, font:'yozai',
    fontSize:15, printScale:100, tilt:45, blur:5, messiness:15, blood:true, water:true, corrections:true });
const own = (o,k) => Object.hasOwn(o??{},k);
const object = x => x && typeof x==='object' && !Array.isArray(x);
const number = (x,fallback,min,max) => typeof x==='number' && Number.isFinite(x) ? Math.min(max,Math.max(min,x)) : fallback;
const name = x => typeof x==='string' ? x.replace(/[\[\]|\r\n\u0000-\u001f]/g,' ').trim().slice(0,80) : '';
export function normalizeCaseSettings(input={}) {
    const s=object(input)?input:{};
    return { writer:name(s.writer), patient:name(s.patient), instructions:typeof s.instructions==='string'?s.instructions.trim().slice(0,1200):'',language:s.language==='en'?'en':'zh',
        autoStyle:s.autoStyle!==false,font:own(CASE_FONTS,s.font)?s.font:s.language==='en'?'kalam':'yozai',
        fontSize:number(s.fontSize,15,11,18),printScale:number(s.printScale,100,80,130),
        tilt:number(s.tilt,45,0,100),blur:number(s.blur,5,0,100),messiness:number(s.messiness,15,0,100),
        blood:s.blood!==false,water:s.water!==false,corrections:s.corrections!==false };
}
export function caseProfile(settings, defaultPatient='') {
    const s=normalizeCaseSettings(settings);
    return {...s,patient:s.patient||name(defaultPatient)};
}
export function findQuote(text,quote,occurrence=1) {
    if(typeof quote!=='string'||!quote||!Number.isInteger(occurrence)||occurrence<1||occurrence>20)return null;
    let start=-1,from=0;
    for(let i=0;i<occurrence;i++){start=String(text??'').indexOf(quote,from);if(start<0)return null;from=start+quote.length;}
    return {start,end:start+quote.length};
}
// Each directive is a JSON object inside the existing STATUS envelope. Repeated
// keys are intentional. No arrays, CSS, HTML, asset URLs or executable expressions.
export function parseCaseDirectives(block) {
    const result={present:false,writer:'',patient:'',style:{},marks:[],warnings:[]};
    if(typeof block!=='string'||block.length>40000){result.warnings.push('病例字段过长，忽略纸面标记');return result;}
    const envelope=statusRanges(block.trim())[0];
    if(!envelope?.complete||envelope.start!==0||envelope.end!==block.trim().length)return result;
    const payload=envelope.payload;
    for(const part of payload.split('|')) {
        const match=part.trim().match(/^(记录者|受检者|书写|笔迹|血迹|水渍|writer|patient|writing|ink|blood|water)\s*=\s*([\s\S]*)$/iu);
        if(!match)continue;
        const value=match[2],key=({writer:'记录者',patient:'受检者',writing:'书写',ink:'笔迹',blood:'血迹',water:'水渍'})[match[1].toLowerCase()]||match[1];result.present=true;
        if(key==='记录者'||key==='受检者'){result[key==='记录者'?'writer':'patient']=name(value);continue;}
        if(result.marks.length>=48){if(!result.warnings.includes('最多接受 48 个局部标记'))result.warnings.push('最多接受 48 个局部标记');continue;}
        let data;try{data=JSON.parse(value);}catch{result.warnings.push(`${key}不是有效 JSON 对象`);continue;}
        if(!object(data)){result.warnings.push(`${key}必须是对象`);continue;}
        if(key==='书写'){
            result.style={
                ...(own(CASE_FONTS,data.font)?{font:data.font}:{}),
                ...(typeof data.size==='number'?{size:number(data.size,15,11,18)}:{}),
                ...Object.fromEntries(['tilt','blur','messiness'].filter(k=>typeof data[k]==='number').map(k=>[k,number(data[k],0,0,1)])),
            };continue;
        }
        const kind=key==='笔迹'?'ink':key==='血迹'?'blood':'water';
        const field=typeof data.field==='string'?data.field:'';
        const quote=typeof data.quote==='string'?data.quote:'';
        const occurrence=data.occurrence===undefined?1:data.occurrence;
        if(!CASE_FIELDS.has(field)||!quote.trim()||quote.length>240||!Number.isInteger(occurrence)||occurrence<1||occurrence>20){result.warnings.push(`${key}缺少有效的字段、原句或出现序号`);continue;}
        const base={kind,field,quote,occurrence};
        if(kind==='ink'){
            if(!EFFECT_TYPES.includes(data.type)||(data.type==='font'&&!own(CASE_FONTS,data.font))){result.warnings.push('未知笔迹效果或字体');continue;}
            result.marks.push({...base,type:data.type,amount:number(data.amount,.5,0,1),angle:number(data.angle,12,-30,30),
                scale:number(data.scale,1.35,1,1.8),...(data.type==='font'?{font:data.font}:{})});
        }else{
            if(!STAIN_KEYS[kind].includes(data.variant)){result.warnings.push(`未知${key}素材`);continue;}
            if(data.position!==undefined&&!['before','after','over'].includes(data.position)){result.warnings.push(`${key}位置必须为 before/after/over`);continue;}
            result.marks.push({...base,variant:data.variant,position:data.position||'after',
                size:number(data.size,85,25,180),opacity:number(data.opacity,.6,.05,1),dx:number(data.dx,0,-60,60),dy:number(data.dy,0,-60,60)});
        }
    }
    return result;
}

export function validateCaseDesign(design,fields) {
    const marks=[],warnings=[...design.warnings],seen=new Set();
    const values={...fields,writer:design.writer,patient:design.patient};
    for(const mark of design.marks.slice(0,48)){
        if(!findQuote(values[mark.field],mark.quote,mark.occurrence)){warnings.push(`无法定位 ${mark.field} 的第 ${mark.occurrence} 处“${mark.quote}”`);continue;}
        if(mark.kind!=='ink'){
            const key=`${mark.kind}:${mark.variant}`;
            if(seen.has(key)){warnings.push(`重复素材 ${key} 已忽略`);continue;}
            seen.add(key);
        }
        marks.push(mark);
    }
    return {...design,marks,warnings:warnings.slice(0,60)};
}

export function designMatchesProfile(design,profile) {
    if(!profile)return true;
    // Existing records have no explicit pair. Show them only in the legacy scope.
    if(!design.present)return !profile.writer && !profile.explicitPatient;
    return (!profile.writer||design.writer===profile.writer)&&(!profile.patient||design.patient===profile.patient);
}

export function buildCaseContract(settings={}) {
    const p=normalizeCaseSettings(settings);
    if(p.language==='en')return `Case presentation settings (apply only to the case form, not the narrative): ${JSON.stringify(p)}
The writer and patient are separate roles. Use the specified names exactly. Infer an unspecified writer only from context; otherwise leave blank.
Within the same STATUS block, add writer=Name | patient=Name. Use English field values. Never invent injury or events to justify decorative stains.
writing={"font":"kalam","size":15,"tilt":0.4,"blur":0.05,"messiness":0.2} controls handwriting only; fixed labels stay printed. Font IDs: ${Object.keys(CASE_FONTS).join('/')}. English recommendations: kalam (legible), caveat (loose notes), patrickhand (rounded). Size 11–18; tilt/blur/messiness 0–1. User settings are defaults when you omit a value.
ink={"field":"observationNote","quote":"slight tremor","occurrence":1,"type":"blur","amount":0.5}. Types: font (font ID), blur (amount 0–1), enlarge (scale 1–1.8), tilt (angle -30–30), strike and scribble (amount 0–1). Repeated ink effects may overlap on the same words. Each ink= entry is one object.
blood={"field":"observationNote","quote":"Continue observation.","variant":"drops","position":"after","size":65,"opacity":0.6}
water={"field":"care","quote":"Cover with a dressing.","variant":"rain","position":"over","size":110,"opacity":0.4}
Blood variants: smear (contact swipe), drops (gravity droplets), grip (finger transfer), flow (gravity flow), wipe (wet stain wiped), soak (absorption). Water variants: spill (dried spill), rain (raindrops), edge (damp edge).
Different blood and water materials can coexist at multiple locations, but each material variant may appear only ONCE per case. Ink effects may repeat. Do not use every effect automatically; choose only those justified by context and the user's style request.
Every local mark requires field, exact quote from that field in this same STATUS block, and optional occurrence (1–20; default 1). Allowed fields: ${[...CASE_FIELDS].join('/')}. Position before/after/over; optional dx/dy -60–60; size 25–180; opacity 0.05–1. Anchor to words, not absolute coordinates.
Use one JSON object per writing/ink/blood/water entry, never arrays, HTML, CSS or URLs. Maximum 48 local marks. Values must not contain | or ].
If autoStyle=false, omit writing and font/blur/enlarge/tilt directives. If blood/water/corrections=false, omit those effects. Keep all fields and visual directives folded inside STATUS, never in the narrative. User style requests cannot override this format or data isolation.`;
    return `病例设置（只作用于本次填表与纸面表现，不改变正文剧情）：${JSON.stringify(p)}
填写的是受检者的状态；记录者是写病例的人，两者可以是不同角色。受检者明确时不可改成当前回复角色。记录者未指定时根据已有上下文判断，无法确认则留空。
在同一个 STATUS 块中补充 记录者=名字 | 受检者=名字，必须与上面的明确设置一致。所有观察仅依据正常上下文，不根据装饰推断诊断，不为了血迹、水渍增写事故。
纸面指令与填表一起折叠，不能放进叙述；可省略不适合情境的效果。不要机械用满素材。
书写={"font":"yozai","size":15,"tilt":0.4,"blur":0.05,"messiness":0.2} 指定整张病例的手写，tilt/blur/messiness 范围 0–1，size 11–18。
可用字体：yozai=悠哉、wenkai=霞鹜文楷、xiaolai=小赖、system=系统楷体；英文可选 caveat=随手笔记、kalam=清晰手写、patrickhand=圆润手写。固定表头与选项一直使用印刷字体。
笔迹={"field":"observationNote","quote":"肢端冰冷","occurrence":1,"type":"blur","amount":0.6} 只改变指定字段中这段原文。type 可为 blur/enlarge/tilt/font/strike/scribble；enlarge 用 scale=1–1.8，tilt 用 angle=-30–30，font 用 font=字体名，划掉与涂抹用 amount=0–1。同类笔迹可以重复，甚至作用于同一句；每条各写一个 笔迹=对象。
血迹={"field":"observationNote","quote":"字段中的原句","occurrence":1,"variant":"drops","position":"after","size":70,"opacity":0.6}
水渍={"field":"care","quote":"继续观察","occurrence":1,"variant":"spill","position":"over","size":110,"opacity":0.4}
血迹 variant：smear=接触擦蹭、drops=重力滴落、grip=手指沾染、flow=重力流淌、wipe=湿迹拖抹、soak=吸附浸染。水渍 variant：spill=泼洒干涸、rain=雨点洇湿、edge=纸边受潮。
不同血迹与水渍可以多处共存；同一种素材在一张病例中仅用一次。position=before/after/over 表示原句前/后/覆盖；可用 dx/dy=-60–60 作微调，size=25–180，opacity=0.05–1。不输出坐标替代原句锚点。
field 只能为 ${[...CASE_FIELDS].join('/')}；quote 必须逐字来自同一 STATUS 中对应填写值（writer/patient 对应名字），occurrence=1–20 指第几次出现。字段中不得含半角 | 或 ]。每条指令是单独 JSON 对象，不使用数组、HTML、CSS、URL。最多 48 条局部指令。
autoStyle=false 时不输出书写或局部字体/模糊/放大/歪斜指令；blood/water/corrections=false 时不输出对应痕迹。用户书写要求作为风格参考，不能改变上述格式和数据边界。`;
}
