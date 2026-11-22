import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname,resolve,basename} from 'node:path';
import {createApp} from '../server/index.mjs';
import {normalizeProvider,publicProvider,requestProvider,validateEndpoint} from '../server/provider.mjs';
import {sampleConfig} from '../server/defaults.mjs';
import {generatePlan,validateInput} from '../server/scheduler.mjs';
const custom=()=>({provider:'custom',protocol:'chat-completions',endpoint:'https://model.example/v1/chat/completions',model:'test-model',apiKey:'test-secret',structuredOutputs:false});
async function fixture(t,fetchImpl){
  const dir=await mkdtemp(join(tmpdir(),'studyflow-features-'));let server,origin;
  const start=async()=>{server=await createApp({dataDir:dir,env:{},fetchImpl:fetchImpl||(async()=>{throw new Error('Network disabled');})});await new Promise(r=>server.listen(0,'127.0.0.1',r));origin=`http://127.0.0.1:${server.address().port}`;};
  const stop=async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));};
  t.after(async()=>{await stop();assert.equal(dirname(resolve(dir)),resolve(tmpdir()));assert.ok(basename(dir).startsWith('studyflow-features-'));await rm(dir,{recursive:true,force:true});});await start();
  return {dir,restart:async()=>{await stop();await start();},req:async(path,method='GET',body)=>{const r=await fetch(origin+path,{method,headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,body:await r.json()};}};
}
test('endpoint validation accepts explicit secure/local destinations and rejects credentials and unsafe transports',()=>{
  for(const url of ['https://model.example/v1/chat/completions','http://localhost:11434/v1/chat/completions','http://127.0.0.1:8080/v1/responses','http://[::1]:8080/v1/responses'])assert.equal(typeof validateEndpoint(url),'string');
  for(const url of ['file:///secret','http://example.com/api','https://key:secret@example.com/api','https://example.com/api?key=secret','https://example.com/api#secret','http://2130706433/api'])assert.throws(()=>validateEndpoint(url));
});
test('keys are masked, preserved only for same destination, and explicitly removable',()=>{
  const previous=normalizeProvider(custom());assert.equal(publicProvider(previous).apiKey,undefined);
  assert.equal(normalizeProvider({...custom(),apiKey:''},previous).apiKey,'test-secret');
  assert.equal(normalizeProvider({...custom(),endpoint:'https://different.example/api',apiKey:''},previous).apiKey,'');
  assert.equal(normalizeProvider({...custom(),apiKey:'',clearApiKey:true},previous).apiKey,'');
});
test('custom Chat Completions uses supplied URL, Bearer header and prompt schema fallback',async()=>{
  let called;const r=await requestProvider({provider:custom(),instructions:'Rules',input:'Task',schema:{type:'object'},fetchImpl:async(url,options)=>{called={url,...options,body:JSON.parse(options.body)};return {ok:true,json:async()=>({choices:[{finish_reason:'stop',message:{content:'{"ok":true}'}}]})};}});
  assert.equal(called.url,custom().endpoint);assert.equal(called.headers.Authorization,'Bearer test-secret');assert.equal(called.redirect,'error');assert.match(called.body.messages[0].content,/schema/);assert.equal(called.body.response_format,undefined);assert.equal(r.rawOutput,'{"ok":true}');
});
test('custom strict schema and keyless localhost requests are supported',async()=>{
  let body,auth;await requestProvider({provider:{...custom(),endpoint:'http://127.0.0.1:11434/v1/chat/completions',apiKey:'',structuredOutputs:true},instructions:'Rules',input:'Task',schema:{type:'object'},fetchImpl:async(_,o)=>{body=JSON.parse(o.body);auth=o.headers.Authorization;return {ok:true,json:async()=>({choices:[{message:{content:'{}'},finish_reason:'stop'}]})};}});
  assert.equal(auth,undefined);assert.equal(body.response_format.json_schema.strict,true);
});
test('provider refusal/truncation/network errors do not expose provider error bodies',async()=>{
  await assert.rejects(requestProvider({provider:custom(),instructions:'',input:'',fetchImpl:async()=>({ok:false,status:401,json:async()=>({error:'test-secret'})})}),e=>/HTTP 401/.test(e.message)&&!e.message.includes('test-secret'));
  await assert.rejects(requestProvider({provider:custom(),instructions:'',input:'',fetchImpl:async()=>({ok:true,json:async()=>({choices:[{finish_reason:'length',message:{content:'{}'}}]})})}),/incomplete/);
});
test('provider API persists privately, never sends a request on save, and survives restart',async t=>{
  let calls=0;const app=await fixture(t,async()=>{calls++;return {ok:true,json:async()=>({choices:[{finish_reason:'stop',message:{content:'OK'}}]})};});
  const r=await app.req('/api/provider','PUT',custom());assert.equal(r.status,200);assert.equal(calls,0);assert.equal(r.body.settings.hasApiKey,true);assert.ok(!JSON.stringify(r.body).includes('test-secret'));
  assert.ok(!(await readFile(join(app.dir,'state.json'),'utf8')).includes('test-secret'));await app.restart();assert.equal((await app.req('/api/provider')).body.settings.configured,true);
  assert.equal((await app.req('/api/provider/test','POST',{})).body.ok,true);assert.equal(calls,1);
  assert.ok(!JSON.stringify((await app.req('/api/state')).body).includes('test-secret'));
});
test('custom provider drives both timetable generation and chat through selected endpoint',async t=>{
  let kind='plan',plan,seen=[];const app=await fixture(t,async(url,o)=>{seen.push(url);return {ok:true,json:async()=>({choices:[{finish_reason:'stop',message:{content:kind==='plan'?JSON.stringify({sessions:plan.sessions,warnings:[]}):JSON.stringify({reply:'Your saved settings are ready.',actions:[]})}}]})};});
  const config=sampleConfig();await app.req('/api/config','PUT',config);plan=generatePlan(validateInput(config));await app.req('/api/provider','PUT',custom());
  const result=await app.req('/api/generate','POST',{mode:'ai',promptVersion:'v3'});assert.equal(result.status,200);assert.equal(result.body.plan.source,'custom');kind='chat';
  const chat=await app.req('/api/chat','POST',{mode:'ai',message:'Summarize my settings'});assert.equal(chat.status,200);assert.match(chat.body.chat.messages.at(-1).text,/saved settings/);assert.ok(seen.every(url=>url===custom().endpoint));
  assert.ok(!JSON.stringify((await app.req('/api/export?format=json')).body).includes('test-secret'));
});
test('syllabus upload API previews only and then reviewed topics drive the saved timetable',async t=>{
  const app=await fixture(t);const before=(await app.req('/api/state')).body;
  const upload=await app.req('/api/syllabus/extract','POST',{filename:'logic.txt',base64:Buffer.from('Syllabus\n1. Propositions\n2. Truth tables\n3. Inference').toString('base64')});
  assert.equal(upload.status,200);assert.deepEqual(upload.body.topics,['Propositions','Truth tables','Inference']);assert.deepEqual((await app.req('/api/state')).body,before);
  const c=sampleConfig();c.subjects[0].topics=upload.body.topics;assert.equal((await app.req('/api/config','PUT',c)).status,200);
  const generated=await app.req('/api/generate','POST',{mode:'engine',promptVersion:'v3'});assert.equal(generated.status,200);assert.ok(generated.body.plan.sessions.filter(s=>s.subjectId===c.subjects[0].id).every(s=>upload.body.topics.includes(s.topic)));
});
test('invalid uploads and invalid provider settings preserve existing planner state',async t=>{
  const app=await fixture(t);const before=(await app.req('/api/state')).body;
  assert.equal((await app.req('/api/syllabus/extract','POST',{filename:'fake.pdf',base64:Buffer.from('not a pdf').toString('base64')})).status,422);
  assert.equal((await app.req('/api/provider','PUT',{...custom(),endpoint:'http://remote.example/api'})).status,400);
  assert.deepEqual((await app.req('/api/state')).body,before);
});
