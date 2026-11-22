export const defaults = { focus:25, short:5, long:15, cycles:4 };
export function settingsValid(s) {
  return s && ['focus','short','long','cycles'].every(k=>Number.isInteger(s[k]) && s[k]>=1 && s[k]<=(k==='cycles'?12:120));
}
export function newTimer(settings=defaults) {
  return {settings:{...settings},phase:'focus',remainingMs:settings.focus*60000,running:false,endAt:null,rounds:0,focusMinutes:0,sessionId:'',notice:''};
}
export function restoreTimer(raw,now=Date.now()) {
  if(!raw || !settingsValid(raw.settings) || !['focus','short','long'].includes(raw.phase) || !Number.isFinite(raw.remainingMs) || raw.remainingMs<0 || raw.remainingMs>7200000 || !Number.isInteger(raw.rounds) || raw.rounds<0 || !Number.isFinite(raw.focusMinutes) || raw.focusMinutes<0 || (raw.running && (!Number.isFinite(raw.endAt) || raw.endAt>now+7200000)))return newTimer();
  return {...newTimer(raw.settings),...raw,sessionId:typeof raw.sessionId==='string'?raw.sessionId.slice(0,80):'',notice:typeof raw.notice==='string'?raw.notice.slice(0,300):''};
}
export function timeLeft(t,now=Date.now()){return t.running?Math.max(0,t.endAt-now):t.remainingMs;}
export function tick(t,now=Date.now()) {
  if(!t.running || timeLeft(t,now)>0)return t;
  const focus=t.phase==='focus', rounds=t.rounds+(focus?1:0);
  const phase=focus?(rounds%t.settings.cycles===0?'long':'short'):'focus';
  return {...t,phase,rounds,focusMinutes:t.focusMinutes+(focus?t.settings.focus:0),running:false,endAt:null,remainingMs:t.settings[phase]*60000,
    notice:focus?`Focus round complete. Your ${phase==='long'?'long':'short'} break is ready.`:'Break complete. Start the next focus round when you’re ready.'};
}
export function toggleTimer(t,now=Date.now()) {
  const current=tick(t,now);
  return current.running?{...current,running:false,remainingMs:timeLeft(current,now),endAt:null}:{...current,running:true,endAt:now+current.remainingMs,notice:''};
}
export function resetPhase(t){return {...t,running:false,endAt:null,remainingMs:t.settings[t.phase]*60000,notice:''};}
