import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCaseDirectives,validateCaseDesign,normalizeCaseSettings,findQuote,caseProfile } from './case-protocol.js';
import { detachChatStatus,readTimeline,getStatusBlocks } from './status-store.js';
import { buildStatusPrompt,cleanChatCompletion,cleanTextCompletion,splitStatusText } from './status-prompt.js';
const fields={observationNote:'触碰后回缩。仍然冰冷。仍然冰冷。',care:'覆盖薄毯。'};
const ink=(type='blur',extra={})=>({field:'observationNote',quote:'仍然冰冷。',type,amount:.6,...extra});
const stain=(variant,extra={})=>({field:'observationNote',quote:'仍然冰冷。',variant,position:'after',...extra});
const protocol=parts=>`[STATUS: 记录者=林医生 | 受检者=Orion | 观察补记=${fields.observationNote} | 处置=${fields.care} | ${parts.join(' | ')}]`;
const entry=(key,value)=>`${key}=${JSON.stringify(value)}`;

test('different stains coexist, duplicate material suppressed, repeated ink allowed',()=>{
 const design=validateCaseDesign(parseCaseDirectives(protocol([
  entry('笔迹',ink()),entry('笔迹',ink()),entry('笔迹',ink('enlarge',{scale:1.5})),
  entry('血迹',stain('drops')),entry('血迹',stain('smear',{occurrence:2})),entry('血迹',stain('drops',{quote:'触碰后回缩。'})),
  entry('水渍',stain('rain')),entry('水渍',stain('spill')),entry('水渍',stain('rain')),
 ])),fields);
 assert.equal(design.marks.filter(m=>m.kind==='ink').length,3);
 assert.deepEqual(design.marks.filter(m=>m.kind!=='ink').map(m=>`${m.kind}:${m.variant}`),['blood:drops','blood:smear','water:rain','water:spill']);
 assert.equal(design.warnings.length,2);
});
test('quote occurrence is exact; an invalid anchor does not reserve its material',()=>{
 assert.deepEqual(findQuote(fields.observationNote,'仍然冰冷。',2),{start:11,end:16});
 assert.equal(findQuote(fields.observationNote,'冰 冷',1),null);
 const plan=validateCaseDesign(parseCaseDirectives(protocol([entry('血迹',stain('drops',{quote:'不存在'})),entry('血迹',stain('drops'))])),fields);
 assert.equal(plan.marks.length,1);assert.match(plan.warnings[0],/无法定位/);
});
test('unknown fonts/fields/assets and malformed objects are rejected, numeric values bounded',()=>{
 const plan=parseCaseDirectives(protocol([
  '笔迹={bad}',entry('笔迹',ink('font',{font:'https://evil/font'})),entry('笔迹',ink('blur',{field:'__proto__'})),entry('血迹',stain('../x.png')),
  entry('血迹',stain('drops',{size:999,opacity:9,dx:999})),entry('笔迹',ink('tilt',{angle:-999})),entry('书写',{font:'system',size:100,blur:10}),
 ]));
 assert.equal(plan.warnings.length,4);assert.equal(plan.marks.length,2);
 assert.equal(plan.marks[0].size,180);assert.equal(plan.marks[0].opacity,1);assert.equal(plan.marks[0].dx,60);assert.equal(plan.marks[1].angle,-30);
 assert.deepEqual(plan.style,{font:'system',size:18,blur:1});
 assert.equal(parseCaseDirectives('[STATUS: 记录者=林医生 | 受检者=Orion').present,false);
 assert.equal(parseCaseDirectives(' \n[STATUS: 记录者=林医生 | 受检者=Orion] \n').writer,'林医生');
});
test('case fields remain detached across persistence, swipes and downstream prompt cleanup',()=>{
 const raw=protocol([entry('血迹',stain('drops')),entry('笔迹',ink('scribble'))]);
 const messages=[{is_user:true,mes:'医生检查了 Orion。'},{name:'Orion',mes:`正文。\n${raw}`,swipe_id:0,swipes:[`正文。\n${raw}`,'另一条正文。\n[STATUS: 体温=正常]']}];
 detachChatStatus(messages);assert.equal(messages[1].mes,'正文。');assert.ok(getStatusBlocks(messages[1])[0].includes('drops'));
 const profile={...caseProfile({writer:'林医生',patient:'Orion'}),explicitPatient:true};
 const saved=JSON.parse(JSON.stringify(messages));const result=readTimeline(saved,()=>true,profile);
 assert.equal(result.current.caseDesign.marks.length,2);assert.equal(result.current.caseDesign.writer,'林医生');
 assert.equal(readTimeline(saved,()=>true,{...profile,patient:'他人'}).snapshots.length,0);
 const contract=buildStatusPrompt(profile),chat=[{role:'system',content:contract},{role:'assistant',content:`正文。\n${raw}`}];
 cleanChatCompletion({chat},contract);assert.equal(chat[0].content,contract);assert.equal(chat[1].content,'正文。');
 const text={prompt:contract+'\n'+raw};cleanTextCompletion(text,contract);assert.equal(text.prompt,contract);
 saved[1].mes='编辑过的正文。';detachChatStatus(saved);assert.equal(readTimeline(saved,()=>true,profile).snapshots.length,0);
});
test('changing the writer/subject starts a fresh case; effects never accumulate across replies',()=>{
 const messages=[{mes:'第一份。'+protocol([entry('血迹',stain('drops'))])},{mes:'第二份。[STATUS: 记录者=护士 | 受检者=Other | 身体=清醒]'}];
 detachChatStatus(messages);const {current,snapshots}=readTimeline(messages);
 assert.equal(snapshots[0].status.caseDesign.marks.length,1);assert.equal(current.caseDesign.marks.length,0);
 assert.equal(current.observationNote,'');assert.equal(current.caseDesign.patient,'Other');
});
test('settings are scoped, bounded and accept only known values',()=>{
 const a=normalizeCaseSettings({writer:' 医生\n[STATUS: a] ',font:'constructor',fontSize:300,printScale:500,blood:false,autoStyle:false});
 assert.equal(a.font,'yozai');assert.equal(a.fontSize,18);assert.equal(a.printScale,130);assert.equal(a.blood,false);assert.equal(a.autoStyle,false);assert.doesNotMatch(a.writer,/[\[\]\n]/);
 assert.equal(normalizeCaseSettings().writer,'');assert.equal(normalizeCaseSettings().blood,true);
});

test('JSON brackets, erroneous arrays and incomplete structures stay out of narrative',()=>{
 for(const raw of [
  '[STATUS: 身体=清醒 | 笔迹={"quote":"方括号]仍是字段","type":"blur"}]',
  '[STATUS: 血迹=[{"variant":"drops"},{"variant":"smear"}] | 受检者=Orion]',
  '[STATUS: 身体=字段专用 | 笔迹={"quote":"字符串未完成]',
  '[STATUS: 身体=字段专用 | 笔迹={"quote":"括号未完成" ]',
 ]){
  const message={mes:'正文。\n'+raw};detachChatStatus([message]);assert.equal(message.mes,'正文。');assert.deepEqual(getStatusBlocks(message),[raw]);
 }
 const valid='[STATUS: 身体=清醒 | 笔迹={"quote":"含\\\"转义引号]","type":"blur"}]';
 assert.equal(splitStatusText('正文。'+valid+'后续正文。').body,'正文。后续正文。');
 assert.equal(parseCaseDirectives('[STATUS: 记录者=医生 | 受检者=Orion | 笔迹={"quote":"未完]').present,false);
});
