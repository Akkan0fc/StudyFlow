import { requestProvider, publicProvider, providerFromEnv } from './provider.mjs';
import { randomUUID } from 'node:crypto';
import { buildPrompt, outputSchema } from './prompts.mjs';
import { evaluatePlan } from './scheduler.mjs';

export function aiStatus(env = process.env, provider) { const s=publicProvider(provider || providerFromEnv(env)); return {configured:s.configured,provider:s.provider,model:s.model || null}; }

export function parseOutput(text) {
  const clean = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  let parsed;
  try { parsed = JSON.parse(clean); } catch { throw new Error('The model response was not valid JSON.'); }
  if (!parsed || !Array.isArray(parsed.sessions) || parsed.sessions.length > 3000 || !Array.isArray(parsed.warnings) || parsed.warnings.length > 100) {
    throw new Error('The model response must contain sessions (at most 3000) and warnings arrays.');
  }
  for (const item of parsed.sessions) {
    if (!item || typeof item !== 'object' || !['subjectId', 'date', 'start', 'end', 'topic', 'reason'].every(key => typeof item[key] === 'string' && item[key].length <= 1000) ||
      !Number.isInteger(item.durationMinutes) || !['study', 'revision'].includes(item.type)) {
      throw new Error('A model session is missing required fields or contains invalid field types.');
    }
  }
  if (!parsed.warnings.every(w => typeof w === 'string' && w.length <= 2000)) throw new Error('Model warnings must be short text strings.');
  return parsed;
}

export function summarize(input, sessions) {
  const subjectSummaries = input.subjects.map(subject => {
    const requiredMinutes = Math.round(subject.hours * 60);
    const allocatedMinutes = sessions.filter(s => s.subjectId === subject.id).reduce((sum, s) => sum + s.durationMinutes, 0);
    return { subjectId: subject.id, name: subject.name, requiredMinutes, allocatedMinutes, unscheduledMinutes: Math.max(0, requiredMinutes - allocatedMinutes) };
  });
  const requiredMinutes = subjectSummaries.reduce((n, s) => n + s.requiredMinutes, 0);
  const allocatedMinutes = subjectSummaries.reduce((n, s) => n + s.allocatedMinutes, 0);
  const unscheduledMinutes = subjectSummaries.reduce((n, s) => n + s.unscheduledMinutes, 0);
  return { subjectSummaries, stats: {
    requiredMinutes, allocatedMinutes, unscheduledMinutes, coveragePercent: requiredMinutes ? Math.round((requiredMinutes - unscheduledMinutes) / requiredMinutes * 1000) / 10 : 100,
    sessionCount: sessions.length, studyDays: new Set(sessions.map(s => s.date)).size, feasible: unscheduledMinutes === 0
  } };
}

export async function generateWithAI(input, version, { env = process.env, fetchImpl = fetch, provider } = {}) {
  if (!aiStatus(env, provider).configured) throw Object.assign(new Error('AI is not configured. Open AI settings and save a provider, endpoint and model. The constraint engine is available now.'), { status: 503 });
  const started = performance.now();
  const attempts = [];
  let feedback;
  const limit = version === 'v3' ? 2 : 1;
  for (let index = 0; index < limit; index++) {
    const prompt = buildPrompt(version, input, feedback);
    let rawOutput = '';
    let parsed = null;
    let checks = [];
    let error = null;
    let usage = null;
    let transportFailure = true;
    try {
      const result = await requestProvider({provider, env, fetchImpl, instructions:prompt.system, input:prompt.user, schema:outputSchema, schemaName:'study_plan', structured:version!=='v1'});
      transportFailure = false;
      usage = result.usage;
      rawOutput = result.rawOutput;
      parsed = parseOutput(rawOutput);
      checks = evaluatePlan(input, parsed.sessions);
      // Coverage is a separate quality measure; an honest partial timetable is permitted.
      const failed = checks.filter(c => c.id !== 'coverage' && !c.passed);
      const grounded = parsed.sessions.every(s => {
        const subject = input.subjects.find(item => item.id === s.subjectId);
        return subject && (subject.topics.length ? subject.topics.includes(s.topic) : s.topic === subject.name);
      });
      checks.push({ id: 'topic-grounding', label: 'Topics grounded in student input', passed: grounded, details: grounded ? 'Every topic comes from the supplied subject data.' : 'The model introduced an unknown topic.' });
      if (failed.length || !grounded) error = 'The AI timetable failed independent constraint checks and was not accepted.';
    } catch (caught) {
      error = caught.name === 'TimeoutError' || caught.name === 'AbortError' ? 'OpenAI timed out. Try a smaller plan.' : caught.message;
      // A model repair cannot correct a network, timeout, or provider transport failure.
      if (caught.noRepair || (transportFailure && caught.noRepair !== false)) index = limit;
    }
    attempts.push({ rawOutput, checks, error, usage, prompt });
    if (!error) {
      const subjects = new Map(input.subjects.map(s => [s.id, s]));
      const sessions = parsed.sessions.map(s => ({ ...s, id: randomUUID(), subjectName: subjects.get(s.subjectId).name, completed: false })).sort((a,b) => `${a.date}${a.start}`.localeCompare(`${b.date}${b.start}`));
      const summary = summarize(input, sessions);
      const warnings = [...parsed.warnings];
      if (summary.stats.unscheduledMinutes) warnings.push(`${summary.stats.unscheduledMinutes} requested study minutes remain unallocated. Review capacity and deadlines.`);
      return { sessions, warnings, checks, ...summary, attempts, rawOutput, latencyMs: Math.round(performance.now() - started), error: null };
    }
    feedback = { violations: checks.filter(c => !c.passed), error, previousOutput: rawOutput.slice(0, 50000) };
  }
  const last = attempts.at(-1);
  return { sessions: [], warnings: [], checks: last.checks, ...summarize(input, []), attempts, rawOutput: last.rawOutput,
    latencyMs: Math.round(performance.now() - started), error: last.error };
}
