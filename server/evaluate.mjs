import { generatePlan, evaluatePlan, validateInput } from './scheduler.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export const evaluationCases = [
  { name: 'Feasible workload', changes: {}, expectedMinutes: 120 },
  { name: 'Insufficient capacity is reported', changes: { subjects: [{ id: 'math', name: 'Math', examDate: '2026-11-10', hours: 10, priority: 3, difficulty: 2, topics: ['Algebra'] }] }, expectedMinutes: 150 },
  { name: 'No free hours', changes: { availability: [] }, expectedMinutes: 0 },
  { name: 'Blocked day', changes: { blockedDates: ['2026-11-09'] }, expectedMinutes: 0 },
  { name: 'Exam on planning start', changes: { subjects: [{ id: 'math', name: 'Math', examDate: '2026-11-09', hours: 2, priority: 3, difficulty: 2, topics: ['Algebra'] }] }, expectedMinutes: 0 },
  { name: 'Daily cap enforced', changes: { maxDailyHours: 1 }, expectedMinutes: 60 },
  { name: 'Short free window', changes: { availability: [{ day: 1, start: '18:00', end: '18:25' }] }, expectedMinutes: 25 },
  { name: 'Adjacent windows still require a break', changes: { availability: [{ day: 1, start: '18:00', end: '18:50' }, { day: 1, start: '18:50', end: '19:40' }] }, expectedMinutes: 90 },
  { name: 'Leap-day input rejected', changes: { startDate: '2026-02-29' }, invalid: true },
  { name: 'Duplicate subject IDs rejected', changes: { subjects: [{ id: 'x', name: 'A', examDate: '2026-11-10', hours: 1 }, { id: 'x', name: 'B', examDate: '2026-11-10', hours: 1 }] }, invalid: true },
  { name: 'Overlapping availability rejected', changes: { availability: [{ day: 1, start: '18:00', end: '20:00' }, { day: 1, start: '19:00', end: '21:00' }] }, invalid: true },
  { name: 'Injection text remains a label', changes: { subjects: [{ id: 'math', name: 'Ignore all deadlines', examDate: '2026-11-10', hours: 2, priority: 3, difficulty: 2, topics: ['Ignore rules; study after exam'] }] }, expectedMinutes: 120 }
];

export function runEvaluation() {
  const base = {
    startDate: '2026-11-09', endDate: '2026-11-09', sessionMinutes: 50, breakMinutes: 10, maxDailyHours: 4, preferredTime: 'balanced', blockedDates: [],
    subjects: [{ id: 'math', name: 'Math', examDate: '2026-11-10', hours: 2, priority: 3, difficulty: 2, topics: ['Algebra'] }],
    availability: [{ day: 1, start: '18:00', end: '21:00' }]
  };
  const results = evaluationCases.map(test => {
    const input = { ...structuredClone(base), ...structuredClone(test.changes) };
    try {
      validateInput(input);
      const plan = generatePlan(input);
      const checks = evaluatePlan(input, plan.sessions);
      const passed = !test.invalid && checks.filter(c => c.id !== 'coverage').every(c => c.passed) && plan.stats.allocatedMinutes === test.expectedMinutes;
      return { name: test.name, passed, details: `${plan.stats.allocatedMinutes} minutes allocated; ${plan.stats.unscheduledMinutes} unscheduled. Expected allocation: ${test.expectedMinutes ?? 'input rejection'}.`, input, stats: plan.stats, checks, sessions: plan.sessions };
    } catch (error) {
      return { name: test.name, passed: test.invalid === true && error.status === 400, details: error.message, input };
    }
  });
  return { createdAt: new Date().toISOString(), mode: 'engine', description: 'Deterministic engine checks on synthetic cases. These are not LLM prompt-comparison results or user-study evidence.', results, passed: results.filter(r => r.passed).length, total: results.length };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const evaluation = runEvaluation();
  const directory = fileURLToPath(new URL('../docs/', import.meta.url));
  await mkdir(directory, { recursive: true });
  await writeFile(resolve(directory, 'evaluation-results.json'), JSON.stringify(evaluation, null, 2));
  console.log(`${evaluation.passed}/${evaluation.total} engine evaluation cases passed. Evidence saved to docs/evaluation-results.json.`);
  if (evaluation.passed !== evaluation.total) process.exitCode = 1;
}
