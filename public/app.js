import {createSetup} from './planner-setup.js';
import {createFeatures} from './features.js';
const $ = (selector, root = document) => root.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const paths = {
  grid:'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
  book:'M4 4h6a3 3 0 0 1 3 3v14a4 4 0 0 0-4-2H4zM20 4h-4a3 3 0 0 0-3 3v14a4 4 0 0 1 4-2h3z',
  calendar:'M5 5h14a2 2 0 0 1 2 2v13H3V7a2 2 0 0 1 2-2zM7 3v4M17 3v4M3 10h18M7 14h2M12 14h2M7 17h2',
  flask:'M9 3h6M10 3v7L4 20a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1l-6-10V3M8 15h8',
  help:'M9 9a3 3 0 0 1 6 0c0 2-3 2-3 5M12 17h.01M22 12A10 10 0 1 1 2 12a10 10 0 0 1 20 0',
  spark:'m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5zM20 3v4M18 5h4',
  arrow:'M5 12h14M14 7l5 5-5 5', chevron:'m9 5 7 7-7 7', left:'m15 5-7 7 7 7',
  plus:'M12 5v14M5 12h14', check:'m5 12 4 4L19 6', close:'m6 6 12 12M6 18 18 6',
  clock:'M12 8v5l3 2M22 12A10 10 0 1 1 2 12a10 10 0 0 1 20 0',
  target:'M22 12A10 10 0 1 1 2 12a10 10 0 0 1 20 0M17 12a5 5 0 1 1-10 0 5 5 0 0 1 10 0M12 12h.01',
  download:'M12 3v12M7 10l5 5 5-5M4 16v5h16v-5', edit:'m15 4 5 5M4 20l5-1L21 7l-4-4L5 15z',
  trash:'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7',
  shield:'m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6zM8 12l3 3 5-6',
  warning:'m12 3 10 18H2zM12 9v5M12 17h.01', file:'M5 3h9l5 5v13H5zM14 3v6h5M8 13h8M8 17h6',
  menu:'M4 6h16M4 12h16M4 18h16', arrowUp:'M7 17 17 7M7 7h10v10',
  leaf:'M20 3c-9 0-16 3-16 10a7 7 0 0 0 7 7c7 0 9-8 9-17ZM5 19 15 9',
  play:'m8 5 11 7-11 7z', copy:'M9 8h11v13H9zM15 8V3H4v13h5', code:'m8 7-5 5 5 5M16 7l5 5-5 5M14 4l-4 16',
};
const icon = (name, size = 18) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name] || paths.book}"/></svg>`;
const colors = ['#7b995b','#af8a61','#8395b5','#bd8d9b','#818cbb','#6eaaa2','#bb9d57','#9c88b1'];
const weekdays = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const routeTitles = {overview:'Overview',subjects:'Subjects',availability:'Availability',lab:'Prompt Lab',guide:'Project guide',focus:'Focus timer',syllabus:'Plan setup',settings:'AI settings'};
const state = {config:null,plan:null,experiments:[],evaluation:null,health:null,prompts:[],schema:null,route:'overview',week:null,view:'week',mode:'engine',promptVersion:'v3',busy:'',selectedExperiment:null,availabilityDraft:null};
let toastTimer;
let focusMemory = null;
let modalReturnFocus = null;
const mobileLayout = window.matchMedia('(max-width: 760px)');

function describeFocus(element = document.activeElement) {
  if (!element || !$('#app').contains(element)) return null;
  const keys = ['data-action','data-id','data-day','data-index','data-control','name','href','type','value'];
  const attributes = keys.filter(key => element.hasAttribute(key)).map(key => [key,element.getAttribute(key)]);
  return attributes.length ? {route:state.route,tag:element.tagName,attributes} : null;
}
function restoreFocus(target) {
  if (!target || target.route !== state.route || $('#modal').open) return;
  const match = [...$('#app').querySelectorAll(target.tag)].find(element => target.attributes.every(([key,value]) => element.getAttribute(key)===value));
  if (match && !match.disabled && !match.closest('[inert]')) { match.focus({preventScroll:true}); return true; }
}
function setMenu(open, moveFocus = true) {
  const active = Boolean(open && mobileLayout.matches);
  $('.app-shell')?.classList.toggle('menu-open',active);
  if ($('.sidebar')) $('.sidebar').inert=mobileLayout.matches && !active;
  if ($('.main-wrap')) $('.main-wrap').inert=active;
  $('.mobile-menu')?.setAttribute('aria-expanded',String(active));
  if(moveFocus) (active?$('.sidebar .nav-link.active'):$('.mobile-menu'))?.focus({preventScroll:true});
}

