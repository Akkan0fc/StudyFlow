import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {mkdtemp, rm, writeFile, readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../server/index.mjs';
import {sampleConfig} from '../server/defaults.mjs';
import {openStore} from '../server/store.mjs';
import {matchExam} from '../public/planner-setup.js';
import {extractSyllabus} from '../server/syllabus.mjs';
import {prepareIntake,applyTimetable} from '../server/intake.mjs';

const file = (filename,text,kind) => extractSyllabus({filename,kind,base64:Buffer.from(text).toString('base64')});
const input = {startDate:'2027-02-01',startTime:'17:00',dailyHours:1,
  courses:[{name:'Algorithms',examDate:'2027-02-03',topics:['Recursion','Dynamic programming']}]};
const answer = draftId => ({draftId,topics:[
  {key:'s1.1',difficulty:'easy',method:'Trace three recursive calls.',targetBlocks:1,slots:[1]},
  {key:'s1.2',difficulty:'hard',method:'Derive a recurrence and practise memoization.',targetBlocks:4,slots:[2,3,4]}]});

test('local multi-course extraction and Indian date-sheet matching, with ambiguous dates left for review',async()=>{
  const {courses} = await file('download.md','Course title: Operating Systems\nCourse Code: CSET201\nUnit I: Paging\nCourse title: Networks\nUnit I: Routing\nExam date: 11 December 2027');
  assert.deepEqual(courses.map(c=>c.subjectName), ['Operating Systems','Networks']);
  assert.deepEqual(courses.map(c=>c.topics), [['Paging'],['Routing']]);
  assert.equal(courses[1].examDate,'2027-12-11');
  const {dates} = await file('exams.csv','Date,Paper\n10/12/2027,CSET201\n11-Dec-27,Networks\n2027-02-30,Invalid','dates');
  assert.equal(dates.length,2);
  assert.equal(matchExam({name:'Operating Systems',code:courses[0].code},dates,2),'2027-12-10');
  assert.equal(matchExam({name:'Networks'},[...dates,{date:'2027-12-13',label:'Networks'}],2),'');
});

test('weekly blocks include breaks within the daily budget and partial topic coverage is explicit',()=>{
  const draft=prepareIntake(input), {plan}=applyTimetable(draft,answer(draft.id),'web');
  assert.equal(plan.sessions.length,4);
  assert.deepEqual(plan.sessions.map(s=>s.start),['17:00','17:35','17:00','17:35']);
  assert.equal(plan.sessions[1].end,'18:00');
  assert.equal(plan.stats.unscheduledMinutes,25);
  assert.equal(plan.sessions[1].difficulty,'hard');
  assert.ok(plan.checks.every(c=>c.passed || c.id==='coverage'));
  assert.match(plan.warnings[0],/Dynamic programming/);
});

test('wrong drafts, invalid topic mappings, duplicate and post-exam slots are rejected',()=>{
  const draft=prepareIntake({...input,courses:[{...input.courses[0],examDate:'2027-02-02'},{name:'Math',examDate:'2027-02-03',topics:['Sets']}]});
  const valid=answer(draft.id); valid.topics[1].slots=[2]; valid.topics.push({key:'s2.1',difficulty:'easy',targetBlocks:1,method:'Draw a Venn diagram.',slots:[3]});
  for(const change of [r=>r.draftId='other',r=>r.topics[0].key='unknown',r=>r.topics[0].slots=[2],r=>r.topics[0].slots=[4]]) {
    const bad=structuredClone(valid);change(bad);assert.throws(()=>applyTimetable(draft,bad,'web'));
  }
  assert.throws(()=>prepareIntake({...input,startTime:'23:30'}),/midnight/);
});

async function directory(t) {
  const dir=await mkdtemp(join(tmpdir(),'studyflow-intake-'));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  return dir;
}
// Exercise the HTTP routing and store without requiring a listening network socket.
function request(app,path,body,method = body===undefined?'GET':'POST') {
  return new Promise(resolve=>{
    const req=Readable.from(body===undefined?[]:[Buffer.from(JSON.stringify(body))]);
    Object.assign(req,{method,url:path,headers:{host:'localhost','content-type':'application/json'}});
    app.emit('request',req,{writeHead(status){this.status=status;},end(text){resolve({status:this.status,body:JSON.parse(text)});}});
  });
}

test('web AI handoff survives restart, imports a timetable, tracks progress, and preserves it on failed import',async t=>{
  const dataDir=await directory(t);
  let app=await createApp({dataDir,env:{}});
  assert.deepEqual((await request(app,'/api/state')).body.config.subjects,[]);
  const prep=await request(app,'/api/intake/prepare',input);
  assert.equal(prep.status,200);assert.match(prep.body.prompt,/Dynamic programming/);
  app=await createApp({dataDir,env:{}});
  const id=(await request(app,'/api/state')).body.intake.draft.id;
  const result=await request(app,'/api/intake/import',{draftId:id,answer:'```json\n'+JSON.stringify(answer(id))+'\n```'});
  assert.equal(result.status,200);assert.equal(result.body.plan.source,'web');
  const session=result.body.plan.sessions[0];
  await request(app,'/api/sessions/'+session.id,{completed:true},'PATCH');
  const retry=await request(app,'/api/intake/prepare',input);
  assert.equal((await request(app,'/api/intake/import',{draftId:retry.body.draft.id,answer:'invalid'})).status,422);
  app=await createApp({dataDir,env:{}});
  assert.equal((await request(app,'/api/state')).body.plan.sessions[0].completed,true);
});

test('connected generation uses the provider and opens the same validated plan',async t=>{
  const dataDir=await directory(t);let id,calls=0;
  const app=await createApp({dataDir,env:{AI_MODEL:'test',OPENAI_API_KEY:'test'},fetchImpl:async(_,opts)=>{
    const payload=JSON.parse(opts.body);assert.match(payload.input,/Algorithms/);calls++;
    return {ok:true,json:async()=>({output:[{content:[{type:'output_text',text:JSON.stringify(answer(id))}]}]})};
  }});
  id=(await request(app,'/api/intake/prepare',input)).body.draft.id;
  const result=await request(app,'/api/intake/generate',{draftId:id});
  assert.equal(result.status,200);assert.equal(calls,1);assert.equal(result.body.plan.model,'test');
  assert.equal(result.body.plan.assessments[1].difficulty,'hard');
});

test('legacy demo is archived while edited subject data is retained',async t=>{
  for (const custom of [false,true]) {
    const dir=await directory(t),config=sampleConfig();
    if (custom) config.subjects[0].name='My subject';
    await writeFile(join(dir,'state.json'),JSON.stringify({schemaVersion:1,config,plan:null,experiments:[]}));
    const state=(await openStore(dir)).read();
    assert.equal(state.config.subjects.length,custom?4:0);
    assert.equal((await readdir(dir)).some(f=>f.startsWith('template-backup-')),!custom);
  }
});
