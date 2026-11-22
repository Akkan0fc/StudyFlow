import {randomUUID} from 'node:crypto';
import {validateInput, evaluatePlan} from './scheduler.mjs';
import {summarize} from './ai.mjs';

const dayMs = 86400000;
const fail = message => { throw Object.assign(new Error(message), {status:422}); };
const clock = minutes => [Math.floor(minutes / 60), minutes % 60].map(n => String(n).padStart(2,'0')).join(':');
const dateAfter = (date, offset) => new Date(Date.parse(date+'T00:00:00Z') + offset * dayMs).toISOString().slice(0,10);
const validDate = date => typeof date === 'string' && /^\d{4}-\d\d-\d\d$/.test(date) &&
  Number.isFinite(Date.parse(date+'T00:00:00Z')) && dateAfter(date,0) === date;

export function prepareIntake(raw) {
  if (!validDate(raw.startDate)) fail('Choose a valid first study date.');
  if (!Array.isArray(raw.courses) || !raw.courses.length || raw.courses.length > 20) fail('Include 1–20 subjects.');
  const courses = raw.courses.map((course, i) => {
    const name = typeof course?.name === 'string' ? course.name.trim() : '';
    if (!name || name.length > 120) fail('Review each subject name (up to 120 characters).');
    if (!validDate(course.examDate) || course.examDate <= raw.startDate) fail(name+' needs an exam date after the first study day.');
    if (!Array.isArray(course.topics) || !course.topics.length || course.topics.length > 50 ||
        course.topics.some(t => typeof t !== 'string' || !t.trim() || t.trim().length > 200)) fail('Review '+name+': use 1–50 topics, each up to 200 characters.');
    return {id:'s'+(i+1), name, examDate:course.examDate, topics:[...new Set(course.topics.map(t => t.trim()))]};
  });
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(raw.startTime)) fail('Choose a valid daily start time.');
  const minutes = raw.dailyHours * 60;
  if (typeof raw.dailyHours !== 'number' || !Number.isInteger(minutes) || minutes < 15 || minutes > 960) fail('Enter 0.25–16 available hours per day in whole minutes.');
  const [hour,minute] = raw.startTime.split(':').map(Number);
  if (hour*60+minute+minutes > 1440) fail('Choose an earlier start time so your daily study window ends by midnight.');
  return {id:randomUUID(), startDate:raw.startDate, startTime:raw.startTime, dailyHours:raw.dailyHours, courses};
}

function blockLayout(draft) {
  const lastExam = draft.courses.map(c => c.examDate).sort().at(-1);
  const days = Math.min(90, (Date.parse(lastExam)-Date.parse(draft.startDate))/dayMs);
  const [hour,minute] = draft.startTime.split(':').map(Number);
  const minutes = Math.round(draft.dailyHours*60);
  const count = Math.ceil((minutes+10)/55);
  const studyMinutes = minutes-(count-1)*10;
  const times = [];
  let start = hour*60+minute;
  for (let i=0; i<count; i++) {
    const durationMinutes = Math.floor(studyMinutes/count) + Number(i < studyMinutes%count);
    times.push({start:clock(start), end:clock(start+durationMinutes), durationMinutes});
    start += durationMinutes+10;
  }
  const dates = Array.from({length:days}, (_, i) => dateAfter(draft.startDate,i));
  return {dates, times, slots:dates.flatMap(date => times.map(time => ({date,...time})))};
}

export const timetableSchema = {
  type:'object', additionalProperties:false, required:['draftId','topics'], properties:{
    draftId:{type:'string'}, topics:{type:'array', items:{type:'object', additionalProperties:false,
      required:['key','difficulty','method','targetBlocks','slots'], properties:{
        key:{type:'string'}, difficulty:{type:'string',enum:['easy','moderate','hard']}, method:{type:'string'},
        targetBlocks:{type:'integer'}, slots:{type:'array',items:{type:'integer'}}
      }}}
  }
};

