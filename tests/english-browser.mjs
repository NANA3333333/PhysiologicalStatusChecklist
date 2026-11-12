import {pathToFileURL} from 'node:url';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright-core');
const out=process.env.QA_OUTPUT||'../english-preview-evidence';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:2200,height:1900}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
const settle=()=>page.evaluate(async()=>{await document.fonts.ready;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});
const sheet=page.locator('.u4d-exam-sheet:not(.u4d-date-sheet)');
const faces={caveat:'Caveat',kalam:'Kalam',patrickhand:'PatrickHand'};
try{
 await page.goto('http://127.0.0.1:4186/case-demo.html?v=english-fonts-9');await page.waitForFunction(()=>window.ready);
 await page.screenshot({path:out+'/font-selector.png',fullPage:true});
 await page.locator('[data-font-card=kalam]').click();await settle();
 assert.equal(await sheet.getAttribute('lang'),'en');assert.match(await sheet.locator('h2').innerText(),/Humanoid Examination/);
 assert.match(await sheet.locator('[data-u4d-field=observationNote]').innerText(),/left forearm/);
 assert.equal(await sheet.locator('[data-case-kind=blood]').count(),2);assert.equal(await sheet.locator('[data-case-kind=water]').count(),1);
 assert.equal(await sheet.locator('[data-u4d-field=temperature]').locator('..').locator('.is-checked').innerText(),'Low');
 assert.equal(await sheet.locator('.u4d-injury-marker.left-arm').count(),1);
 await page.locator('.u4d-date-sheet .u4d-sheet-close').focus();await page.keyboard.press('Enter');
 for(let i=0;i<8;i++)await page.locator('.u4d-report-stack').first().dispatchEvent('wheel',{deltaY:-100,bubbles:true});await settle();
 let box=await sheet.boundingBox();await page.mouse.move(box.x+60,box.y+55);await page.mouse.down();await page.mouse.move(100,180,{steps:5});await page.mouse.up();await page.mouse.move(0,0);
 const printed=()=>sheet.locator('.u4d-printed-option,h2,.u4d-report-section-heading strong').evaluateAll(nodes=>nodes.map(n=>{const s=getComputedStyle(n);return {text:n.textContent,font:s.fontFamily,size:s.fontSize};}));
 const original=await printed(),fonts=[],cdp=await page.context().newCDPSession(page);await cdp.send('DOM.enable');await cdp.send('CSS.enable');
 const count=await page.evaluate(()=>window.context.chat.length);
 for(const [key,family]of Object.entries(faces)){
  await page.locator('.u4d-case-toolbar [data-demo-font]').selectOption(key);await settle();
  await page.waitForFunction(k=>document.querySelector('.u4d-exam-sheet:not(.u4d-date-sheet)').style.getPropertyValue('--u4d-handwriting-font').toLowerCase().includes(k),key);
  await page.locator('.u4d-date-sheet .u4d-sheet-close').focus();await page.keyboard.press('Enter');
  const {root}=await cdp.send('DOM.getDocument');const {nodeId}=await cdp.send('DOM.querySelector',{nodeId:root.nodeId,selector:'.u4d-exam-sheet:not(.u4d-date-sheet) [data-u4d-field=body] .u4d-ink-glyph'});
  const actual=(await cdp.send('CSS.getPlatformFontsForNode',{nodeId})).fonts;
  assert.ok(actual.some(f=>f.isCustomFont&&f.familyName.replaceAll(' ','').includes(family)),`${key}: ${JSON.stringify(actual)}`);
  assert.deepEqual(await printed(),original);assert.equal(await page.evaluate(()=>window.context.chat.length),count);
  assert.equal(await sheet.locator('[data-u4d-field=observationNote] .u4d-ink-glyph').filter({hasText:/^forearm$/}).count(),1);
  await sheet.screenshot({path:`${out}/${key}-case.png`});fonts.push({key,actual});
 }
 const leftovers=await sheet.evaluate(s=>{const w=document.createTreeWalker(s,NodeFilter.SHOW_TEXT),result=[];let n;while((n=w.nextNode()))if(!n.parentElement.closest('[data-u4d-writing=true],svg')&&/[\u4e00-\u9fff]/u.test(n.textContent))result.push(n.textContent);return result;});
 console.log(JSON.stringify({fonts,printedChinese:leftovers}));
 await page.reload();await page.waitForFunction(()=>window.ready);await page.locator('#demo-open').click();await settle();
 assert.equal(await sheet.getAttribute('lang'),'en');assert.match(await sheet.locator('.u4d-ink').first().evaluate(n=>getComputedStyle(n).fontFamily),/U4DPatrickHand/);
 await page.locator('.u4d-case-settings-open').click();assert.equal(await page.locator('.u4d-case-settings h2').innerText(),'Who writes, for whom');
 await page.locator('.u4d-case-settings [name=printScale]').fill('130');
 await page.locator('.u4d-case-settings [name=writer]').fill('若彤');await page.locator('.u4d-case-settings [type=submit]').click();
 await page.keyboard.press('Escape');await page.locator('#demo-load').click();await settle();
 const overflow=await sheet.evaluate(s=>[...s.querySelectorAll('.u4d-report-column')].flatMap(column=>{const b=column.getBoundingClientRect();return [...column.querySelectorAll('.u4d-printed-option')].filter(n=>n.getBoundingClientRect().bottom>b.bottom+2).map(n=>n.textContent);}));assert.deepEqual(overflow,[],'large English print stays inside the extended paper');
 const {root}=await cdp.send('DOM.getDocument');const {nodeId}=await cdp.send('DOM.querySelector',{nodeId:root.nodeId,selector:'.u4d-exam-sheet:not(.u4d-date-sheet) [data-u4d-field=writer] .u4d-ink-glyph'});
 const fallback=(await cdp.send('CSS.getPlatformFontsForNode',{nodeId})).fonts;assert.ok(fallback.some(f=>f.isCustomFont&&f.familyName.includes('Yozai')));
 for(const width of [375,768,1280]){
  await page.setViewportSize({width,height:1100});await settle();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  const toolbar=await page.locator('.u4d-case-toolbar').boundingBox();assert.ok(toolbar.x>=0&&toolbar.x+toolbar.width<=width);
  await page.locator('.u4d-case-toolbar [data-demo-font]').selectOption('kalam');await settle();
  if(width===375)await page.screenshot({path:out+'/mobile.png'});
 }
 await page.locator('.u4d-case-toolbar [data-demo-language]').selectOption('zh');await settle();assert.equal(await sheet.getAttribute('lang'),'zh-CN');
 assert.equal(await page.evaluate(()=>window.requests.length),0);assert.deepEqual(errors,[]);
 await writeFile(out+'/results.json',JSON.stringify({passed:true,fonts,fallback,printedChinese:leftovers,errors,checks:['live preview font selection and English samples','real custom glyph rendering for three OFL fonts','printed labels unchanged by handwriting changes','English checklist and injury mapping','word layout and exact phrase marks','language/font persistence without growing sample history','CJK fallback','375/768/1280 controls and Chinese switch-back']},null,2));
}finally{await browser.close();}
