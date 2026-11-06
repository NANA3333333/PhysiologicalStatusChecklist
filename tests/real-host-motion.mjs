import {pathToFileURL} from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright-core');
import {mkdir,writeFile,readFile} from 'node:fs/promises';
const avatar=process.env.QA_AVATAR,host=process.env.QA_HOST||'http://127.0.0.1:8001/';
if(!avatar)throw Error('Set QA_AVATAR to an existing character avatar filename; no fixture is written.');
const out=process.env.QA_OUTPUT||'../motion-flicker-evidence/capture';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,channel:'chrome'}),page=await browser.newPage({viewport:{width:2000,height:1900}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('**/*',async route=>{
 const req=route.request(),url=new URL(req.url());
 if(url.pathname==='/api/chats/get'&&req.postDataJSON()?.avatar_url!==avatar)return route.fulfill({status:200,contentType:'application/json',body:'[]'});
 if(!['GET','HEAD'].includes(req.method())){
  const readOnly=/\/(get|all|list|read|recent|search|stats|discover|version|status|count|view|getstats|getall|get-state|check|find|query)$/i.test(url.pathname)||url.pathname.startsWith('/api/tokenizers/');
  if(!readOnly||/generate|completions/.test(url.pathname))return route.fulfill({status:200,contentType:'application/json',body:'{}'});
 }
 await route.continue();
});
const timeout=setTimeout(()=>{void browser.close();},720000);
try{
 await page.goto(host,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.SillyTavern?.getContext().characters.length&&document.querySelector('#u4d-status-launcher'),null,{timeout:90000});
 console.log('host ready');
 await page.evaluate(avatar=>{const c=SillyTavern.getContext(),id=c.characters.findIndex(x=>x.avatar===avatar);if(id<0)throw Error('Missing character');void c.selectCharacterById(id).catch(console.error);},avatar);
 await page.waitForFunction(avatar=>{const c=SillyTavern.getContext();return c.characters[c.characterId]?.avatar===avatar&&c.chat.length>0&&!document.querySelector('#u4d-status-launcher').hidden;},avatar);
 await page.evaluate(()=>document.querySelector('#cpgl_tour_skip')?.click());
 await page.locator('#u4d-status-launcher').click();
 await page.evaluate(async()=>{await document.fonts.ready;});
 await page.locator('.u4d-paper-imprint').evaluateAll(async ns=>{for(const n of ns){const src=getComputedStyle(n).maskImage.slice(5,-2);if(!src.includes('/UnknownFourDimensionalStatusPanel/assets/paper-ink-mask-v1.png'))throw Error('Incorrect deployed mask path: '+src);const image=new Image();image.src=src;await image.decode();}});
 const records=[],castFrames=[],castWrites=[];let currentFrame;
 const cdp=process.env.MOTION_VIDEO?await page.context().newCDPSession(page):null;
 if(cdp){
  cdp.on('Page.screencastFrame',event=>{
   void cdp.send('Page.screencastFrameAck',{sessionId:event.sessionId}).catch(()=>{});
   if(!currentFrame||castFrames.length>=1500)return;
   const file=`cast-${String(castFrames.length).padStart(4,'0')}.jpg`;
   castFrames.push({file,...currentFrame,timestamp:event.metadata.timestamp,deviceWidth:event.metadata.deviceWidth,deviceHeight:event.metadata.deviceHeight});
   castWrites.push(writeFile(out+'/'+file,Buffer.from(event.data,'base64')));
  });
  await cdp.send('Page.startScreencast',{format:'jpeg',quality:95,maxWidth:2000,maxHeight:1900,everyNthFrame:3});
 }
 async function capture(sheet,label,i){
  const box=await sheet.boundingBox();const clip={x:Math.max(0,box.x),y:Math.max(0,box.y),width:Math.min(box.width,2000-Math.max(0,box.x)),height:Math.min(box.height,1900-Math.max(0,box.y))};
  const file=`${label}-${String(i).padStart(2,'0')}.png`;
  currentFrame={box,label,i};
  await page.screenshot({clip,path:out+'/'+file,timeout:15000});records.push({file,box});
 }
 const cycles=Math.max(1,Math.min(4,Number(process.env.MOTION_REPEAT)||1));
 for(const type of ['record','date'])for(let cycle=0;cycle<cycles;cycle++){
  const prefix=type+(cycles>1?'-run'+cycle:'');
  const sheet=page.locator(type==='date'?'.u4d-date-sheet':'.u4d-exam-sheet:not(.u4d-date-sheet)');
  const start=await sheet.boundingBox();
  await page.mouse.move(start.x+60,start.y+20);await page.mouse.down();await page.mouse.move(100,55,{steps:5});await page.mouse.up();
  let b=await sheet.boundingBox();await page.mouse.move(b.x+60,b.y+20);await page.mouse.down();
  for(let i=0;i<24;i++){await page.mouse.move(100+i*6,55+Math.sin(i*.5)*20);await capture(sheet,prefix+'-drag',i);}
  await page.mouse.up();
  b=await sheet.boundingBox();await page.mouse.move(b.x+60,b.y+20);await page.mouse.down();await page.mouse.move(100,55,{steps:3});await page.mouse.up();
  b=await sheet.boundingBox();await page.mouse.move(b.x+60,b.y+20);
  for(let i=0;i<28;i++){await page.mouse.wheel(0,i<14?-100:100);await capture(sheet,prefix+'-zoom',i);}
  for(let i=0;i<8;i++){await capture(sheet,prefix+'-idle',i);await page.waitForTimeout(150);}
  console.log(prefix,'motion recorded');
  await writeFile(out+'/partial.json',JSON.stringify({complete:false,errors,records,castFrames}));
 }
 const version=await page.evaluate(async()=>(await fetch('/scripts/extensions/third-party/UnknownFourDimensionalStatusPanel/manifest.json').then(r=>r.json())).version);
 if(cdp){await cdp.send('Page.stopScreencast');await Promise.all(castWrites);}
 const maps=await page.locator('.u4d-paper-filter-defs feImage').evaluateAll(ns=>ns.map(n=>n.getAttribute('href')));
 await writeFile(out+'/report.json',JSON.stringify({complete:true,version,browser:await browser.version(),maps,masks:await page.locator('.u4d-paper-imprint').evaluateAll(ns=>ns.map(n=>getComputedStyle(n).maskImage)),errors,records,castFrames},null,2));
 console.log(JSON.stringify({version,frames:records.length,errors}));
}catch(error){console.log(JSON.stringify({errors,stage:'failed'}));throw error;}finally{clearTimeout(timeout);await browser.close();}
