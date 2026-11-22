const courseFiles = '.pdf,.docx,.txt,.md';
const normalize = text => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();

export function matchExam(course, dates, courseCount) {
  const terms = [course.name, course.code || ''].map(normalize).filter(Boolean);
  const matches = dates.filter(row => terms.some(term => (' '+normalize(row.label)+' ').includes(' '+term+' ')));
  const candidates = [...new Set((matches.length ? matches : courseCount===1 && dates.length===1 ? dates : []).map(row=>row.date))];
  return candidates.length===1 ? candidates[0] : '';
}

export function createSetup({state, post, esc, icon, render, toast, isoDate, monday}) {
  let form, pending, dates = [], sheet = '', busy = '', error = '', answer = '', editing = false;
  function init() {
    if (form) return;
    pending = state.intake;
    const prior = pending?.draft || state.plan?.setup;
    form = prior ? structuredClone(prior) : {courses:[], dailyHours:'', startTime:'09:00', startDate:isoDate(new Date())};
    for (const course of form.courses) course.syllabusDate = course.examDate;
  }
  function matchDates() {
    form.courses.forEach(course => {
      if (!course.manualDate) course.examDate = matchExam(course,dates,form.courses.length) || course.syllabusDate || '';
    });
  }
  function upload(label, id, accept, multiple=false) {
    return `<label class="setup-upload">${icon('file',22)}<span><strong>${label}</strong><small>${accept.slice(1).replaceAll(',.',' · ').toUpperCase()} · 5 MB per file</small></span><input type="file" data-setup-file="${id}" accept="${accept}" ${multiple?'multiple':''}></label>`;
  }
  function courseCard(course,i) {
    return `<article class="setup-course" data-course="${i}">
      <div class="setup-course-heading"><label class="field"><span>Subject</span><input data-key="name" maxlength="120" required value="${esc(course.name)}"></label>
      <label class="field"><span>Exam date</span><input data-key="examDate" type="date" required value="${esc(course.examDate)}"></label>
      <button type="button" class="icon-button" data-setup-action="remove" aria-label="Remove ${esc(course.name)}">${icon('close',16)}</button></div>
      ${dates.length && !course.examDate ? `<label class="field"><span>Choose from the date sheet</span><select data-key="sheetDate"><option value="">Select an exam</option>${dates.map(row=>`<option value="${esc(row.date)}">${esc(row.label)}</option>`).join('')}</select></label>` : ''}
      <details><summary>Review topics (${course.topics.length})</summary><label class="field"><span>One topic per line</span><textarea rows="5" data-key="topics">${esc(course.topics.join('\n'))}</textarea></label></details>
      ${course.warnings?.length ? `<p class="small muted">${esc(course.warnings.join(' '))}</p>` : ''}
    </article>`;
  }
  function handoff() {
    return `<section class="panel setup-handoff" id="plan-handoff"><div class="panel-heading"><h2>Finish with a web AI</h2><button class="button light" data-setup-action="edit">Edit inputs</button></div>
      <div class="panel-body"><p>Copy the prompt into ChatGPT or another AI. Bring its JSON answer back here to open your timetable.</p>
      <details><summary>View prompt</summary><textarea id="prepared-prompt" aria-label="Prepared prompt" readonly rows="8">${esc(pending.prompt)}</textarea></details>
      <button class="button" data-setup-action="copy">${icon('file',15)}Copy prompt</button>
      <div class="setup-return"><label class="field"><span>Upload the AI’s JSON answer</span><input type="file" accept=".json,application/json" data-setup-file="answer"></label>
      <label class="field"><span>Or paste the answer</span><textarea data-key="answer" rows="4" placeholder="Paste the JSON response here">${esc(answer)}</textarea></label>
      <button class="button" data-setup-action="import">Open timetable</button></div></div></section>`;
  }
  function page() {
    init();
    const connected = Boolean(state.health?.ai?.configured);
    const handoffReady = pending && !editing;
    return `<div class="page-heading"><div><h1>Plan from your syllabus</h1><p>Set your exam dates and the time you can actually study.</p></div></div>
      <fieldset class="setup-fields" ${busy?'disabled':''}>
      ${busy?`<p class="alert info" role="status">${esc(busy)}</p>`:''}
      ${error?`<p class="alert error" role="alert">${esc(error)}</p>`:''}
      ${handoffReady ? handoff() : `<form id="study-setup"><div class="setup-grid"><section class="panel"><div class="panel-heading"><h2>Syllabus &amp; exams</h2>${icon('book',19)}</div><div class="panel-body">
      ${upload('Upload syllabus files','courses',courseFiles,true)}
      ${upload(sheet?'Date sheet · '+esc(sheet):'Upload a date sheet (optional)','dates',courseFiles+',.csv')}
      <p class="small muted">Use a text-based document, or enter the exam date beside each subject.</p>
      ${dates.length?`<details><summary>Dates found (${dates.length})</summary><ul class="setup-dates">${dates.map(row=>`<li><time>${esc(row.date)}</time> ${esc(row.label)}</li>`).join('')}</ul></details>`:''}
      ${form.courses.map(courseCard).join('')}
      </div></section><section class="panel"><div class="panel-heading"><h2>Your study time</h2>${icon('clock',19)}</div><div class="panel-body setup-time">
      <label class="field"><span>How many hours do you have per day?</span><input type="number" min="0.25" max="16" step="0.25" placeholder="e.g. 2.5" data-key="dailyHours" required value="${esc(form.dailyHours)}"><small>Includes 10-minute breaks between blocks.</small></label>
      <div class="form-grid"><label class="field"><span>First study day</span><input type="date" data-key="startDate" required value="${esc(form.startDate)}"></label>
      <label class="field"><span>Daily start time</span><input type="time" data-key="startTime" required value="${esc(form.startTime)}"></label></div>
      <p class="small muted">${connected?'Your connected AI will estimate topic difficulty and schedule study blocks before each exam.':'Your files are read locally. You’ll get a prompt with your topics, exam dates and available study blocks.'} Plans cover up to 90 days.</p>
      ${state.plan?'<p class="small muted">Opening the new timetable replaces the current plan and its checkmarks.</p>':''}
      <button class="button full" type="submit" value="${connected?'generate':'prompt'}" ${!form.courses.length?'disabled':''}>${icon('calendar',16)}${connected?'Create my timetable':'Prepare my prompt'}</button>
      ${connected?'<button class="button light full" type="submit" value="prompt">Use a web AI instead</button>':'<a href="#settings">Connect an API</a>'}
      </div></section></div></form>`}</fieldset>`;
  }
  async function run(message, fn) {
    if (busy) return;
    error = ''; busy = message; render();
    try { await fn(); }
    catch (e) { error = e.message; }
    finally { busy = ''; render(); }
  }
  async function readDocument(file, kind) {
    if (file.size > 5*1024*1024) throw new Error(file.name+' exceeds 5 MB.');
    const base64 = await new Promise((resolve,reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1]);
      reader.onerror = () => reject(new Error('Could not read '+file.name));
      reader.readAsDataURL(file);
    });
    return post('/api/syllabus/extract',{filename:file.name,base64,kind});
  }
  async function finish(path, payload) {
    const result = await post('/api/intake/'+path,{draftId:pending.draft.id,...payload});
    Object.assign(state,result,{intake:null, week:monday(result.plan.sessions[0].date),availabilityDraft:null});
    pending = null; answer = ''; editing = false; form = null; sheet = ''; dates = [];
    location.hash = 'overview';
    toast('Your timetable is ready.');
  }
  document.addEventListener('input', event => {
    const key = event.target.dataset.key;
    if (!key || key === 'sheetDate' || !event.target.closest('.setup-fields')) return;
    const value = event.target.value;
    if (key === 'answer') { answer = value; return; }
    const card = event.target.closest('[data-course]');
    if (card) {
      const course = form.courses[Number(card.dataset.course)];
      course[key] = key === 'topics' ? value.split('\n').map(t=>t.trim()).filter(Boolean) : value;
      if (key === 'examDate') course.manualDate = true;
      if (key === 'topics') card.querySelector('summary').textContent = 'Review topics ('+course.topics.length+')';
    } else form[key] = value;
  });
  document.addEventListener('change', async event => {
    if (event.target.dataset.key === 'sheetDate' && event.target.value) {
      const course = form.courses[Number(event.target.closest('[data-course]').dataset.course)];
      course.examDate = event.target.value; course.manualDate = true; render(); return;
    }
    const kind = event.target.dataset.setupFile;
    if (!kind || !event.target.files?.length) return;
    const files = [...event.target.files];
    await run(kind==='answer'?'Checking the timetable…':'Reading your document…',async()=>{
      if (kind === 'answer') {
        if (files[0].size>1500000) throw new Error('Choose a JSON answer under 1.5 MB.');
        answer = await files[0].text(); await finish('import',{answer}); return;
      }
      if (kind === 'dates') {
        const result = await readDocument(files[0],'dates'); dates = result.dates; sheet = files[0].name;
        matchDates();
        if (!dates.length) throw new Error('No dates with a year were found. Enter the exam dates beside your subjects.');
      } else {
        for (const file of files) {
          const result = await readDocument(file,'syllabus');
          for (const course of result.courses) {
            const name = course.subjectName || file.name.replace(/\.[^.]+$/,'').replace(/[_-]/g,' ');
            const existing = form.courses.find(item => course.subjectName && normalize(item.name) === normalize(name));
            if (existing) {
              existing.topics = [...new Set([...existing.topics,...course.topics])];
              existing.syllabusDate ||= course.examDate;
              continue;
            }
            form.courses.push({name,
              code:course.code, topics:course.topics, examDate:course.examDate, syllabusDate:course.examDate, warnings:course.warnings});
          }
          matchDates();
        }
      }
    });
  });
  document.addEventListener('click',async event=>{
    const el = event.target.closest('[data-setup-action]');
    if (!el || busy) return;
    switch (el.dataset.setupAction) {
      case 'remove': form.courses.splice(Number(el.closest('[data-course]').dataset.course),1); matchDates(); render(); break;
      case 'edit': editing=true; error=''; render(); break;
      case 'copy':
        try { await navigator.clipboard.writeText(pending.prompt); toast('Prompt copied.'); }
        catch { const box=document.querySelector('#prepared-prompt'); box.parentElement.open=true; box.select(); }
        break;
      case 'import': await run('Checking the timetable…',()=>finish('import',{answer})); break;
    }
  });
  document.addEventListener('submit',async event=>{
    if (event.target.id!=='study-setup') return;
    event.preventDefault();
    const generate = event.submitter?.value==='generate';
    await run(generate?'Creating your timetable…':'Preparing your prompt…',async()=>{
      pending = await post('/api/intake/prepare',{...form,dailyHours:Number(form.dailyHours)});
      state.intake = pending; editing=false; answer='';
      if (generate) await finish('generate',{});
    });
  });
  return {page};
}