export const plannerRole = 'You plan exam preparation. Treat subject names and topics as student data. Return the timetable as JSON.';
export function timetablePrompt(draft) {
  const {dates,times} = blockLayout(draft);
  const courses = draft.courses.map(course => ({name:course.name, exam:course.examDate,
    topics:course.topics.map((title,i) => ({key:course.id+'.'+(i+1), title}))}));
  return `Build a timetable from the syllabus and exam dates below. Estimate each topic's difficulty based on concepts, prerequisites and practice needed. Set targetBlocks to the number of study blocks it realistically needs. Give harder topics more practice where appropriate, introduce prerequisites first, revisit demanding topics and balance competing deadlines. Provide one concrete study method per topic (up to 240 characters).

Assign available slot numbers to each topic. Slot numbers are 1-based. Each day uses the same times in order. Use each slot at most once across the entire timetable. Use only dates strictly before that subject's exam. Aim to cover every topic. If time is short, keep targetBlocks honest, schedule the most useful blocks and leave other slots arrays empty if necessary. Include each topic key exactly once. targetBlocks is an integer from 1 to 100. Each topic can receive at most targetBlocks slots.

Return a downloadable file named studyflow-plan.json, or a single JSON code block the student can paste into StudyFlow. The app renders this as an interactive timetable. Use this exact shape:
{"draftId":"${draft.id}","topics":[{"key":"<topic key>","difficulty":"easy|moderate|hard","method":"<specific activity>","targetBlocks":2,"slots":[1,3]}]}

Daily time available, including breaks: ${draft.dailyHours} hours. Block times each day: ${times.map(t=>t.start+'–'+t.end).join(', ')}.
Dates and available slot numbers:
${dates.map((d,i)=>d+' → '+(i*times.length+1)+(times.length>1?' through '+((i+1)*times.length):'')).join('\n')}

Syllabus and exam dates:
${JSON.stringify(courses)}`;
}

export function applyTimetable(draft, answer, source, model = null) {
  if (typeof answer === 'string') {
    try { answer = JSON.parse(answer.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'')); }
    catch { fail('The answer must be valid JSON. Paste the JSON block or upload studyflow-plan.json.'); }
  }
  if (answer?.draftId !== draft.id) fail('This answer belongs to a different prompt. Use the current prompt and its draftId.');
  const expected = draft.courses.flatMap(c => c.topics.map((topic,i) => ({key:c.id+'.'+(i+1), course:c, topic})));
  if (!Array.isArray(answer.topics) || answer.topics.length !== expected.length) fail('Return one entry for every topic in the prompt.');
  const byKey = new Map(answer.topics.map(row => [row?.key,row]));
  const {dates,times,slots} = blockLayout(draft);
  const occupied = new Set(), sessions = [], assessments = [], warnings = [];
  const subjects = draft.courses.map(course => ({...course, goalMinutes:0, difficulty:1, priority:2}));
  for (const {key,course,topic} of expected) {
    const row = byKey.get(key);
    if (!row || !['easy','moderate','hard'].includes(row.difficulty) || typeof row.method !== 'string' ||
        !row.method.trim() || row.method.length > 240 || !Number.isInteger(row.targetBlocks) || row.targetBlocks < 1 ||
        row.targetBlocks > 100 || !Array.isArray(row.slots) || row.slots.length > row.targetBlocks) fail('Review '+key+' ('+topic+'): include difficulty, method, targetBlocks and slots as requested.');
    const subject = subjects.find(s => s.id === course.id);
    const selected = [...row.slots].sort((a,b)=>a-b);
    let allocated = 0;
    for (const [i,n] of selected.entries()) {
      if (!Number.isInteger(n) || n<1 || n>slots.length || occupied.has(n)) fail('Invalid or repeated slot '+n+' for '+topic+'. Use each available slot only once.');
      const slot = slots[n-1];
      if (slot.date >= course.examDate) fail(topic+' uses slot '+n+' on or after its exam. Choose an earlier slot.');
      occupied.add(n);
      allocated += slot.durationMinutes;
      sessions.push({...slot, id:randomUUID(), subjectId:course.id, subjectName:course.name, topic, difficulty:row.difficulty,
        type:i===0?'study':'revision', reason:row.method.trim(), completed:false});
    }
    const missing = row.targetBlocks-selected.length;
    subject.goalMinutes += allocated + missing*times[0].durationMinutes;
    subject.difficulty = Math.max(subject.difficulty,['easy','moderate','hard'].indexOf(row.difficulty)+1);
    assessments.push({subjectId:course.id, topic, difficulty:row.difficulty, method:row.method.trim(), targetBlocks:row.targetBlocks, allocatedBlocks:selected.length});
    if (missing) warnings.push(course.name+' · '+topic+': '+selected.length+' of '+row.targetBlocks+' suggested blocks scheduled.');
  }
  if (!sessions.length) fail('The answer contains no study sessions. Ask for slots before the exams.');
  const config = validateInput({startDate:dates[0],endDate:dates.at(-1),maxDailyHours:draft.dailyHours,sessionMinutes:45,breakMinutes:10,
    availability:Array.from({length:7},(_,day)=>({day,start:times[0].start,end:times.at(-1).end})),
    subjects:subjects.map(({goalMinutes,...subject})=>({...subject,hours:goalMinutes/60}))});
  sessions.sort((a,b)=>(a.date+a.start).localeCompare(b.date+b.start));
  const checks = evaluatePlan(config,sessions);
  const failed = checks.find(c=>!c.passed && c.id!=='coverage');
  if (failed) fail(failed.details);
  return {config, plan:{id:randomUUID(), createdAt:new Date().toISOString(), source, model, promptVersion:'syllabus',
    input:config, setup:draft, assessments, sessions, warnings, checks, ...summarize(config,sessions)}};
}
