import {renderChat} from '/script.js';
import {init} from './index.js';
import {caseFixture,englishCaseFixture} from './tests/case-fixture.mjs';
import {CASE_FONTS,CASE_SETTINGS_KEY,caseProfile,normalizeCaseSettings,fontStack} from './case-protocol.js';

init();
const context=window.context;
const descriptions={caveat:['随手笔记，笔势更松弛','Loose, quick notes'],kalam:['清晰的斜体手写，适合密集病例','Clear handwriting for dense notes'],patrickhand:['圆润整齐，辨识度较高','Rounded, tidy handwriting']};
let generation=0;
function settings(){return normalizeCaseSettings(context.chatMetadata[CASE_SETTINGS_KEY]);}
function makeControls(compact=false){
    const row=document.createElement('div');row.className='demo-type-controls';
    const fontLabel=document.createElement('label'),font=document.createElement('select');font.dataset.demoFont='';
    fontLabel.append(document.createTextNode('手写字体 / Font'),font);
    for(const [key,item]of Object.entries(CASE_FONTS))font.add(new Option(item.label,key));
    const languageLabel=document.createElement('label'),language=document.createElement('select');language.dataset.demoLanguage='';
    language.add(new Option('中文病例','zh'));language.add(new Option('English case','en'));languageLabel.append(document.createTextNode('病例语言 / Language'),language);
    font.addEventListener('change',()=>changePreview({font:font.value}));
    language.addEventListener('change',()=>changePreview({language:language.value,font:language.value==='en'?'kalam':'yozai'}));
    row.append(languageLabel,fontLabel);if(compact)row.classList.add('is-compact');return row;
}
document.querySelector('#demo-type-controls').append(makeControls());
document.querySelector('.u4d-case-toolbar').append(makeControls(true));
for(const key of ['caveat','kalam','patrickhand']){
    const card=document.createElement('button');card.type='button';card.className='demo-font-card';card.dataset.fontCard=key;
    const label=document.createElement('strong');label.textContent=key==='patrickhand'?'Patrick Hand':key==='kalam'?'Kalam':'Caveat';
    const sample=document.createElement('span');sample.className='demo-font-sample';sample.style.fontFamily=fontStack(key);sample.textContent='Hand is cool. Continue observation.';
    const desc=document.createElement('span');desc.className='demo-font-desc';desc.textContent=descriptions[key][0];
    const license=document.createElement('small');license.textContent='SIL OFL 1.1 · 开源 / Open source';
    card.append(label,sample,desc,license);card.addEventListener('click',()=>changePreview({font:key,language:'en'}));document.querySelector('#demo-font-cards').append(card);
}

function syncControls(){
    const s=settings();
    document.querySelectorAll('[data-demo-font]').forEach(n=>{n.value=s.font;for(const option of n.options)option.textContent=s.language==='en'?({yozai:'Yozai · Chinese',wenkai:'LXGW WenKai · Chinese',xiaolai:'Xiaolai · Chinese',system:'System KaiTi',caveat:'Caveat · Loose notes',kalam:'Kalam · Clear handwriting',patrickhand:'Patrick Hand · Rounded'})[option.value]:CASE_FONTS[option.value].label;});
    document.querySelectorAll('[data-demo-language]').forEach(n=>n.value=s.language);
    document.querySelectorAll('[data-font-card]').forEach(n=>{n.setAttribute('aria-pressed',String(n.dataset.fontCard===s.font));n.querySelector('.demo-font-desc').textContent=descriptions[n.dataset.fontCard][s.language==='en'?1:0];});
    document.documentElement.lang=s.language==='en'?'en':'zh-CN';
    document.querySelector('h1').textContent=s.language==='en'?'A case with a human hand.':'一份有记录者的病例。';
    document.querySelector('main > p').textContent=s.language==='en'?'Choose handwriting and compare an English case below. Printed labels stay printed; changes affect only handwritten entries.':'在这里直接选字体，或点击下方英文样例切换整张病例。固定表头使用印刷体，填写内容才使用手写字体。';
    document.querySelector('#demo-open').textContent=s.language==='en'?'Open case':'打开病例';
    document.querySelector('#demo-settings').textContent=s.language==='en'?'Case settings':'病例设置';
    document.querySelector('#demo-load').textContent=s.language==='en'?'Reload example':'载入标记示例';
    document.querySelector('.u4d-case-settings-open').textContent=s.language==='en'?'Case settings':'病例设置';
    const aside=document.querySelector('aside');aside.replaceChildren();
    aside.append(document.createTextNode(s.language==='en'?'This page runs the actual plugin with predefined examples and a simulated chat host. No model is called. In SillyTavern: EXAM → Case settings. English fonts fall back to Yozai for Chinese characters.':'本页使用真实插件与预设回复演示，未调用模型。酒馆中通过 EXAM → 病例设置使用。英文字体缺少的中文字形回退为悠哉字体。'));
    aside.append(document.createElement('br'));
    const link=document.createElement('a');link.href='./preview.html?v=english-fonts-9';link.textContent=s.language==='en'?'Font & material laboratory ↗':'字体与材质实验室 ↗';aside.append(link);
}
async function loadExample(){
    const s=settings(),profile=caseProfile(s,'Orion');
    const options={writer:profile.writer||(s.language==='en'?'Dr. Lin':'林医生'),patient:profile.patient,font:s.font};
    const entry={name:'Orion',mes:(s.language==='en'?englishCaseFixture:caseFixture)(options),extra:{u4d_demo:true}};
    if(context.chat.at(-1)?.extra?.u4d_demo)context.chat[context.chat.length-1]=entry;else context.chat.push(entry);
    await window.emit('CHAT_CHANGED');
    const id=context.chat.length-1;await window.emit('MESSAGE_RECEIVED',id);renderChat();await window.emit('CHARACTER_MESSAGE_RENDERED',id);
    await context.saveChat();syncControls();
}
async function changePreview(patch){
    const request=++generation;
    context.chatMetadata[CASE_SETTINGS_KEY]=normalizeCaseSettings({...settings(),...patch});
    await loadExample();
    document.querySelector('#u4d-status-launcher').click();
    const s=settings();await document.fonts.load(`16px ${CASE_FONTS[s.font].family}`);await document.fonts.ready;
    if(request!==generation)return;
    const status=document.querySelector('#demo-font-status');status.replaceChildren();
    status.append(document.createTextNode(`${CASE_FONTS[s.font].label} · ${s.language==='en'?'Applied to the case. ':'已应用到病例。'}`));
    if(s.font!=='system'){const license=document.createElement('a');license.href=`./preview-fonts/${s.font}-OFL.txt`;license.textContent='SIL OFL 1.1';license.target='_blank';license.rel='noopener';status.append(license);}
}
document.querySelector('#demo-open').onclick=()=>document.querySelector('#u4d-status-launcher').click();
document.querySelector('#demo-settings').onclick=()=>{document.querySelector('#u4d-status-launcher').click();document.querySelector('.u4d-case-settings-open').click();};
document.querySelector('#demo-load').onclick=async()=>{await loadExample();document.querySelector('#u4d-status-launcher').click();};
await loadExample();window.ready=true;
