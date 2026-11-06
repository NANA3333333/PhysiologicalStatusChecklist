import { applyHandwriting, styleHandwriting, HANDWRITING_SELECTOR } from './handwriting.js';
import { applyPaperEffects, STAIN_SCENARIOS } from './paper-effects.js';
import { setPaperLighting, resizePaperSurface } from './paper-surface.js';

const fonts = {
  caveat: {name:'Caveat',family:'U4DCaveat',latin:true,style:'Variable · 400',desc:'英文随手笔记，笔势松弛。中文回退为悠哉。',repo:'https://github.com/google/fonts/tree/main/ofl/caveat'},
  kalam: {name:'Kalam',family:'U4DKalam',latin:true,style:'Regular',desc:'清晰的英文手写，适合较密的病例文字。中文回退为悠哉。',repo:'https://github.com/google/fonts/tree/main/ofl/kalam'},
  patrickhand: {name:'Patrick Hand',family:'U4DPatrickHand',latin:true,style:'Regular',desc:'圆润、整齐的英文手写。中文回退为悠哉。',repo:'https://github.com/google/fonts/tree/main/ofl/patrickhand'},
  journal: { name:'新蒂手札体', family:'PreviewJournal', style:'王维 · 个人非商用', desc:'自然连笔、书写方向感明显，用来比较医生随手写下观察记录的效果。', repo:'https://sentyfont.cn/journal.htm', personal:true },
  fountain: { name:'新蒂美工钢笔', family:'PreviewFountain', style:'王维 · 个人非商用', desc:'钢笔粗细变化较强，适合比较更有笔锋的填写效果。', repo:'https://sentyfont.cn/fountainpen.htm', personal:true },
  yozai: { name:'悠哉字体', family:'PreviewYozai', style:'Medium', desc:'手写起落更明显，适合想要随手记录感的检查表。', repo:'https://github.com/lxgw/yozai-font' },
  wenkai: { name:'霞鹜文楷', family:'PreviewWenkai', style:'Regular · 轻便版', desc:'字形端正、辨识度高，适合密集填写与长时间阅读。', repo:'https://github.com/lxgw/LxgwWenKai-Lite' },
  xiaolai: { name:'小赖字体', family:'PreviewXiaolai', style:'Regular', desc:'笔形松弛圆润，像随身笔记本里的日常手记。', repo:'https://github.com/lxgw/kose-font' },
};
const $ = selector => document.querySelector(selector);
const paper = $('#u4d-inspection-root');
const inkScope = $('.preview-area');
let sheet, fontSequence=0, fitMode=true, markSeed=0;
let lightMode='window';
const targets = HANDWRITING_SELECTOR;
const presets = {
  clean: {strength:0,messiness:0,strike:0,scribble:0,water:0,blood:0,blur:0},
  daily: {strength:170,messiness:15,strike:30,scribble:0,water:15,blood:0,blur:8},
  hurried: {strength:270,messiness:55,strike:65,scribble:45,water:20,blood:0,blur:18},
  scene: {strength:260,messiness:65,strike:70,scribble:65,water:65,blood:58,blur:35},
};
function noteTarget() {
  return [...sheet.querySelectorAll('.u4d-lined-field')].find(node=>node.querySelector('strong')?.textContent==='观察补记')?.querySelector('.u4d-lined-value');
}
function paintEffects() {
  if(!sheet)return;
  const value=id=>Number($(`#${id}`).value)/100;
  applyPaperEffects(sheet,noteTarget(),{strike:value('strike'),scribble:value('scribble'),water:value('water'),blood:value('blood'),waterScene:$('#water-scene').value,bloodScene:$('#blood-scene').value,seed:markSeed,ink:$('input[name=ink]:checked').value});
  updateSceneLabels();
}
function updateSceneLabels() {
  for(const kind of ['water','blood']) {
    const key=$(`#${kind}-scene`).value, entry=STAIN_SCENARIOS[kind][key];
    $(`#${kind}-formation`).textContent=entry.formation;
    document.querySelectorAll(`[data-stain-kind="${kind}"]`).forEach(button=>{
      button.setAttribute('aria-pressed',String(button.dataset.stainKey===key));
    });
  }
  const names=['blood','water'].map(kind=>{
    const entry=STAIN_SCENARIOS[kind][$(`#${kind}-scene`).value];
    return `${entry.label}${Number($(`#${kind}`).value)===0?'（已关闭）':''}`;
  });
  $('#stain-selection-status').textContent=`当前纸面：${names.join(' ＋ ')}。点击上方「回到纸面」查看。`;
}
function buildStainLibrary() {
  for(const kind of ['blood','water']) {
    const select=$(`#${kind}-scene`);
    for(const [key,entry] of Object.entries(STAIN_SCENARIOS[kind])) {
      select.add(new Option(entry.label,key));
      const button=document.createElement('button');
      button.type='button';button.className='stain-card';
      button.dataset.stainKind=kind;button.dataset.stainKey=key;
      const image=document.createElement('img');image.src=entry.src;image.alt='';image.loading='lazy';
      const swatch=document.createElement('span');swatch.className='stain-swatch';swatch.append(image);
      const title=document.createElement('strong');title.textContent=entry.label;
      const term=document.createElement('span');term.className='stain-term';term.textContent=entry.term;
      const desc=document.createElement('span');desc.className='stain-description';desc.textContent=entry.formation;
      const features=document.createElement('span');features.className='stain-features';features.textContent=entry.features;
      button.append(swatch,title,term,desc,features);
      button.addEventListener('click',()=>{
        select.value=key;
        if(Number($(`#${kind}`).value)===0)$(`#${kind}`).value=kind==='blood'?58:65;
        updateInk();
      });
      $('#stain-cards').append(button);
    }
    select.addEventListener('change',()=>{paintEffects();});
  }
  updateSceneLabels();
}
function updateInk() {
  if(!sheet) return;
  const amount = Number($('#strength').value)/100;
  $('#strength-value').value = `${$('#strength').value}%`;
  $('#font-size-value').value = `${$('#font-size').value} px`;
  inkScope.style.setProperty('--preview-size', `${$('#font-size').value}px`);
  inkScope.style.setProperty('--preview-ink', $('input[name=ink]:checked').value);
  for(const id of ['messiness','strike','scribble','water','blood','blur']) $(`#${id}-value`).value=`${$(`#${id}`).value}%`;
  for(const root of [sheet,$('.type-boundary')]) {
    for(const [index,target] of [...root.querySelectorAll(targets)].entries()) {
      styleHandwriting(target,String(index),{strength:amount,messiness:Number($('#messiness').value)/100,blur:Number($('#blur').value)/100});
    }
  }
  fitPrintLayout();
  paintEffects();
}
function fitPrintLayout() {
  // Measure at the original paper size so a smaller setting shrinks back too.
  // Keep a usable blank-writing area as well as every checklist option.
  sheet.style.setProperty('--u4d-base-height','1120px');
  const column=sheet.querySelector('.u4d-report-column-right');
  let extra=Math.max(0,column.scrollHeight-column.clientHeight);
  for(const [selector,min] of [['.u4d-report-column-left',140],['.u4d-report-column-center',76]]) {
    const notes=sheet.querySelector(`${selector} .u4d-report-section:last-child .u4d-lined-scroll`);
    if(notes)extra=Math.max(extra,min-notes.clientHeight);
  }
  const height=1120+(extra>0?Math.ceil(extra)+6:0);
  sheet.style.setProperty('--u4d-base-height',`${height}px`);
  paper.style.height=`${height}px`;
  resizePaperSurface(sheet);
  fitPaper();
}
function updatePrintSize() {
  if(!sheet)return;
  const scale=Number($('#print-size').value)/100;
  sheet.style.setProperty('--u4d-print-scale',String(scale));
  // Give four-character options enough room in the two small right-hand grids.
  const extraWidth=Math.max(0,scale-1)*.32;
  sheet.style.setProperty('--u4d-center-column',`${1.14-extraWidth}fr`);
  sheet.style.setProperty('--u4d-right-column',`${1.16+extraWidth}fr`);
  $('.type-boundary').style.setProperty('--u4d-print-scale',String(scale));
  $('#print-size-value').value=`${$('#print-size').value}%`;
  $('#type-size-caption').textContent=`印刷文字 ${+(10*scale).toFixed(1)}–${+(12*scale).toFixed(1)} px · 点击「原尺寸」近看`;
  updateInk();
}
function updateLighting() {
  if(!sheet)return;
  setPaperLighting(sheet,{mode:lightMode,strength:Number($('#light-strength').value)/100});
  $('#light-strength-value').value=`${$('#light-strength').value}%`;
  document.querySelectorAll('[data-light]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.light===lightMode)));
}
async function chooseFont() {
  const key=$('input[name=font]:checked').value;
  const font=fonts[key], sequence=++fontSequence;
  $('#current-name').textContent=font.name;
  $('#source-title').textContent=`${font.name} · ${font.style}`;
  $('#source-desc').textContent=font.desc;
  $('#source-link').href=font.repo;
  $('#license-link').href=font.personal ? 'https://sentyfont.cn/terms%20and%20conditions.htm' : `./preview-fonts/${key}-OFL.txt`;
  $('#license-note').textContent=font.personal
    ? '官网允许个人非商业使用；本页仅作本机试用。这不是开源许可，随插件嵌入分发的授权尚未确认。'
    : 'OFL 1.1 开源许可：允许商用及随插件嵌入分发；需保留许可证，不可单独售卖字体文件。';
  $('#font-status').textContent='正在载入字体…';
  try{
    const loaded=await document.fonts.load(`14px ${font.family}`,font.latin?'Continue observation.':'检查记录清醒肢端冰冷');
    if(sequence!==fontSequence)return;
    if(!loaded.length)throw new Error('Font unavailable');
    inkScope.style.setProperty('--preview-font',font.family+(font.latin?', U4DYozai':''));
    $('#font-status').textContent='字体已就绪';
    document.body.dataset.fontReady=key;
    $('#font-choice-name').textContent=font.name;
    requestAnimationFrame(updateInk);
  }catch(error){
    if(sequence!==fontSequence)return;
    $('#font-status').textContent='字体加载失败，请刷新重试';
    console.error(error);
  }
}
function fitPaper() {
  const stage=$('#paper-stage'), style=getComputedStyle(stage);
  const available=stage.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight);
  const scale=fitMode?Math.min(1,available/840):1;
  paper.style.transform=`scale(${scale})`;
  $('#paper-sizer').style.width=`${840*scale}px`;
  $('#paper-sizer').style.height=`${(sheet?.offsetHeight||1120)*scale}px`;
  $('#fit').setAttribute('aria-pressed',String(fitMode));
  $('#actual').setAttribute('aria-pressed',String(!fitMode));
}
function updateText(){
  if(!sheet)return;
  const field=[...sheet.querySelectorAll('.u4d-lined-field')].find(node=>node.querySelector('strong')?.textContent==='观察补记');
  field.querySelector('.u4d-lined-value').textContent=$('#custom-text').value;
  applyHandwriting(sheet); updateInk();
}
async function loadPaper(){
  const frame=$('#source-renderer');
  const doc=frame.contentDocument;
  const original=doc?.querySelector('.u4d-exam-sheet');
  if(!original){setTimeout(loadPaper,60);return;}
  sheet=original.cloneNode(true);
  sheet.querySelectorAll('.u4d-sheet-close').forEach(node=>node.remove());
  paper.replaceChildren(sheet);
  const message=doc.querySelector('#chat .mes');
  if(message)$('#chat-example').replaceChildren(message.cloneNode(true));
  applyHandwriting($('.type-boundary'));
  updateText(); updatePrintSize(); updateLighting(); fitPaper(); await chooseFont();
  document.body.dataset.previewReady='true';
}
document.querySelectorAll('input[name=font]').forEach(input=>input.addEventListener('change',chooseFont));
document.querySelectorAll('input[name=ink], .adjustments input[type=range]:not(#light-strength):not(#print-size)').forEach(input=>input.addEventListener('input',()=>{
  document.querySelectorAll('[data-preset]').forEach(button=>button.setAttribute('aria-pressed','false'));
  updateInk();
}));
document.querySelectorAll('[data-light]').forEach(button=>button.addEventListener('click',()=>{lightMode=button.dataset.light;updateLighting();}));
$('#light-strength').addEventListener('input',updateLighting);
$('#print-size').addEventListener('input',updatePrintSize);
document.querySelectorAll('[data-preset]').forEach(button=>button.addEventListener('click',()=>{
  for(const [key,value] of Object.entries(presets[button.dataset.preset])) $(`#${key}`).value=value;
  document.querySelectorAll('[data-preset]').forEach(item=>item.setAttribute('aria-pressed',String(item===button)));
  updateInk();
}));
$('#new-marks').addEventListener('click',()=>{markSeed++;paintEffects();});
$('#custom-text').addEventListener('input',updateText);
$('#fit').addEventListener('click',()=>{fitMode=true;fitPaper();});
$('#actual').addEventListener('click',()=>{fitMode=false;fitPaper();});
$('#reset').addEventListener('click',()=>{
  $('input[name=font][value=journal]').checked=true;
  $('input[name=ink][value="#263d56"]').checked=true;
  for(const [key,value] of Object.entries(presets.scene)) $(`#${key}`).value=value;
  document.querySelectorAll('[data-preset]').forEach(item=>item.setAttribute('aria-pressed',String(item.dataset.preset==='scene')));
  $('#font-size').value=15;markSeed=0;
  $('#print-size').value=100;updatePrintSize();
  lightMode='window';$('#light-strength').value=70;updateLighting();
  $('#water-scene').value='spill';$('#blood-scene').value='smear';
  $('#custom-text').value='触碰后左手短暂回缩，未见持续抖动。末梢触觉仍保留。';
  fitMode=true; updateText();fitPaper();void chooseFont();
});
new ResizeObserver(fitPaper).observe($('#paper-stage'));
buildStainLibrary();
void loadPaper();
