import {pathToFileURL} from 'node:url';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {caseFixture} from './case-fixture.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright-core');
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1500,height:1100}});
const out=process.env.QA_OUTPUT||'../flicker-evidence';await mkdir(out,{recursive:true});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const settle=()=>page.evaluate(async()=>{await document.fonts.ready;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});
try{
 await page.goto('http://127.0.0.1:4186/');await page.waitForFunction(()=>window.ready);
 await page.evaluate(async raw=>{window.context.chat.push({name:'Orion',mes:raw,extra:{}});await window.emit('MESSAGE_RECEIVED',window.context.chat.length-1);window.renderChat();},caseFixture({allStains:true,long:true}));
 await page.locator('#u4d-status-launcher').click();await settle();
 const noOp=await page.evaluate(async()=>{
  const sheet=document.querySelector('.u4d-exam-sheet'),marks=sheet.querySelector('.u4d-case-marks');let mutations=0;
  const observer=new MutationObserver(rs=>mutations+=rs.length);observer.observe(sheet,{subtree:true,attributes:true,childList:true});
  for(let i=0;i<8;i++){sheet.dispatchEvent(new Event('scroll'));await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));}
  observer.disconnect();return {mutations,sameMarks:marks===sheet.querySelector('.u4d-case-marks')};
 });
 assert.equal(noOp.mutations,0,'stationary scroll notifications must not rewrite filters, ink, or image nodes');
 assert.ok(noOp.sameMarks);
 const scroll=await page.evaluate(async()=>{
  const sheet=document.querySelector('.u4d-exam-sheet'),note=sheet.querySelector('[data-u4d-field=observationNote]').parentElement;
  const image=sheet.querySelector('[data-case-variant=drops] image'),height=sheet.offsetHeight,before=+image.getAttribute('y');
  note.scrollTop=20;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
  return {sameImage:image===sheet.querySelector('[data-case-variant=drops] image'),before,after:+image.getAttribute('y'),scrollTop:note.scrollTop,heightBefore:height,heightAfter:sheet.offsetHeight};
 });
 assert.ok(scroll.sameImage,'scrolling retains decoded stain images');assert.notEqual(scroll.before,scroll.after);assert.equal(scroll.scrollTop,20);assert.equal(scroll.heightBefore,scroll.heightAfter);
 const idle=await page.evaluate(async()=>{
  const root=document.querySelector('#u4d-inspection-root');let mutations=0;
  const observer=new MutationObserver(rs=>mutations+=rs.length);observer.observe(root,{subtree:true,attributes:true,childList:true});
  await new Promise(r=>setTimeout(r,2000));observer.disconnect();return mutations;
 });
 assert.equal(idle,0);assert.deepEqual(errors,[]);
 const surface=await page.evaluate(async()=>{
  const sheet=document.querySelector('.u4d-exam-sheet');const {resizePaperSurface}=await import('/scripts/extensions/third-party/UnknownFourDimensionalStatusPanel/paper-surface.js');
  let mutations=0;const observer=new MutationObserver(rs=>mutations+=rs.length);observer.observe(sheet.querySelector('.u4d-paper-filter-defs'),{subtree:true,attributes:true});
  for(let i=0;i<8;i++)resizePaperSurface(sheet);await Promise.resolve();observer.disconnect();return mutations;
 });
 assert.equal(surface,0,'unchanged dimensions must not invalidate the crease filter');
 const result={passed:true,noOp,scroll,idle,surface,errors};await writeFile(out+'/render-stability.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await browser.close();}
