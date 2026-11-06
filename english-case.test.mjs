import test from 'node:test';
import assert from 'node:assert/strict';
import {englishCaseFixture} from './tests/case-fixture.mjs';
import {detachChatStatus,readTimeline} from './status-store.js';
import {buildStatusPrompt,cleanChatCompletion} from './status-prompt.js';
import {getMatchedChecklistOptions,CHECKLIST_FIELDS} from './status-fields.js';
import {EN_CHECKLIST} from './case-language.js';
import {findStatusUpdates,getStoryDayKey} from './status-parser.js';
import {inkSamples} from './handwriting.js';
import {normalizeCaseSettings,parseCaseDirectives} from './case-protocol.js';

test('English case aliases, anchors, subject and prompt isolation',()=>{
 const chat=[{name:'Orion',mes:englishCaseFixture()}];detachChatStatus(chat);
 const result=readTimeline(chat).current;
 assert.equal(result.date,'Day 3, evening');assert.equal(getStoryDayKey(result.date),'story:3');
 assert.equal(result.caseDesign.writer,'Dr. Lin');assert.equal(result.caseDesign.style.font,'kalam');
 assert.equal(result.caseDesign.marks.length,9);assert.deepEqual(result.caseDesign.warnings,[]);
 assert.equal(findStatusUpdates('[STATUS: touchTolerance=Accepts touch | selfCare=Independent | muscleTone=Normal]')[0].updates.touchTolerance,'Accepts touch');
 const contract=buildStatusPrompt({language:'en'}),request={chat:[{role:'system',content:contract},{role:'assistant',content:englishCaseFixture()}]};
 cleanChatCompletion(request,contract);assert.equal(request.chat[0].content,contract);assert.doesNotMatch(request.chat[1].content,/STATUS|"variant"|slight tremor/);
 assert.doesNotMatch(contract,/[\u4e00-\u9fff]/u);assert.equal(normalizeCaseSettings({language:'en'}).font,'kalam');
});
test('English checklist choices respect negation and word boundaries',()=>{
 for(const [key,[,choices]]of Object.entries(EN_CHECKLIST))for(const [i,choice]of choices.entries())assert.deepEqual(getMatchedChecklistOptions(key,choice),[CHECKLIST_FIELDS[key].options[i][0]],`${key}: ${choice}`);
 assert.deepEqual(getMatchedChecklistOptions('circulation','Stable'),['稳定']);
 assert.deepEqual(getMatchedChecklistOptions('stability','Unstable'),['不稳定']);
 assert.deepEqual(getMatchedChecklistOptions('circulation','Not stable'),[]);
 assert.deepEqual(getMatchedChecklistOptions('pain','No obvious pain'),['无明显']);
 assert.deepEqual(getMatchedChecklistOptions('pain','No severe pain, but mild tenderness'),['轻微']);
 assert.deepEqual(getMatchedChecklistOptions('breathing','Abnormal'),['异常']);
});
test('English word units preserve text, punctuation, accents and mixed CJK',()=>{
 const input="Patient's left forearm. café 若彤👩‍⚕️";
 const units=inkSamples(input,'test',true);
 assert.equal(units.map(x=>x.char).join(''),input);
 assert.ok(units.some(x=>x.char==='forearm'));assert.ok(units.some(x=>x.char==="Patient's"));assert.ok(units.some(x=>x.char==='👩‍⚕️'));
 assert.deepEqual(inkSamples(input,'test',true),units);
 const malformed=parseCaseDirectives('[STATUS: writer=Dr. Lin | blood=[{"variant":"drops"}]]');assert.equal(malformed.marks.length,0);assert.equal(malformed.warnings.length,1);
});