function dateValue(value) { return new Date(`${value}T12:00:00`); }
function isoDate(value) { const d = new Date(value); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function addDays(date, amount) { const d=dateValue(date);d.setDate(d.getDate()+amount);return isoDate(d); }
function monday(date) { const d=dateValue(date);return addDays(date,-((d.getDay()+6)%7)); }
function fmtDate(date, options = {month:'short',day:'numeric'}) { return dateValue(date).toLocaleDateString('en-IN',options); }
function daysUntil(date) { return Math.round((dateValue(date)-dateValue(isoDate(new Date())))/86400000); }
function hours(minutes) { return (Number(minutes || 0)/60).toLocaleString('en-IN',{maximumFractionDigits:1}); }
function color(id) { const index=state.config?.subjects.findIndex(s=>s.id===id) ?? 0;return colors[Math.max(0,index)%colors.length]; }
function busyIcon(name) { return state.busy===name?'<span class="spinner" aria-hidden="true"></span>':icon(name==='evaluate'?'shield':'spark',15); }
function toast(message, error = false) { clearTimeout(toastTimer);const el=$('#toast');el.textContent=message;el.className=`visible${error?' error':''}`;toastTimer=setTimeout(()=>el.className='',5000); }
async function api(url, options={}) {
  let response;
  try { response=await fetch(url,{...options,headers:{'Content-Type':'application/json',...options.headers}}); }
  catch { throw new Error('Cannot reach the server. Check that the project is running, then try again.'); }
  const result=await response.json().catch(()=>({error:'The server returned an unreadable response.'}));
  if(!response.ok) throw Object.assign(new Error(typeof result.error==='string'?result.error:result.error?.message || result.message || 'Something went wrong. Please try again.'),{status:response.status});
  return result;
}
const post = (url, body) => api(url,{method:'POST',body:JSON.stringify(body)});
const clone = value => JSON.parse(JSON.stringify(value));
function routeFromHash() { const route=location.hash.replace('#','');return routeTitles[route]?route:!state.plan && (!state.config?.subjects.length || state.intake)?'syllabus':'overview'; }
function button(label,action,style='light',ico='',attrs='') { return `<button class="button ${style}" data-action="${action}" ${attrs}>${ico?icon(ico,15):''}${label}</button>`; }
function empty(title, text, action='') { return `<div class="empty-state"><div class="empty-illustration">${icon('calendar',30)}</div><h3>${title}</h3><p>${text}</p>${action}</div>`; }
function navLink(route, ico, label, extra='') { return `<a class="nav-link ${state.route===route?'active':''}" href="#${route}" ${state.route===route?'aria-current="page"':''}>${icon(ico,17)}<span>${label}</span>${extra}</a>`; }
function render() {
  if(!state.config) return;
  focusMemory=describeFocus() || (focusMemory?.route===state.route?focusMemory:null);
  $('#app').innerHTML=`<div class="app-shell"><div class="mobile-backdrop" data-action="close-menu"></div><aside class="sidebar" id="main-navigation" aria-label="Main navigation"><button class="mobile-nav-close icon-button" data-action="close-menu" aria-label="Close navigation">${icon('close',18)}</button><a class="brand" href="#overview"><span class="brand-symbol">${icon('book',23)}</span><span class="brand-name">StudyFlow<span style="color:#d3f58d">.</span></span></a><div class="nav-label">Your workspace</div><nav class="nav">${navLink('overview','grid','Overview')}${navLink('subjects','book','Subjects',`<span class="nav-badge">${state.config.subjects.length}</span>`)}${navLink('availability','calendar','Availability')}${navLink('syllabus','file','Plan setup')}${navLink('focus','clock','Focus timer')}${navLink('lab','flask','Prompt Lab')}${navLink('settings','spark','AI settings')}${navLink('guide','help','Project guide')}</nav><div class="sidebar-bottom"><div class="profile"><span class="avatar">C20</span><div><strong>Smart Study Planner</strong><small>Prompt Engineering Project</small></div></div></div></aside><div class="main-wrap"><header class="topbar"><div class="breadcrumb"><button class="mobile-menu" data-action="menu" aria-label="Open navigation" aria-controls="main-navigation" aria-expanded="false">${icon('menu',19)}</button><span>Workspace</span>${icon('chevron',11)}<strong>${routeTitles[state.route]}</strong></div><div class="topbar-right"><button class="theme-toggle" data-action="toggle-theme" aria-label="Switch color theme"></button><span class="today">${icon('calendar',14)}${new Date().toLocaleDateString('en-IN',{weekday:'short',day:'numeric',month:'long',year:'numeric'})}</span><span class="status-chip"><span class="status-dot"></span>Backend connected</span></div></header><main class="main-content" id="main" tabindex="-1">${({overview:renderOverview,subjects:renderSubjects,availability:renderAvailability,lab:renderLab,guide:renderGuide,focus:features.renderFocus,syllabus:setup.page,settings:features.renderSettings})[state.route]()}</main></div></div>`;
  setMenu(false,false);
  if(!$('#chat-root')?.contains(document.activeElement))restoreFocus(focusMemory);
  renderChat();
  window.studyflowTheme?.sync();features.afterRender();
}
function modeOptions() { return `<option value="engine" ${state.mode==='engine'?'selected':''}>Constraint engine</option><option value="ai" ${state.mode==='ai'?'selected':''} ${!state.health?.ai?.configured?'disabled':''}>${state.health?.ai?.configured?`${esc(state.health.ai.provider)} AI`:'AI · setup required'}</option>`; }
function exportButton() { return `<details class="export-menu"><summary class="button light" aria-label="Export plan">${icon('download',15)}<span class="optional">Export</span></summary><div class="export-options"><a href="/api/export?format=csv" aria-label="Download spreadsheet CSV" download>${icon('file',14)}Spreadsheet (.csv)</a><a href="/api/export?format=ics" aria-label="Download calendar ICS" download>${icon('calendar',14)}Calendar (.ics)</a><a href="/api/export?format=json" aria-label="Download plan and evidence JSON" download>${icon('code',14)}Plan & evidence (.json)</a><button class="button light small-btn full" data-action="print" aria-label="Print timetable">Print timetable</button></div></details>`; }
function difficultyLabel(level) {
  return `<span class="topic-level" data-level="${esc(level)}">${esc(level)}</span>`;
}
function renderStudyTimetable() {
  const plan=state.plan, completed=plan.sessions.filter(s=>s.completed).length;
  const upcoming=plan.sessions.find(s=>!s.completed && s.date>=isoDate(new Date()));
  const firstExam=[...plan.input.subjects].sort((a,b)=>a.examDate.localeCompare(b.examDate))[0];
  const exams=plan.input.subjects.map(subject=>`<details class="topic-review">
    <summary><strong>${esc(subject.name)}</strong><span>Exam · ${fmtDate(subject.examDate)}</span></summary>
    ${plan.assessments.filter(t=>t.subjectId===subject.id).map(t=>`<div class="review-row"><div><strong>${esc(t.topic)}</strong> ${difficultyLabel(t.difficulty)}</div><p>${esc(t.method)}</p><small>${t.allocatedBlocks} / ${t.targetBlocks} suggested blocks</small></div>`).join('')}</details>`).join('');
  return `<div class="page-heading"><div><h1>Your study timetable</h1><p>${fmtDate(plan.input.startDate)} – ${fmtDate(plan.input.endDate,{day:'numeric',month:'long',year:'numeric'})} · ${esc(sourceLabel(plan.source))}</p></div><div class="heading-actions">${exportButton()}<a class="button light" href="#syllabus">Edit plan setup</a></div></div>
    <div class="plan-brief"><div><small>Next study block</small>${upcoming?`<button data-action="session-detail" data-id="${esc(upcoming.id)}">${esc(upcoming.topic)}</button><span>${esc(upcoming.subjectName)} · ${fmtDate(upcoming.date)} · ${esc(upcoming.start)}</span>`:'<strong>No upcoming blocks</strong>'}</div>
    <div><small>Daily time</small><strong>${esc(plan.setup.dailyHours)} hours</strong><span>Including breaks</span></div>
    <div><small>Progress</small><strong>${completed} / ${plan.sessions.length}</strong><span>Blocks completed</span></div></div>
    <section class="panel"><div class="panel-heading"><h2>Timetable</h2><div class="segmented"><button data-action="view-week" class="${state.view==='week'?'selected':''}">Week</button><button data-action="view-list" class="${state.view==='list'?'selected':''}">List</button></div></div>${renderCalendar()}</section>
    <section class="panel section-space"><div class="panel-heading"><h2>Topic difficulty &amp; study methods</h2><span class="small muted">First exam · ${fmtDate(firstExam.examDate)}</span></div><div class="panel-body">${exams}</div></section>
    ${plan.warnings.length?`<details class="panel section-space"><summary class="panel-body">Topics needing more time (${plan.warnings.length})</summary><div class="panel-body">${renderWarnings(plan.warnings)}</div></details>`:''}`;
}
function renderOverview() {
  if (!state.config.subjects.length) return setup.page();
  if (state.plan?.setup) return renderStudyTimetable();
  const plan=state.plan, stats=plan?.stats || {}, subjects=state.config.subjects;
  const completed=plan?.sessions.filter(s=>s.completed).length || 0;
  const required=subjects.reduce((total,s)=>total+Number(s.hours),0);
  const nextExam=[...subjects].sort((a,b)=>a.examDate.localeCompare(b.examDate))[0];
  return `<div class="page-heading"><div><h1>Your study space</h1><p>Clear priorities. A manageable week. Progress at your pace.</p></div><div class="heading-actions">${plan?exportButton():''}<div class="generation-controls"><select aria-label="Timetable generation mode" data-control="mode">${modeOptions()}</select><button class="button" data-action="generate" ${state.busy?'disabled':''}>${busyIcon('generate')}${state.busy==='generate'?'Building your plan…':plan?'Regenerate plan':'Generate plan'}</button></div></div></div><div class="feature-shortcuts"><a href="#focus">${icon('clock',15)}Start a focus round</a><a href="#syllabus">${icon('file',15)}Plan from your syllabus</a><a href="#settings">${icon('spark',15)}Connect your AI</a></div><section class="hero" aria-labelledby="hero-title"><div><div class="eyebrow">${icon('spark',12)} A plan that works around you</div><h2 id="hero-title">A little structure.<br> <em>A lot more clarity.</em></h2><p>Your subjects, your time, your goals. Let’s turn them into a week you can feel good about.</p></div><div class="hero-art" aria-hidden="true"><div class="orbit"></div><div class="hero-card"><div class="mini-lines"></div><div class="mini-lines" style="width:31px"></div><div class="mini-check">${icon('check',12)}Learn something</div><div class="mini-check">${icon('check',12)}Take a break</div><div class="mini-check">${icon('check',12)}Keep growing</div></div><div class="hero-stamp">${icon('leaf',12)} Small steps, big progress</div></div></section><section class="metrics" aria-label="Plan statistics">${metric('Study hours planned',hours(stats.allocatedMinutes),'hrs',plan?`${hours(stats.unscheduledMinutes)} hrs still to allocate`:`${required.toLocaleString('en-IN',{maximumFractionDigits:1})} hrs in your study goals`,'clock')}${metric('Study sessions',stats.sessionCount ?? plan?.sessions.length ?? 0,'',plan?`${completed} completed · ${Math.max(0,(plan.sessions.length-completed))} to go`:'Your next chapter starts here','calendar')}${metric('Subjects to focus on',subjects.length,'',nextExam?`Next exam · ${fmtDate(nextExam.examDate)}`:'Add your first subject','book')}${metric('Workload covered',`${Math.round(stats.coveragePercent || 0)}`,'%',plan?'Scheduled hours ÷ requested hours':'Generate a plan to see coverage','target')}</section>${state.mode==='ai'?`<div class="alert info">${icon('shield',16)}<p>AI mode sends your subject names, topics and schedule constraints to ${esc(state.health.ai.provider)}. Use non-sensitive study information. Every output is checked before it becomes your plan.</p></div>`:''}${renderWarnings(plan?.warnings)}<div class="dashboard-grid"><div><section class="panel"><div class="panel-heading"><div><h2>Your study timetable</h2><p>${plan?`${esc(sourceLabel(plan.source))} · ${fmtDate(plan.input?.startDate || state.config.startDate)} – ${fmtDate(plan.input?.endDate || state.config.endDate)}`:'Designed around your real availability'}</p></div><div class="calendar-controls"><div class="segmented" aria-label="Timetable view"><button data-action="view-week" class="${state.view==='week'?'selected':''}" aria-pressed="${state.view==='week'}">Week</button><button data-action="view-list" class="${state.view==='list'?'selected':''}" aria-pressed="${state.view==='list'}">List</button></div></div></div>${plan?renderCalendar():empty('Your week, thoughtfully planned.','Add your subjects and available hours, then generate a timetable with time for breaks.',button('Build my study plan','generate','','spark',state.busy?'disabled':''))}${plan?`<div class="calendar-footer">${subjects.map(s=>`<span class="legend-item" style="--subject-color:${color(s.id)}"><span class="color-dot"></span>${esc(s.name)}</span>`).join('')}</div>`:''}</section>${plan?`<section class="panel section-space"><div class="panel-heading"><div><h2>Constraint check</h2><p>Every scheduled session is checked against your saved rules.</p></div><span class="badge ${plan.checks?.some(c=>!c.passed)?'warn':''}">${plan.checks?.filter(c=>c.passed).length || 0}/${plan.checks?.length || 0} checks passed</span></div><div class="panel-body">${renderChecks(plan.checks)}</div></section>`:''}</div><aside class="right-stack"><section class="panel small-panel"><div class="panel-heading"><h2>On the horizon</h2><a class="icon-button" href="#subjects" aria-label="Edit subjects">${icon('arrowUp',14)}</a></div><div class="panel-body">${subjects.length?[...subjects].sort((a,b)=>a.examDate.localeCompare(b.examDate)).slice(0,4).map(s=>{const days=daysUntil(s.examDate);return `<div class="exam-item" style="--subject-color:${color(s.id)}"><div class="exam-icon">${icon('book',16)}</div><div><h3>${esc(s.name)}</h3><p>${fmtDate(s.examDate,{day:'numeric',month:'long'})}</p></div><span class="days-left">${days>0?`${days}d left`:days===0?'Today':'Past'}</span></div>`;}).join(''):'<p class="muted small">Your exam dates will appear here.</p>'}</div></section><section class="panel small-panel"><div class="panel-heading"><h2>Study balance</h2>${icon('target',16)}</div><div class="panel-body">${subjects.length?subjects.map(s=>{const summary=plan?.subjectSummaries?.find(x=>x.subjectId===s.id);const allocated=summary?.allocatedMinutes || 0;const percentage=Math.min(100,allocated/(s.hours*60)*100);return `<div class="progress-row" style="--subject-color:${color(s.id)}"><div class="row"><strong style="font-weight:500">${esc(s.name)}</strong><span>${hours(allocated)} / ${esc(s.hours)}h</span></div><div class="progress-track" role="meter" aria-label="${esc(s.name)} allocated workload" aria-valuenow="${Math.round(percentage)}" aria-valuemin="0" aria-valuemax="100"><div class="progress-fill" style="width:${percentage}%"></div></div></div>`;}).join(''):'<p class="muted small">Add subjects to balance your time.</p>'}</div></section><div class="note-card"><div class="quote-mark">“</div><p>You don’t need to do it all today. Just make a little room for what matters.</p><small>A gentle reminder from StudyFlow</small></div></aside></div><div class="bottom-note">${icon('shield',12)}${plan?'Your plan is saved on this server. You can come back anytime.':'Your pace matters. Breaks and daily limits are part of the plan.'}</div>`;
}
function metric(label,value,unit,note,ico){return `<div class="metric"><div class="metric-icon">${icon(ico,15)}</div><div class="metric-label">${label}</div><div class="metric-value">${value}<span>${unit}</span></div><div class="metric-note">${note}</div></div>`;}
function sourceLabel(source) { if (source==='web') return 'Web AI'; return source==='constraint-engine' || source==='engine'?'Constraint engine':source?`${source} AI`:'Generated plan'; }
function renderWarnings(warnings) { return (warnings||[]).map(w=>`<div class="alert">${icon('warning',16)}<p>${esc(typeof w==='string'?w:w.message || w.details || JSON.stringify(w))}</p></div>`).join(''); }
function renderChecks(checks) { return `<div class="check-list">${(checks||[]).map(c=>`<div class="check-item ${!c.passed?'failed':''}">${icon(c.passed?'check':'warning',15)}<div><strong>${esc(c.label || c.id)}</strong>${c.details?`<small>${esc(typeof c.details==='string'?c.details:JSON.stringify(c.details))}</small>`:''}</div></div>`).join('')}</div>`; }
function renderCalendar() {
  const dates=Array.from({length:7},(_,i)=>addDays(state.week,i));
  const sessions=state.plan.sessions.filter(s=>dates.includes(s.date));
  const weekStart=fmtDate(dates[0]),weekEnd=fmtDate(dates[6],{month:'short',day:'numeric',year:'numeric'});
  return `<div class="week-nav"><div><span class="week-label">${weekStart} – ${weekEnd}</span></div><div class="week-arrows"><span class="muted">${sessions.length} sessions</span><button class="icon-button" data-action="prev-week" aria-label="Previous week">${icon('left',14)}</button><button class="icon-button" data-action="this-week" aria-label="Go to plan's first week" title="Plan's first week">${icon('calendar',14)}</button><button class="icon-button" data-action="next-week" aria-label="Next week">${icon('chevron',14)}</button></div></div>${state.view==='week'?`<div class="week-grid" tabindex="0" role="region" aria-label="Weekly timetable, scroll horizontally to see more days">${dates.map(date=>`<div class="day-column"><div class="day-header ${date===isoDate(new Date())?'today':''}"><span class="weekday">${fmtDate(date,{weekday:'short'})}</span><span class="day-number">${dateValue(date).getDate()}</span></div>${sessions.filter(s=>s.date===date).sort((a,b)=>a.start.localeCompare(b.start)).map(renderSession).join('') || '<div class="rest-day">Room to breathe</div>'}</div>`).join('')}</div>`:sessions.length?dates.map(date=>{const daily=sessions.filter(s=>s.date===date).sort((a,b)=>a.start.localeCompare(b.start));return daily.length?`<div class="list-date">${fmtDate(date,{weekday:'long',day:'numeric',month:'short'})}</div>${daily.map(s=>`<div class="list-session ${s.completed?'complete':''}" style="--subject-color:${color(s.subjectId)}"><span class="color-dot"></span><span class="session-time">${esc(s.start)} – ${esc(s.end)}</span><div><button class="session-name" style="background:none;padding:0;text-align:left" data-action="session-detail" data-id="${esc(s.id)}">${esc(s.subjectName)}</button><div class="session-topic">${esc(s.topic)} · ${esc(s.durationMinutes)} min${s.difficulty?' · '+esc(s.difficulty):''}</div></div><button class="complete-button ${s.completed?'checked':''}" data-action="complete" data-id="${esc(s.id)}" aria-label="${s.completed?'Mark incomplete':'Mark complete'}: ${esc(s.subjectName)}" aria-pressed="${Boolean(s.completed)}">${icon('check',12)}</button></div>`).join('')}`:'';}).join(''):empty('A little breathing room.','There are no study sessions in this week. Browse to another week to find your plan.','')}`;
}
function renderSession(s) { return `<article class="session ${s.completed?'complete':''}" style="--subject-color:${color(s.subjectId)}"><div class="session-time">${esc(s.start)} – ${esc(s.end)}</div><button class="session-name" style="background:none;padding:0;text-align:left" data-action="session-detail" data-id="${esc(s.id)}">${esc(s.subjectName)}</button><div class="session-topic">${esc(s.topic)}</div>${s.difficulty?difficultyLabel(s.difficulty):''}<div class="session-footer"><span class="session-type">${esc(s.type || 'study')} · ${s.durationMinutes}m</span><button class="complete-button ${s.completed?'checked':''}" data-action="complete" data-id="${esc(s.id)}" aria-label="${s.completed?'Mark incomplete':'Mark complete'}: ${esc(s.subjectName)}, ${esc(s.date)} ${esc(s.start)}" aria-pressed="${Boolean(s.completed)}">${icon('check',10)}</button></div></article>`; }
function renderSubjects() {
  return `<div class="page-heading"><div><h1>A place for every subject</h1><p>Tell us what’s ahead. We’ll help you make room for it.</p></div><div class="heading-actions"><a href="#syllabus" class="button light">${icon('file',15)}Import syllabus</a>${button('Add subject','add-subject','','plus')}</div></div><div class="alert info">${icon('book',16)}<p>Study hours are your total preparation goal for each subject. Sessions finish before the exam date. Saving changes clears the old timetable so you can generate a fresh one.</p></div><div class="subject-grid">${state.config.subjects.map(s=>`<article class="subject-card" style="--subject-color:${color(s.id)}"><div class="subject-card-top"><div class="subject-icon">${icon('book',22)}</div><div><button class="icon-button" data-action="edit-subject" data-id="${esc(s.id)}" aria-label="Edit ${esc(s.name)}">${icon('edit',15)}</button><button class="icon-button" data-action="delete-subject" data-id="${esc(s.id)}" aria-label="Delete ${esc(s.name)}">${icon('trash',15)}</button></div></div><h2>${esc(s.name)}</h2><div class="exam-date">${icon('calendar',13)}Exam on ${fmtDate(s.examDate,{day:'numeric',month:'long',year:'numeric'})}</div><div class="subject-details"><div><small>Study goal</small><strong>${esc(s.hours)} hours</strong></div><div><small>Priority</small><strong>${['','Low','Medium','High'][s.priority] || s.priority}</strong></div><div><small>Difficulty</small><strong>${['','Foundational','Moderate','Challenging'][s.difficulty] || s.difficulty}</strong></div><div><small>Topics to cover</small><strong>${s.topics?.length || 0} topics</strong></div></div><div class="topic-tags">${(s.topics || []).map(t=>`<span class="tag">${esc(t)}</span>`).join('') || '<span class="tag">General preparation</span>'}</div></article>`).join('')}<button class="add-subject" data-action="add-subject">${icon('plus',26)}Add a new subject<span class="small muted">One more step toward a clearer plan</span></button></div>`;
}
function inputField(label,name,value,type='text',attrs='',hint='') { return `<label class="field"><span>${label}</span><input type="${type}" name="${name}" value="${esc(value)}" ${attrs}>${hint?`<small>${hint}</small>`:''}</label>`; }
function renderAvailability() {
  const c=state.availabilityDraft || state.config;
  return `<div class="page-heading"><div><h1>Find your study rhythm</h1><p>Build around the time you actually have. Leave room for everything else.</p></div></div><form id="availability-form"><div class="availability-layout"><section class="panel"><div class="panel-heading"><div><h2>Your weekly free time</h2><p>Repeat each week. Add multiple windows; use 24:00 as an end time for midnight.</p></div>${icon('calendar',18)}</div><div class="panel-body">${[1,2,3,4,5,6,0].map(day=>`<div class="window-day"><div class="window-day-heading"><strong>${weekdays[day]}</strong><button type="button" class="button light small-btn" data-action="add-window" data-day="${day}">${icon('plus',12)} Add time</button></div>${c.availability.map((w,index)=>({...w,index})).filter(w=>w.day===day).map(w=>`<div class="window-row" data-window-index="${w.index}" data-day="${day}"><input type="time" name="window-start-${w.index}" value="${esc(w.start)}" aria-label="${weekdays[day]} window start time" required><span>to</span><input type="text" inputmode="numeric" pattern="([01][0-9]|2[0-3]):[0-5][0-9]|24:00" title="End time in HH:MM format; use 24:00 for midnight" name="window-end-${w.index}" value="${esc(w.end)}" aria-label="${weekdays[day]} window end time" required><button type="button" class="icon-button" data-action="remove-window" data-index="${w.index}" aria-label="Remove ${weekdays[day]} time window">${icon('close',15)}</button></div>`).join('') || '<div class="off-day">A day off. Add a window whenever you’re ready.</div>'}</div>`).join('')}</div></section><div><section class="panel"><div class="panel-heading"><h2>Your planning preferences</h2>${icon('target',17)}</div><div class="panel-body"><div class="form-grid">${inputField('Plan starts','startDate',c.startDate,'date','required')}${inputField('Plan ends','endDate',c.endDate,'date','required')}${inputField('Study session (min)','sessionMinutes',c.sessionMinutes,'number','min="15" max="180" step="1" required')}${inputField('Break (min)','breakMinutes',c.breakMinutes,'number','min="0" max="60" required')}${inputField('Daily study cap (hrs)','maxDailyHours',c.maxDailyHours,'number','min="0" max="16" step="0.25" required')}<label class="field"><span>Preferred study time</span><select name="preferredTime"><option value="balanced" ${c.preferredTime==='balanced'?'selected':''}>Balanced</option><option value="morning" ${c.preferredTime==='morning'?'selected':''}>Morning</option><option value="evening" ${c.preferredTime==='evening'?'selected':''}>Evening</option></select></label><label class="field full"><span>Days to keep free</span><textarea name="blockedDates" placeholder="2026-11-15&#10;2026-11-22">${esc((c.blockedDates || []).join('\n'))}</textarea><small>One date per line, in YYYY-MM-DD format.</small></label></div><div class="settings-summary">${icon('leaf',14)} Breaks are reserved between study sessions. Your daily cap counts study time, and exam days stay free of that subject.</div><p class="form-error" id="availability-error" role="alert"></p><div class="form-actions"><button type="button" class="button light" data-action="reset-availability">Reset</button><button type="submit" class="button" ${state.busy?'disabled':''}>${state.busy==='save'?'<span class="spinner"></span>':icon('check',15)}Save availability</button></div></div></section><p class="small muted" style="line-height:1.7;margin:16px 3px">Changes apply when you save. Generate a new plan afterward to use your updated schedule.</p></div></div></form>`;
}
function renderLab() {
  const prompts=state.prompts.length?state.prompts:[{id:'v1',name:'Baseline',description:'A simple starting prompt.'},{id:'v2',name:'Structured',description:'Explicit rules and a JSON output.'},{id:'v3',name:'Refined',description:'Examples, checks, and failure handling.'}];
  const prompt=prompts.find(p=>p.id===state.promptVersion)||prompts[0];
  const selected=state.experiments.find(e=>e.id===state.selectedExperiment);
  return `<div class="page-heading"><div><h1>Better prompts, visible evidence</h1><p>Explore three prompt versions. Run, inspect, and compare real outputs.</p></div><div class="heading-actions"><button class="button light" data-action="evaluate" ${state.busy?'disabled':''}>${busyIcon('evaluate')}${state.busy==='evaluate'?'Checking test cases…':'Run evaluation suite'}</button></div></div><div class="alert info">${icon('flask',17)}<p>${state.health?.ai?.configured?'Run AI experiments to compare prompt versions. The local constraint engine provides a reproducible reference.':'The constraint engine is ready. To run real language-model experiments, open AI settings to connect a provider.'} Engine runs do not measure LLM prompt quality; prompt comparisons require actual AI runs.</p></div><div class="lab-layout"><section class="panel"><div class="panel-heading"><h2>Design your experiment</h2></div><div class="panel-body">${prompts.map(p=>`<label class="prompt-option ${state.promptVersion===p.id?'selected':''}"><input type="radio" name="promptVersion" value="${esc(p.id)}" ${state.promptVersion===p.id?'checked':''}><strong>${esc(p.id.toUpperCase())} · ${esc(p.name)}</strong><p>${esc(p.technique || p.description)}</p></label>`).join('')}<div class="model-select"><label class="field"><span>Run with</span><select data-control="mode">${modeOptions()}</select></label><p>${state.mode==='ai'?`Using ${esc(state.health?.ai?.model || 'the configured model')}. Inputs are sent to your AI provider.`:'Local scheduling algorithm. No API key or external request needed.'}</p></div><button class="button full" data-action="experiment" ${state.busy?'disabled':''}>${busyIcon('experiment')}${state.busy==='experiment'?'Running experiment…':'Run experiment'}</button></div></section><section class="panel"><div class="panel-heading"><div><h2>${esc(prompt.name)} prompt</h2><p>${esc(prompt.description || 'The exact template used for this prompt version.')}</p></div><button class="icon-button" data-action="copy-prompt" aria-label="Copy selected prompt">${icon('copy',16)}</button></div><div class="panel-body"><div class="prompt-section-title">System instructions</div><pre class="code-view">${esc(prompt.system || 'Loading prompt templates…')}</pre><div class="prompt-section-title">User template · your saved inputs are included at runtime</div><pre class="code-view">${esc(prompt.user || '')}</pre><details class="details"><summary>Structured output schema</summary><pre class="code-view">${esc(JSON.stringify(state.schema,null,2))}</pre></details></div></section></div><section class="panel section-space"><div class="panel-heading"><div><h2>Experiment notebook</h2><p>Saved inputs, outputs, model settings and measured results.</p></div><span class="badge">${state.experiments.length} runs</span></div>${state.experiments.length?`<div class="experiment-table-wrap" tabindex="0" role="region" aria-label="Experiment results, scroll horizontally to see all measurements"><table class="data-table"><thead><tr><th>Prompt / source</th><th>Hard checks</th><th>Coverage</th><th>Sessions</th><th>Duration</th><th>Result</th><th><span class="visually-hidden">Actions</span></th></tr></thead><tbody>${[...state.experiments].reverse().map(e=>`<tr><td><strong>${esc(e.promptVersion?.toUpperCase())}</strong><small>${esc(e.mode==='engine'?'Constraint engine':`${e.provider || 'AI'} · ${e.model || ''}`)}</small><small>${new Date(e.createdAt).toLocaleString('en-IN',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}</small></td><td class="numeric">${e.error?'—':formatPercent(e.metrics?.constraintPassRate)}</td><td class="numeric">${e.error?'—':`${Math.round(e.metrics?.coveragePercent || 0)}%`}</td><td class="numeric">${e.metrics?.sessionCount ?? '—'}</td><td class="numeric">${((e.metrics?.latencyMs || 0)/1000).toFixed(2)}s</td><td><span class="badge ${e.error?'error':(e.metrics?.coveragePercent || 0)<100?'warn':''}">${e.error?'Failed':(e.metrics?.coveragePercent || 0)<100?'Partial':'Completed'}</span></td><td><div style="display:flex;gap:4px"><button class="button light small-btn" data-action="inspect-experiment" data-id="${esc(e.id)}">Inspect</button><button class="icon-button" data-action="delete-experiment" data-id="${esc(e.id)}" aria-label="Delete experiment ${esc(e.promptVersion)}">${icon('trash',13)}</button></div></td></tr>`).join('')}</tbody></table></div>${selected?renderExperiment(selected):''}`:empty('Every good prompt starts with a first run.','Choose a prompt version above and run it against your saved subjects and availability.')}</section>${state.evaluation?renderEvaluation():''}`;
}
function formatPercent(value) { if(value===undefined || value===null) return '—';return `${Math.round(value)}%`; }
function renderExperiment(e) { const output=e.output || {};return `<div class="experiment-detail"><div class="evaluation-header"><strong>${esc(e.promptVersion?.toUpperCase())} · Experiment details</strong><button class="icon-button" data-action="close-experiment" aria-label="Close experiment details">${icon('close',15)}</button></div>${e.error?`<div class="alert error">${icon('warning',16)}<p>${esc(e.error)}</p></div>`:''}${renderWarnings(output.warnings)}${renderChecks(output.checks)}<details class="details"><summary>Saved experiment input</summary><pre class="code-view">${esc(JSON.stringify(e.input,null,2))}</pre></details><details class="details"><summary>Raw model / engine output</summary><pre class="code-view">${esc(typeof e.rawOutput==='string'?e.rawOutput:JSON.stringify(e.rawOutput ?? e.output,null,2))}</pre></details><details class="details"><summary>Evaluation metadata</summary><pre class="code-view">${esc(JSON.stringify({mode:e.mode,provider:e.provider,model:e.model,metrics:e.metrics,createdAt:e.createdAt},null,2))}</pre></details></div>`; }
function renderEvaluation() {const e=state.evaluation;return `<section class="panel section-space"><div class="panel-heading"><div><h2>Reproducible constraint evaluation</h2><p>Executed ${esc(new Date(e.createdAt).toLocaleString('en-IN'))} · ${esc(e.mode || 'engine')} tests</p></div><span class="badge ${e.passed<e.total?'warn':''}">${e.passed}/${e.total} passed</span></div><div class="panel-body"><p class="small muted">These results test scheduling behavior and input validation. They do not evaluate language-model performance or student learning outcomes.</p>${(e.results || []).map(r=>`<div class="test-result ${r.passed?'':'failed'}">${icon(r.passed?'check':'warning',16)}<div><strong>${esc(r.name)}</strong><small>${esc(typeof r.details==='string'?r.details:JSON.stringify(r.details))}</small></div></div>`).join('')}</div></section>`;}
function renderGuide() {
  return `<div class="page-heading"><div><h1>From a plan to a project</h1><p>Smart Study Planner · A Constraint-Based AI Timetable Generator · C20</p></div></div><div class="guide-grid"><div class="guide-step"><span class="step-number">01</span><h3>Give your plan context</h3><p>Add subjects, exam dates, workload, priority and topics. Set available hours, breaks and your daily study limit.</p></div><div class="guide-step"><span class="step-number">02</span><h3>Generate and inspect</h3><p>Build a timetable, inspect constraint checks and unallocated hours, then track your completed sessions.</p></div><div class="guide-step"><span class="step-number">03</span><h3>Experiment with prompts</h3><p>Compare baseline, structured and refined prompts using actual AI runs. Retain every result, including failures.</p></div></div><section class="panel section-space"><div class="panel-heading"><h2>How the project works</h2>${icon('code',18)}</div><div class="panel-body"><div class="workflow"><span>Subjects + constraints</span>${icon('arrow',15)}<span>Prompt / constraint engine</span>${icon('arrow',15)}<span>Structured timetable</span>${icon('arrow',15)}<span>Independent checks</span></div><div class="guide-copy"><p>The local scheduler creates a plan without requiring an API key. Optional AI mode uses one of three versioned prompts to request a structured timetable from the configured model. The backend checks sessions against availability, deadlines, overlap, breaks and workload limits. Incomplete coverage stays visible instead of being hidden.</p><h3>What to demonstrate</h3><ul><li>A normal workload that fits and an overloaded workload that cannot fit.</li><li>A blocked date, an approaching exam, and multiple available windows.</li><li>Completion tracking and CSV, JSON or calendar export.</li><li>Real prompt experiment records and reproducible constraint test results.</li></ul><h3>Understand the limits</h3><p>The scheduler is a deterministic heuristic, not a guarantee of a globally optimal timetable. Estimates are supplied by the student. Study-time preference is a soft preference. A structurally valid AI output can still be unhelpful, so inspect each plan before relying on it. Engine runs are not LLM experiments.</p><h3>Responsible use</h3><p>Keep private information out of subject names and topics. API keys stay on the server. Local scheduling does not send your data to an AI provider. AI mode sends the saved planning inputs to the configured provider. Document AI-assisted development and review the project with your team.</p></div></div></section><section class="panel section-space"><div class="panel-heading"><div><h2>Your submission materials</h2><p>Editable supporting files are included in the project’s docs folder.</p></div>${icon('file',17)}</div><div class="panel-body"><div class="file-list">${[['FEATURES-GUIDE.md','Features guide','Themes, Pomodoro, syllabus uploads and custom AI connections'],['REPORT.md','Project report','Problem, architecture, prompt design, evaluation and responsible AI'],['CHAT-GUIDE.md','Planning assistant guide','Supported requests, previewing changes, Apply and Undo'],['PROMPT-ITERATIONS.md','Prompt development record','Baseline and refinements, with evidence and evaluation guidance'],['SUBMISSION-CHECKLIST.md','Milestone checklist','Map the working project to the supplied assessment guidelines'],['DEMO-SCRIPTS.md','Demonstration scripts','Short demo, final presentation and project communication drafts'],['CONTRIBUTIONS.csv','Team contribution log','Record actual contributions, dates and supporting evidence']].map(([file,title,desc])=>`<a class="file-item" href="/docs/${file}" target="_blank" rel="noopener">${icon('file',20)}<span><strong>${title}</strong><small>${desc}</small></span>${icon('arrowUp',14)}</a>`).join('')}</div><div class="alert info section-space">${icon('help',16)}<p>Fill in your team details, actual feedback and recorded AI experiment results. The course PDF has inconsistent team-size and first-milestone dates; confirm those details using the official LMS announcement.</p></div></div></section>`;
}

function openModal(content) {const modal=$('#modal');if(!modal.open)modalReturnFocus=describeFocus();modal.innerHTML=content;if(!modal.open)modal.showModal();}
function modalHeader(title) {return `<div class="modal-header"><h2 id="modal-title">${title}</h2><button class="icon-button" data-action="close-modal" aria-label="Close dialog">${icon('close',18)}</button></div>`;}
function subjectModal(id) {
  const s=state.config.subjects.find(x=>x.id===id) || {id:'',name:'',examDate:addDays(state.config.endDate,1),hours:6,priority:2,difficulty:2,topics:[]};
  openModal(`${modalHeader(s.id?'Edit subject':'A new subject, a clearer goal')}<form id="subject-form" class="modal-body" data-id="${esc(s.id)}"><div class="form-grid"><label class="field full"><span>Subject name</span><input name="name" value="${esc(s.name)}" placeholder="e.g. Data Structures" maxlength="120" required autofocus></label>${inputField('Exam date','examDate',s.examDate,'date','required')}${inputField('Total study goal (hrs)','hours',s.hours,'number','min="0.25" max="500" step="0.25" required')}<label class="field"><span>Priority</span><select name="priority">${[1,2,3].map(n=>`<option value="${n}" ${s.priority===n?'selected':''}>${['','Low','Medium','High'][n]}</option>`).join('')}</select></label><label class="field"><span>Difficulty</span><select name="difficulty">${[1,2,3].map(n=>`<option value="${n}" ${s.difficulty===n?'selected':''}>${['','Foundational','Moderate','Challenging'][n]}</option>`).join('')}</select></label><label class="field full"><span>Topics to cover</span><textarea name="topics" placeholder="Arrays and linked lists&#10;Trees and graphs&#10;Sorting algorithms">${esc(s.topics.join('\n'))}</textarea><small>One topic per line. Leave empty for general preparation.</small></label></div><p class="form-error" role="alert" id="subject-error"></p><div class="form-actions"><button type="button" class="button light" data-action="close-modal">Cancel</button><button class="button" type="submit">${icon('check',15)}Save subject</button></div></form>`);
}
function sessionModal(id) {const s=state.plan?.sessions.find(x=>x.id===id);if(!s)return;openModal(`${modalHeader(esc(s.subjectName))}<div class="modal-body"><div class="session-details"><div><small>Study date</small><strong>${fmtDate(s.date,{weekday:'long',day:'numeric',month:'long'})}</strong></div><div><small>Time</small><strong>${esc(s.start)} – ${esc(s.end)} · ${s.durationMinutes} min</strong></div><div><small>Focus topic</small><strong>${esc(s.topic)}</strong></div><div><small>Session type</small><strong>${esc(s.type)}</strong></div></div><div class="reason"><strong>${s.difficulty?'Study approach · '+esc(s.difficulty):'Why this session?'}</strong><br>${esc(s.reason || 'Allocated within your availability and before the exam deadline.')}</div><div class="form-actions"><button class="button light" data-action="focus-session" data-id="${esc(s.id)}">${icon('clock',15)}Focus on this session</button><button class="button" data-action="complete" data-id="${esc(s.id)}">${icon('check',15)}${s.completed?'Mark incomplete':'Mark complete'}</button></div></div>`);}
function collectAvailability() {const form=$('#availability-form');if(!form)return clone(state.config);const data=new FormData(form);return {...clone(state.config),startDate:data.get('startDate'),endDate:data.get('endDate'),sessionMinutes:Number(data.get('sessionMinutes')),breakMinutes:Number(data.get('breakMinutes')),maxDailyHours:Number(data.get('maxDailyHours')),preferredTime:data.get('preferredTime'),availability:[...form.querySelectorAll('.window-row')].sort((a,b)=>Number(a.dataset.windowIndex)-Number(b.dataset.windowIndex)).map(row=>({day:Number(row.dataset.day),start:row.querySelector('input:first-of-type').value,end:row.querySelector('input:last-of-type').value})),blockedDates:String(data.get('blockedDates')||'').split(/[\n,]+/).map(s=>s.trim()).filter(Boolean)};}
async function saveConfig(config) {const result=await api('/api/config',{method:'PUT',body:JSON.stringify(config)});state.config=result.config;state.plan=null;state.week=monday(config.startDate);state.availabilityDraft=null;}
async function runOperation(name, operation) {if(state.busy)return;state.busy=name;render();try{await operation();}catch(error){toast(error.message,true);}finally{state.busy='';render();}}
document.addEventListener('click',async event=>{
  const el=event.target.closest('[data-action]');if(!el)return;
  const action=el.dataset.action,id=el.dataset.id;
  try {
    if(action==='menu'){setMenu(true);return;}
    if(action==='close-menu'){setMenu(false);return;}
    if(action==='close-modal'){$('#modal').close();return;}
    if(action==='add-subject'||action==='edit-subject'){subjectModal(id);return;}
    if(action==='session-detail'){sessionModal(id);return;}
    if(action==='delete-subject'){
      const subject=state.config.subjects.find(s=>s.id===id);
      openModal(`${modalHeader('Remove this subject?')}<div class="modal-body"><p class="small muted">Remove ${esc(subject?.name)} and clear the current timetable? You can add it again whenever you need.</p><div class="form-actions">${button('Keep subject','close-modal')}${button('Remove subject','confirm-delete-subject','danger','trash',`data-id="${esc(id)}"`)}</div></div>`);return;
    }
    if(action==='confirm-delete-subject'){el.disabled=true;await saveConfig({...clone(state.config),subjects:state.config.subjects.filter(s=>s.id!==id)});$('#modal').close();render();toast('Subject removed. Generate a new plan when you’re ready.');return;}
    if(action==='generate'){
      await runOperation('generate',async()=>{try{const result=await post('/api/generate',{mode:state.mode,promptVersion:state.promptVersion});state.plan=result.plan;state.week=monday(state.plan.input?.startDate || state.config.startDate);toast((state.plan.stats?.unscheduledMinutes || 0)>0?'Plan saved. Some study hours could not fit—review the warnings.':'Your new study plan is ready.');}finally{try{const latest=await api('/api/state');state.experiments=latest.experiments;}catch{/* Keep the last loaded notebook when the server is temporarily unavailable. */}}});return;
    }
    if(action==='complete'){
      const session=state.plan?.sessions.find(s=>s.id===id);if(!session)return;
      el.disabled=true;const result=await api(`/api/sessions/${encodeURIComponent(id)}`,{method:'PATCH',body:JSON.stringify({completed:!session.completed})});state.plan=result.plan;if($('#modal').open)$('#modal').close();render();toast(session.completed?'Session marked incomplete.':'One step forward. Session completed!');return;
    }
    if(action==='view-week'||action==='view-list'){state.view=action==='view-week'?'week':'list';render();return;}
    if(action==='prev-week'||action==='next-week'){state.week=addDays(state.week,action==='prev-week'?-7:7);render();return;}
    if(action==='this-week'){state.week=monday(state.plan?.input?.startDate || state.config.startDate);render();return;}
    if(action==='add-window'){
      state.availabilityDraft=collectAvailability();const day=Number(el.dataset.day);const existing=state.availabilityDraft.availability.filter(w=>w.day===day);state.availabilityDraft.availability.push({day,start:existing.length?'20:00':'17:00',end:existing.length?'21:30':'19:00'});render();return;
    }
    if(action==='remove-window'){state.availabilityDraft=collectAvailability();state.availabilityDraft.availability.splice(Number(el.dataset.index),1);render();return;}
    if(action==='reset-availability'){state.availabilityDraft=null;render();toast('Unsaved availability changes reset.');return;}
    if(action==='experiment'){
      await runOperation('experiment',async()=>{const result=await post('/api/experiments',{mode:state.mode,promptVersion:state.promptVersion});state.experiments=result.experiments || [...state.experiments,result.experiment];state.selectedExperiment=result.experiment?.id;toast(result.experiment?.error?'Experiment recorded with a failure. Inspect the output to learn why.':'Experiment recorded with its input, output and checks.');});return;
    }
    if(action==='evaluate'){await runOperation('evaluate',async()=>{const result=await post('/api/evaluate',{});state.evaluation=result.evaluation;toast(`${state.evaluation.passed} of ${state.evaluation.total} evaluation cases passed.`);});return;}
    if(action==='inspect-experiment'){state.selectedExperiment=id;render();$('.experiment-detail')?.scrollIntoView({behavior:'smooth',block:'nearest'});return;}
    if(action==='close-experiment'){state.selectedExperiment=null;render();return;}
    if(action==='delete-experiment'){openModal(`${modalHeader('Delete this experiment?')}<div class="modal-body"><p class="small muted">This removes the saved input, output and measurements from your notebook. Keep any evidence needed for your submission first.</p><div class="form-actions">${button('Keep record','close-modal')}${button('Delete record','confirm-delete-experiment','danger','trash',`data-id="${esc(id)}"`)}</div></div>`);return;}
    if(action==='confirm-delete-experiment'){el.disabled=true;const result=await api(`/api/experiments/${encodeURIComponent(id)}`,{method:'DELETE'});state.experiments=result.experiments;if(state.selectedExperiment===id)state.selectedExperiment=null;$('#modal').close();render();toast('Experiment deleted.');return;}
    if(action==='copy-prompt'){
      const p=state.prompts.find(p=>p.id===state.promptVersion);if(!p)return;const text=`SYSTEM\n${p.system}\n\nUSER\n${p.user}`;
      try{await navigator.clipboard.writeText(text);toast('Prompt copied.');}catch{openModal(`${modalHeader('Copy prompt')}<div class="modal-body"><label class="field"><span>Select and copy the prompt below</span><textarea readonly rows="15">${esc(text)}</textarea></label></div>`);$('#modal textarea').select();}return;
    }
    if(action==='print'){window.print();return;}
  } catch(error) {
    el.disabled=false;toast(error.message,true);
    if($('#modal').open){let feedback=$('#modal .form-error');if(!feedback){feedback=document.createElement('p');feedback.className='form-error';feedback.setAttribute('role','alert');$('#modal .modal-body')?.append(feedback);}feedback.textContent=error.message;}
  }
});
document.addEventListener('change',event=>{
  if(event.target.matches('[data-control="mode"]')){state.mode=event.target.value;render();}
  if(event.target.matches('input[name="promptVersion"]')){state.promptVersion=event.target.value;render();}
});
document.addEventListener('submit',async event=>{
  if(event.target.id==='subject-form'){
    event.preventDefault();const form=event.target,data=new FormData(form),saveButton=form.querySelector('button[type=submit]');saveButton.disabled=true;$('#subject-error').textContent='';
    const subject={id:form.dataset.id || crypto.randomUUID(),name:String(data.get('name')).trim(),examDate:data.get('examDate'),hours:Number(data.get('hours')),priority:Number(data.get('priority')),difficulty:Number(data.get('difficulty')),topics:String(data.get('topics')||'').split('\n').map(s=>s.trim()).filter(Boolean)};
    const config=clone(state.config);const index=config.subjects.findIndex(s=>s.id===subject.id);if(index>=0)config.subjects[index]=subject;else config.subjects.push(subject);
    try{await saveConfig(config);$('#modal').close();render();toast('Subject saved. Generate a plan to use your updated goals.');}catch(error){$('#subject-error').textContent=error.message;saveButton.disabled=false;}
  }
  if(event.target.id==='availability-form'){
    event.preventDefault();const config=collectAvailability();const btn=event.target.querySelector('button[type=submit]');btn.disabled=true;$('#availability-error').textContent='';
    try{await saveConfig(config);render();toast('Availability saved. You’re ready to generate a fresh plan.');}catch(error){$('#availability-error').textContent=error.message;btn.disabled=false;}
  }
});
window.addEventListener('hashchange',()=>{if(state.route==='availability')state.availabilityDraft=collectAvailability();state.route=routeFromHash();focusMemory=null;render();$('#main').focus({preventScroll:true});window.scrollTo({top:0,behavior:'instant'});});
mobileLayout.addEventListener('change',()=>setMenu(false,false));
document.addEventListener('keydown',event=>{
  if($('#modal').open)return;
  if($('.app-shell')?.classList.contains('menu-open')){
    if(event.key==='Escape'){event.preventDefault();setMenu(false);return;}
    if(event.key==='Tab'){
      const items=[...$('.sidebar').querySelectorAll('a[href],button:not(:disabled)')].filter(element=>element.getClientRects().length);
      const first=items[0],last=items.at(-1);
      if(event.shiftKey && document.activeElement===first){event.preventDefault();last?.focus();}
      else if(!event.shiftKey && document.activeElement===last){event.preventDefault();first?.focus();}
    }
  }else if(event.key==='Escape'){
    const menu=$('.export-menu[open]');if(menu){menu.open=false;$('summary',menu).focus();}
  }
});
$('#modal').addEventListener('close',()=>requestAnimationFrame(()=>{if(!restoreFocus(modalReturnFocus) && document.activeElement===document.body)$('#main')?.focus({preventScroll:true});modalReturnFocus=null;}));

const chatUI={open:false,draft:'',mode:'local',busy:'',error:'',confirmClear:false,returnFocus:null,scrollToEnd:false,focusComposer:false};
const chatState=()=>state.chat || {messages:[],pending:null,undo:null};
function chatBlockedReason(){
  if($('#modal').open)return 'Finish editing your subject before applying an assistant update.';
  const draft=state.route==='availability'?collectAvailability():state.availabilityDraft;
  if(draft && JSON.stringify(draft)!==JSON.stringify(state.config))return 'Save or reset your unsaved availability changes before applying this update.';
  if(state.busy)return 'Wait for the current planner action to finish before applying this update.';
  return '';
}
function syncChatModality(){
  const mobileModal=chatUI.open && mobileLayout.matches;
  const updating=['apply','undo'].includes(chatUI.busy);
  $('#app').inert=mobileModal || updating;
  document.body.classList.toggle('chat-modal-open',mobileModal);
  document.body.classList.toggle('chat-open',chatUI.open);
}
function chatMessage(message){
  const user=message.role==='user';
  const stamp=new Date(message.createdAt);
  const time=Number.isNaN(stamp.getTime())?'':stamp.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'});
  return `<article class="chat-message ${user?'chat-user':'chat-assistant'}"><div class="chat-message-meta"><span>${user?'You':`${icon('spark',12)} StudyFlow`}</span><time datetime="${esc(message.createdAt)}">${time}</time></div><div class="chat-message-text">${esc(message.text)}</div>${!user?`<span class="chat-message-source">${message.mode==='ai'?'AI provider':'Local commands'}</span>`:''}</article>`;
}
function renderChat(){
  if(!state.config || !$('#chat-root'))return;
  const conversation=chatState(),pending=conversation.pending,blocked=chatBlockedReason();
  const oldComposer=$('#chat-composer'),focused=document.activeElement;
  const focusInComposer=focused===oldComposer;
  const selection=focusInComposer?[oldComposer.selectionStart,oldComposer.selectionEnd]:null;
  const oldFocusAction=$('#chat-root').contains(focused)?focused?.dataset?.action:null;
  const wasMode=focused?.id==='chat-mode';
  const oldScroll=$('.chat-scroll'),scrollTop=oldScroll?.scrollTop || 0;
  const nearEnd=!oldScroll || oldScroll.scrollHeight-oldScroll.scrollTop-oldScroll.clientHeight<80;
  const busy=Boolean(chatUI.busy);
  const samples=['Limit study to 3 hours a day','Use 45 minute sessions and 15 minute breaks','Keep Sundays free','What can you change?'];
  $('#chat-root').innerHTML=`<button class="chat-launcher" data-action="chat-open" aria-controls="plan-assistant" aria-expanded="${chatUI.open}" ${chatUI.open?'hidden':''}>${icon('spark',19)}<span>Plan assistant</span>${pending?'<span class="chat-notification" aria-label="A change is ready to review"></span>':''}</button>${chatUI.open?`<div class="chat-backdrop" data-action="chat-close" aria-hidden="true"></div><aside id="plan-assistant" class="assistant-drawer" role="${mobileLayout.matches?'dialog':'complementary'}" ${mobileLayout.matches?'aria-modal="true"':''} aria-labelledby="chat-title"><header class="chat-header"><div class="chat-title-icon">${icon('spark',20)}</div><div class="chat-header-copy"><h2 id="chat-title">Your plan assistant</h2><p>A small conversation. A clearer plan.</p></div><button class="chat-icon-button" data-action="chat-close" aria-label="Close plan assistant">${icon('close',18)}</button></header><div class="chat-toolbar"><label class="chat-mode-label" for="chat-mode">Mode</label><select id="chat-mode" ${busy?'disabled':''}><option value="local" ${chatUI.mode==='local'?'selected':''}>Local commands</option><option value="ai" ${chatUI.mode==='ai'?'selected':''} ${state.health?.ai?.configured?'':'disabled'}>${state.health?.ai?.configured?`${esc(state.health.ai.provider)} AI`:'AI · setup required'}</option></select><button class="chat-icon-button" data-action="chat-clear" aria-label="Clear conversation" title="Clear conversation" ${busy || !conversation.messages?.length?'disabled':''}>${icon('trash',15)}</button></div>${chatUI.confirmClear?`<div class="chat-confirm"><p>Clear this conversation and its pending changes?</p><div><button class="button light small-btn" data-action="chat-cancel-clear">Keep conversation</button><button class="button danger small-btn" data-action="chat-confirm-clear">Clear</button></div></div>`:''}<div class="chat-scroll" tabindex="0" role="region" aria-label="Plan assistant conversation"><div class="chat-welcome"><span class="chat-welcome-leaf">${icon('leaf',23)}</span><h3>A plan that can change with you.</h3><p>Tell me what you’d like to adjust. I’ll show you the changes before updating your timetable.</p></div>${conversation.messages?.length?`<div class="chat-messages" role="log" aria-label="Conversation messages" aria-live="polite" aria-relevant="additions text">${conversation.messages.map(chatMessage).join('')}</div>`:`<div class="chat-suggestions"><span class="chat-section-label">A few ways to start</span>${samples.map((sample,index)=>`<button class="chat-suggestion" data-action="chat-sample" data-sample="${index}"><span>${esc(sample)}</span>${icon('arrow',13)}</button>`).join('')}</div>`}${chatUI.busy==='send'?`<div class="chat-thinking" role="status"><span class="chat-thinking-dots"><i></i><i></i><i></i></span>Reading your request…</div>`:''}${pending?`<section class="chat-proposal" aria-labelledby="chat-proposal-title"><div class="chat-proposal-heading">${icon('calendar',17)}<div><span class="chat-section-label">Ready for your review</span><h3 id="chat-proposal-title">Here’s what will change</h3></div></div><ul>${(pending.changes || []).map(change=>`<li>${icon('check',13)}<span>${esc(change)}</span></li>`).join('')}</ul><p class="chat-proposal-note">Your timetable will be regenerated and checked against the updated rules.</p>${blocked?`<p class="chat-blocked">${icon('warning',14)}<span>${esc(blocked)}</span></p>`:''}<button class="button full" data-action="chat-apply" ${busy || blocked?'disabled':''}>${chatUI.busy==='apply'?'<span class="spinner"></span>':icon('check',15)}${chatUI.busy==='apply'?'Updating your timetable…':'Apply & update timetable'}</button><button class="chat-text-button" data-action="chat-dismiss" ${busy?'disabled':''}>Dismiss this change</button></section>`:''}${conversation.undo?`<div class="chat-undo"><div>${icon('clock',15)}<span>You can undo the latest assistant update.</span></div><button class="button light small-btn" data-action="chat-undo" ${busy || blocked?'disabled':''}>${chatUI.busy==='undo'?'<span class="spinner"></span>':icon('left',12)}${chatUI.busy==='undo'?'Restoring…':'Undo update'}</button>${blocked && !pending?`<p class="chat-blocked">${esc(blocked)}</p>`:''}</div>`:''}</div><div class="chat-bottom">${chatUI.error?`<div class="chat-error" role="alert">${icon('warning',15)}<p>${esc(chatUI.error)}</p><button class="chat-icon-button" data-action="chat-dismiss-error" aria-label="Dismiss error">${icon('close',13)}</button></div>`:''}<form id="chat-form" class="chat-composer-form"><label class="visually-hidden" for="chat-composer">Tell the assistant how to change your study plan</label><textarea id="chat-composer" name="message" rows="3" maxlength="4000" placeholder="e.g. Limit study to 3 hours a day…" aria-describedby="chat-composer-help">${esc(chatUI.draft)}</textarea><div class="chat-composer-actions"><span id="chat-composer-help">Enter to send · Shift + Enter for a new line</span><button class="chat-send" type="submit" aria-label="Send message" ${busy || !chatUI.draft.trim()?'disabled':''}>${chatUI.busy==='send'?'<span class="spinner"></span>':icon('arrow',18)}</button></div></form><p class="chat-privacy">${icon(chatUI.mode==='ai'?'shield':'leaf',12)}${chatUI.mode==='ai'?'Your saved AI provider receives your message and planning context. Avoid private information.':'Local commands run on your computer. No AI API key needed.'}</p></div></aside>`:''}`;
  syncChatModality();
  if(!chatUI.open)return;
  if(focusInComposer || chatUI.focusComposer){const composer=$('#chat-composer');composer.focus({preventScroll:true});if(selection)composer.setSelectionRange(...selection);chatUI.focusComposer=false;}
  else if(wasMode)$('#chat-mode')?.focus({preventScroll:true});
  else if(oldFocusAction){const next=[...$('#chat-root').querySelectorAll('[data-action]')].find(element=>element.dataset.action===oldFocusAction);if(next && !next.disabled)next.focus({preventScroll:true});}
  const nextScroll=$('.chat-scroll');if(nextScroll)nextScroll.scrollTop=chatUI.scrollToEnd || nearEnd?nextScroll.scrollHeight:scrollTop;
  chatUI.scrollToEnd=false;
}
function openChat(){
  if($('#modal').open)return;
  chatUI.returnFocus=document.activeElement;chatUI.open=true;chatUI.focusComposer=true;chatUI.scrollToEnd=true;
  setMenu(false,false);renderChat();
}
function closeChat(){chatUI.open=false;chatUI.confirmClear=false;renderChat();const target=chatUI.returnFocus?.isConnected?chatUI.returnFocus:$('.chat-launcher');target?.focus({preventScroll:true});}
async function chatRequest(kind,url,body={}){
  if(chatUI.busy)return;
  if(['apply','undo'].includes(kind)){const blocked=chatBlockedReason();if(blocked){chatUI.error=blocked;renderChat();return;}}
  chatUI.busy=kind;chatUI.error='';chatUI.confirmClear=false;renderChat();
  try{
    const result=await post(url,body);
    if(result.chat)state.chat=result.chat;
    if(result.config){state.config=result.config;state.plan=result.plan;state.availabilityDraft=null;state.week=monday(result.plan?.input?.startDate || result.config.startDate);render();}
    if(kind==='send' && chatUI.draft.trim()===body.message)chatUI.draft='';
    if(kind==='apply')toast(result.plan?.stats?.unscheduledMinutes>0?'Timetable updated. Some study hours could not fit; review the warnings.':'Your timetable is updated.');
    if(kind==='undo')toast('The previous planner setup and timetable have been restored.');
    chatUI.scrollToEnd=true;
  }catch(error){
    chatUI.error=error.message;
    if(error.status===409){
      try{const fresh=await api('/api/state');Object.assign(state,{config:fresh.config,plan:fresh.plan,chat:fresh.chat,experiments:fresh.experiments});render();}catch{/* Keep the error and draft visible if refreshing also fails. */}
    }
  }finally{chatUI.busy='';chatUI.focusComposer=true;renderChat();}
}
function sendChat(message=chatUI.draft){const text=String(message).trim();if(!text || chatUI.busy)return;chatUI.draft=text;return chatRequest('send','/api/chat',{message:text,mode:chatUI.mode});}
document.addEventListener('click',event=>{
  const el=event.target.closest('[data-action^="chat-"]');if(!el || el.disabled)return;
  const action=el.dataset.action,conversation=chatState();
  if(action==='chat-open')openChat();
  else if(action==='chat-close')closeChat();
  else if(action==='chat-sample'){const samples=['Limit study to 3 hours a day','Use 45 minute sessions and 15 minute breaks','Keep Sundays free','What can you change?'];sendChat(samples[Number(el.dataset.sample)]);}
  else if(action==='chat-apply' && conversation.pending)chatRequest('apply','/api/chat/apply',{proposalId:conversation.pending.id});
  else if(action==='chat-dismiss' && conversation.pending)chatRequest('dismiss','/api/chat/dismiss',{proposalId:conversation.pending.id});
  else if(action==='chat-undo')chatRequest('undo','/api/chat/undo');
  else if(action==='chat-clear'){chatUI.confirmClear=true;renderChat();$('.chat-confirm [data-action="chat-cancel-clear"]')?.focus();}
  else if(action==='chat-cancel-clear'){chatUI.confirmClear=false;renderChat();$('[data-action="chat-clear"]')?.focus();}
  else if(action==='chat-confirm-clear')chatRequest('clear','/api/chat/clear');
  else if(action==='chat-dismiss-error'){chatUI.error='';renderChat();$('#chat-composer')?.focus();}
});
document.addEventListener('input',event=>{
  if(event.target.id==='chat-composer'){chatUI.draft=event.target.value;$('.chat-send').disabled=Boolean(chatUI.busy || !chatUI.draft.trim());}
  else if(chatUI.open && event.target.closest('#availability-form') && (chatState().pending || chatState().undo))renderChat();
});
document.addEventListener('change',event=>{if(event.target.id==='chat-mode'){chatUI.mode=event.target.value;chatUI.error='';renderChat();}});
document.addEventListener('submit',event=>{if(event.target.id==='chat-form'){event.preventDefault();sendChat();}});
document.addEventListener('keydown',event=>{
  if(!chatUI.open || $('#modal').open)return;
  if(event.key==='Escape'){event.preventDefault();closeChat();return;}
  if(event.target.id==='chat-composer' && event.key==='Enter' && !event.shiftKey && !event.isComposing){event.preventDefault();sendChat();return;}
  if(mobileLayout.matches && event.key==='Tab'){
    const items=[...$('#plan-assistant').querySelectorAll('button:not(:disabled),select:not(:disabled),textarea,[tabindex="0"]')].filter(element=>element.getClientRects().length);
    const first=items[0],last=items.at(-1);
    if(!$('#plan-assistant').contains(document.activeElement)){event.preventDefault();(event.shiftKey?last:first)?.focus();}
    else if(event.shiftKey && document.activeElement===first){event.preventDefault();last?.focus();}
    else if(!event.shiftKey && document.activeElement===last){event.preventDefault();first?.focus();}
  }
});
mobileLayout.addEventListener('change',()=>renderChat());
$('#modal').addEventListener('click',event=>{if(event.target===$('#modal')){const rect=$('#modal').getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)$('#modal').close();}});
async function boot(){try{const [health,data,promptData]=await Promise.all([api('/api/health'),api('/api/state'),api('/api/prompts')]);Object.assign(state,data);state.health=health;state.prompts=promptData.prompts;state.schema=promptData.schema;state.route=routeFromHash();state.week=monday(state.plan?.input?.startDate || state.config.startDate);render();}catch(error){$('#app').innerHTML=`<div class="boot"><span class="brand-symbol">S</span><h1>Let’s reconnect.</h1><p class="muted" style="text-align:center;max-width:420px;padding:0 20px">${esc(error.message)}</p><button class="button" id="retry">Try again</button></div>`;$('#retry').addEventListener('click',boot);}}
const setup=createSetup({state,post,esc,icon,render,toast,isoDate,monday});
const features=createFeatures({state,api,post,saveConfig,render,toast,icon,esc});
boot();
