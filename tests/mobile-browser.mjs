import {pathToFileURL} from 'node:url';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {caseFixture} from './case-fixture.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright-core');
const host=process.env.QA_HOST||'http://127.0.0.1:4186/',actual=!host.includes(':4186'),out=process.env.QA_OUTPUT||'../mobile-evidence/preview';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,channel:'chrome'}),page=await browser.newPage({viewport:{width:375,height:812},isMobile:true,hasTouch:true,deviceScaleFactor:2,userAgent:'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36'});
const errors=[],checks=[],sizes=[];page.on('pageerror',e=>errors.push(e.message));
if(actual)await page.route('**/*',async route=>{
 const req=route.request(),url=new URL(req.url());
 if(url.pathname==='/api/chats/get'&&req.postDataJSON()?.avatar_url!=='Subject-4D.png')return route.fulfill({status:200,contentType:'application/json',body:'[]'});
 if(!['GET','HEAD'].includes(req.method())){
  const readOnly=/\/(get|all|list|read|recent|search|stats|discover|version|status|count|view|getstats|getall|get-state|check|find|query)$/i.test(url.pathname)||url.pathname.startsWith('/api/tokenizers/');
  if(!readOnly||/generate|completions/.test(url.pathname))return route.fulfill({status:200,contentType:'application/json',body:'{}'});
 }await route.continue();
});
const settle=()=>page.evaluate(async()=>{await document.fonts.ready;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});
const record=page.locator('.u4d-exam-sheet:not(.u4d-date-sheet)'),date=page.locator('.u4d-date-sheet');
const action=name=>page.locator(`[data-mobile-action=${name}]`);
const cdp=await page.context().newCDPSession(page);
const send=(type,points=[])=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points.map(([x,y,id])=>({x,y,id}))});
async function fit(){await action('fit').tap();await settle();}
async function swipe(x,y,dx,dy,cancel=false){await send('touchStart',[[x,y,1]]);for(let i=1;i<=8;i++)await send('touchMove',[[x+dx*i/8,y+dy*i/8,1]]);await send(cancel?'touchCancel':'touchEnd');await settle();}
async function assertFit(sheet){const b=await sheet.boundingBox(),bar=await page.locator('.u4d-case-toolbar').boundingBox();assert.ok(b.x>=0&&b.y>=0&&b.x+b.width<=page.viewportSize().width+1&&b.y+b.height<=page.viewportSize().height+1&&(b.y+b.height<=bar.y+1||b.x+b.width<=bar.x+1),JSON.stringify({b,bar}));return b;}
try{
 await page.goto(host,{waitUntil:'domcontentloaded'});
 if(actual){
  await page.waitForFunction(()=>window.SillyTavern?.getContext().characters.length&&document.querySelector('#u4d-status-launcher'),null,{timeout:90000});
  await page.evaluate(()=>{const c=SillyTavern.getContext();void c.selectCharacterById(c.characters.findIndex(x=>x.avatar==='Subject-4D.png'));});
  await page.waitForFunction(()=>{const c=SillyTavern.getContext();return c.characters[c.characterId]?.avatar==='Subject-4D.png'&&c.chat.length&&!document.querySelector('#u4d-status-launcher').hidden;});
  await page.evaluate(()=>document.querySelector('#cpgl_tour_skip')?.click());
 }else{
  await page.waitForFunction(()=>window.ready);
  // Reproduce the installed host theme's zero-height transformed html ancestor.
  await page.addStyleTag({content:'html{transform:translateZ(0);perspective:1000px}body{position:fixed;inset:0;width:100vw;height:100dvh}'});
  await page.evaluate(async raw=>{window.context.chat.push({name:'Orion',mes:raw,extra:{}});await window.emit('MESSAGE_RECEIVED',window.context.chat.length-1);window.renderChat();},caseFixture({allStains:true,long:true}));
 }
 await page.locator('#u4d-status-launcher').tap();await settle();
 for(const [width,height]of [[375,812],[360,740],[390,844],[844,390]]){
  await page.setViewportSize({width,height});await settle();
  assert.ok(await record.isVisible());assert.equal(await date.isVisible(),false);
  const box=await assertFit(record),buttons=await page.locator('.u4d-case-toolbar>button').evaluateAll(ns=>ns.filter(n=>n.getBoundingClientRect().width).map(n=>({text:n.textContent,box:n.getBoundingClientRect().toJSON()})));
  assert.ok(buttons.every(n=>n.box.width>=44&&n.box.height>=44));
  await page.screenshot({path:out+`/open-${width}.png`});sizes.push({width,height,box,buttons});
 }
 checks.push('host theme with transformed zero-height html keeps toolbar inside the viewport');
 checks.push('360/375/390 portrait and 844 landscape: one fitted sheet, controls >=44px, no paper/toolbar overlap');
 await page.setViewportSize({width:375,height:812});await settle();
 let before=await record.boundingBox();await action('in').tap();await settle();assert.ok((await record.boundingBox()).width>before.width);await action('out').tap();await settle();assert.ok(Math.abs((await record.boundingBox()).width-before.width)<1,JSON.stringify({before,after:await record.boundingBox(),viewport:await page.evaluate(()=>({inner:[innerWidth,innerHeight],scale:visualViewport.scale,active:document.activeElement?.outerHTML.slice(0,200)}))}));await fit();
 checks.push('zoom buttons and recover-to-fit');
 before=await record.boundingBox();let x=before.x+before.width/2,y=before.y+70;
 await send('touchStart',[[x-20,y,1],[x+20,y,2]]);for(let i=1;i<=8;i++)await send('touchMove',[[x-20-i*3,y,1],[x+20+i*3,y,2]]);await send('touchEnd');await settle();
 assert.ok((await record.boundingBox()).width>before.width*1.5);assert.equal(await page.evaluate(()=>visualViewport.scale),1);await page.screenshot({path:out+'/pinch.png'});await fit();
 checks.push('native two-finger CDP pinch zooms the paper, not the browser page');
 before=await record.boundingBox();await swipe(before.x+40,before.y+22,30,35);let after=await record.boundingBox();assert.ok(after.x>before.x+20&&after.y>before.y+20);await fit();
 before=await record.boundingBox();await swipe(before.x+40,before.y+22,15,15,true);await swipe(before.x+60,before.y+40,20,20);assert.equal(await page.locator('.is-dragging').count(),0);await fit();
 checks.push('single-finger paper drag and cancellation recover');
 const scroll=await record.evaluate(sheet=>{const n=[...sheet.querySelectorAll('.u4d-scroll-region')].find(n=>n.scrollHeight>n.clientHeight+15&&n.clientHeight>5);if(!n)return null;n.dataset.mobileProbe='scroll';return {box:n.getBoundingClientRect().toJSON(),top:n.scrollTop};});assert.ok(scroll,'Long field required for scroll regression');
 before=await record.boundingBox();await swipe(scroll.box.x+scroll.box.width/2,scroll.box.y+scroll.box.height/2,0,-35);
 const top=await page.locator('[data-mobile-probe]').evaluate(n=>n.scrollTop);assert.ok(top>scroll.top);after=await record.boundingBox();assert.ok(Math.abs(before.x-after.x)<1&&Math.abs(before.y-after.y)<1);checks.push('touch swipe scrolls overflowing text without moving the paper');
 await action('date').tap();await settle();assert.ok(await date.isVisible());assert.equal(await record.isVisible(),false);await assertFit(date);await page.screenshot({path:out+'/check-in.png'});
 await date.locator('[data-day-key]').first().tap();await settle();assert.ok(await record.isVisible());assert.equal(await date.isVisible(),false);await assertFit(record);checks.push('check-in tab and history row return to the selected case');
 await page.locator('.u4d-case-settings-open').tap();const dialog=page.locator('.u4d-case-settings');
 assert.notEqual(await page.evaluate(()=>document.activeElement.tagName),'INPUT');assert.equal(await dialog.locator('[name=writer]').evaluate(n=>getComputedStyle(n).fontSize),'16px');
 await page.screenshot({path:out+'/settings.png'});await dialog.locator('[name=writer]').tap();await page.setViewportSize({width:375,height:420});await settle();
 const d=await dialog.boundingBox();assert.ok(d.y>=0&&d.y+d.height<=420);await page.screenshot({path:out+'/short-viewport-settings.png'});
 await dialog.locator('header button').tap();await page.setViewportSize({width:375,height:812});await settle();checks.push('settings do not autofocus a text input, 16px fields, dialog fits reduced viewport');
 await action('close').tap();assert.equal(await page.locator('#u4d-inspection-root').isVisible(),false);await page.locator('#u4d-status-launcher').tap();await settle();await assertFit(record);
 await page.setViewportSize({width:1280,height:900});await settle();assert.ok(await record.isVisible()&&await date.isVisible());assert.equal(await action('fit').isVisible(),false);checks.push('close/reopen and return to desktop two-sheet layout');
 assert.deepEqual(errors,[]);const result={passed:true,host,browser:await browser.version(),checks,sizes,errors};await writeFile(out+'/results.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}catch(e){await page.screenshot({path:out+'/failure.png'}).catch(()=>{});throw e;}finally{await browser.close();}
