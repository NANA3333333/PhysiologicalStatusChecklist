import {pathToFileURL,fileURLToPath} from 'node:url';
import {readFile,writeFile} from 'node:fs/promises';
import {PAPER_CREASE_MAP_SVG,PAPER_WEAR_MAP_SVG} from '../paper-surface.js';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright-core');
const paper=await readFile(new URL('../assets/worn-paper-generated-v1.png',import.meta.url));
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage();
 const maps=await page.evaluate(async ({crease,wear,paper})=>{
  const image=async src=>{const i=new Image();i.src=src;await i.decode();return i;};
  const canvas=document.createElement('canvas');canvas.width=840;canvas.height=1120;
  const ctx=canvas.getContext('2d');
  ctx.drawImage(await image(crease),0,0,840,1120);
  const displacement=canvas.toDataURL('image/png').split(',')[1];
  ctx.clearRect(0,0,840,1120);
  ctx.drawImage(await image(paper),0,0,840,1120);
  // Equivalent to the former CSS mask-composite: intersect. Only alpha matters.
  ctx.globalCompositeOperation='destination-in';
  ctx.drawImage(await image(wear),0,0,840,1120);
  ctx.globalCompositeOperation='source-in';ctx.fillStyle='white';ctx.fillRect(0,0,840,1120);
  return {displacement,inkMask:canvas.toDataURL('image/png').split(',')[1]};
 },{crease:PAPER_CREASE_MAP_SVG,wear:PAPER_WEAR_MAP_SVG,paper:'data:image/png;base64,'+paper.toString('base64')});
 for(const [key,name] of [['displacement','crease-displacement-v1.png'],['inkMask','paper-ink-mask-v1.png']]){
  await writeFile(fileURLToPath(new URL('../assets/'+name,import.meta.url)),Buffer.from(maps[key],'base64'));
 }
 console.log('Built 840 x 1120 crease displacement and combined paper/wear alpha maps.');
}finally{await browser.close();}
