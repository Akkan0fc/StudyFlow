import test from 'node:test';
import assert from 'node:assert/strict';
import { validateInput, generatePlan, evaluatePlan } from '../server/scheduler.mjs';

const fixture = (patch = {}) => ({
  startDate: '2026-11-09', endDate: '2026-11-15', sessionMinutes: 50, breakMinutes: 10,
  maxDailyHours: 4, preferredTime: 'balanced', blockedDates: [],
  subjects: [
    { id: 'math', name: 'Mathematics', examDate: '2026-11-16', hours: 4, priority: 3, difficulty: 3, topics: ['Matrices', 'Calculus'] },
    { id: 'db', name: 'Databases', examDate: '2026-11-18', hours: 3, priority: 2, difficulty: 2, topics: ['SQL'] },
  ],
  availability: [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, start: '17:00', end: '21:00' })),
  ...patch,
});

const hardChecks = (plan) => plan.checks.filter((check) => check.id !== 'coverage');

test('complete feasible plan satisfies every independently evaluated constraint', () => {
  const input = fixture();
  const plan = generatePlan(input);
  assert.equal(plan.stats.requiredMinutes, 420);
  assert.equal(plan.stats.allocatedMinutes, 420);
  assert.equal(plan.stats.unscheduledMinutes, 0);
  assert.equal(plan.stats.coveragePercent, 100);
  assert.equal(plan.stats.feasible, true);
  assert.ok(plan.checks.every((check) => check.passed));
  assert.ok(plan.sessions.every((session) => session.id && session.topic && session.reason && session.completed === false));
  assert.deepEqual(plan, generatePlan(input));
});

test('impossible capacity produces a valid partial plan with explicit deficit', () => {
  const plan = generatePlan(fixture({ endDate: '2026-11-09', availability: [{ day: 1, start: '17:00', end: '18:00' }] }));
  assert.equal(plan.stats.allocatedMinutes, 50);
  assert.equal(plan.stats.unscheduledMinutes, 370);
  assert.equal(plan.stats.feasible, false);
  assert.ok(plan.warnings.length > 0);
  assert.ok(hardChecks(plan).every((check) => check.passed));
  assert.equal(plan.checks.find((check) => check.id === 'coverage').passed, false);
});

test('empty availability and zero daily capacity are honest infeasible cases', () => {
  for (const patch of [{ availability: [] }, { maxDailyHours: 0 }]) {
    const plan = generatePlan(fixture(patch));
    assert.deepEqual(plan.sessions, []);
    assert.equal(plan.stats.allocatedMinutes, 0);
    assert.equal(plan.stats.unscheduledMinutes, 420);
    assert.equal(plan.stats.coveragePercent, 0);
    assert.equal(plan.stats.feasible, false);
  }
});

test('past exams and exam days are never used for study', () => {
  const input = fixture();
  input.subjects[0].examDate = input.startDate;
  input.subjects[1].examDate = '2026-11-10';
  const plan = generatePlan(input);
  assert.ok(plan.sessions.every((session) => session.subjectId === 'db' && session.date === '2026-11-09'));
  assert.equal(plan.subjectSummaries.find((subject) => subject.subjectId === 'math').unscheduledMinutes, 240);
  assert.ok(plan.warnings.some((message) => message.includes('on or before')));
});

test('blocked dates and inclusive end date use calendar dates without timezone shift', () => {
  const plan = generatePlan(fixture({ startDate: '2026-11-09', endDate: '2026-11-10', blockedDates: ['2026-11-09'] }));
  assert.ok(plan.sessions.length > 0);
  assert.ok(plan.sessions.every((session) => session.date === '2026-11-10'));
});

test('fractional hours and short residual sessions preserve the exact requested minutes', () => {
  const input = fixture({ subjects: [{ id: 'x', name: 'Logic', examDate: '2026-11-16', hours: 1.25, priority: 1, difficulty: 1, topics: [] }] });
  const plan = generatePlan(input);
  assert.deepEqual(plan.sessions.map((session) => session.durationMinutes), [50, 25]);
  assert.equal(plan.stats.allocatedMinutes, 75);
  assert.ok(plan.checks.every((check) => check.passed));
});

test('breaks apply across separate availability windows in both time preferences', () => {
  for (const preferredTime of ['morning', 'evening']) {
    const plan = generatePlan(fixture({
      endDate: '2026-11-09', sessionMinutes: 30, breakMinutes: 15, preferredTime,
      availability: [{ day: 1, start: '17:00', end: '17:30' }, { day: 1, start: '17:35', end: '18:05' }],
    }));
    assert.equal(plan.stats.allocatedMinutes, 50);
    assert.equal(plan.sessions[1].start === '17:45' || plan.sessions[0].end === '17:20', true);
    assert.ok(hardChecks(plan).every((check) => check.passed));
  }
});

test('evening preference starts from the latest available time', () => {
  const input = fixture({ subjects: [{ id: 'x', name: 'Logic', examDate: '2026-11-16', hours: 0.5, priority: 1, difficulty: 1, topics: [] }] });
  const morning = generatePlan({ ...input, preferredTime: 'morning' });
  const evening = generatePlan({ ...input, preferredTime: 'evening' });
  assert.equal(morning.sessions[0].start, '17:00');
  assert.equal(evening.sessions[0].start, '20:30');
  assert.equal(evening.sessions[0].end, '21:00');
});

test('earliest deadlines win, then priorities influence equal-deadline allocation', () => {
  const input = fixture({ endDate: '2026-11-09', maxDailyHours: 0.5 });
  input.subjects[0].examDate = '2026-11-19';
  input.subjects[1].examDate = '2026-11-10';
  assert.equal(generatePlan(input).sessions[0].subjectId, 'db');
  input.subjects[0].examDate = input.subjects[1].examDate;
  assert.equal(generatePlan(input).sessions[0].subjectId, 'math');
});

test('daily caps measure study time and midnight window ends are supported', () => {
  const plan = generatePlan(fixture({ endDate: '2026-11-09', maxDailyHours: 0.75, availability: [{ day: 1, start: '23:00', end: '24:00' }] }));
  assert.equal(plan.stats.allocatedMinutes, 45);
  assert.equal(plan.sessions[0].end, '23:45');
  assert.ok(hardChecks(plan).every((check) => check.passed));
});

test('breaks also apply across midnight on consecutive planning dates', () => {
  for (const preferredTime of ['morning', 'evening']) {
    const input = fixture({
      endDate: '2026-11-10', preferredTime, breakMinutes: 15,
      availability: [{ day: 1, start: '23:10', end: '24:00' }, { day: 2, start: '00:00', end: '01:00' }],
    });
    const plan = generatePlan(input);
    assert.equal(plan.sessions[0].end, '24:00');
    assert.equal(plan.sessions[1].start, '00:15');
    assert.ok(hardChecks(plan).every((check) => check.passed));
    const invalid = structuredClone(plan.sessions);
    invalid[1].start = '00:00';
    invalid[1].durationMinutes = 60;
    assert.equal(evaluatePlan(input, invalid).find((check) => check.id === 'breaks').passed, false);
  }
});

test('evening mode assigns topics and revisions in chronological order', () => {
  const input = fixture({ preferredTime: 'evening', sessionMinutes: 30, breakMinutes: 0,
    subjects: [{ id: 'x', name: 'Logic', examDate: '2026-11-16', hours: 2, priority: 1, difficulty: 1, topics: ['First', 'Second', 'Third', 'Fourth'] }],
  });
  const plan = generatePlan(input);
  assert.deepEqual(plan.sessions.map((session) => session.topic), ['First', 'Second', 'Third', 'Fourth']);
  assert.deepEqual(plan.sessions.map((session) => session.type), ['study', 'study', 'study', 'revision']);
});

test('reject duplicate IDs, overlapping windows, malformed types, dates, and excessive periods', () => {
  const duplicate = fixture();
  duplicate.subjects[1].id = duplicate.subjects[0].id;
  const tooMany = fixture({ subjects: Array.from({ length: 21 }, (_, i) => ({ ...fixture().subjects[0], id: `${i}` })) });
  const inputs = [
    duplicate, tooMany, null, [], fixture({ startDate: '2026-02-30' }), fixture({ endDate: '2027-03-01' }),
    fixture({ endDate: '2026-11-08' }), fixture({ sessionMinutes: '50' }), fixture({ maxDailyHours: NaN }),
    fixture({ sessionMinutes: 0 }), fixture({ blockedDates: ['bad'] }), fixture({ preferredTime: 'night' }),
    fixture({ availability: [{ day: 1, start: '09:00', end: '10:00' }, { day: 1, start: '09:30', end: '11:00' }] }),
    fixture({ availability: [{ day: 1, start: '24:00', end: '24:00' }] }),
    fixture({ availability: [{ day: 1, start: '22:00', end: '01:00' }] }),
  ];
  for (const input of inputs) assert.throws(() => validateInput(input), (error) => error.status === 400);
});

test('input normalization does not mutate caller-owned values', () => {
  const input = fixture();
  input.subjects[0].name = '  Mathematics  ';
  const before = JSON.stringify(input);
  assert.equal(validateInput(input).subjects[0].name, 'Mathematics');
  generatePlan(input);
  assert.equal(JSON.stringify(input), before);
});

test('independent evaluator detects malformed model output without throwing', () => {
  const input = fixture();
  for (const invalid of [null, {}, [null], [{ date: '2026-02-30' }], [{ date: '2026-11-09', start: '18:00', end: '17:00', durationMinutes: -60 }]]) {
    const checks = evaluatePlan(input, invalid);
    assert.equal(checks.find((check) => check.id === 'structure').passed, false);
  }
});

test('independent evaluator catches overlap, insufficient break, unknown subject, deadline and workload violations', () => {
  const input = fixture({ endDate: '2026-11-18', maxDailyHours: 0.5 });
  const rows = [
    { subjectId: 'math', date: '2026-11-16', start: '17:00', end: '18:00', durationMinutes: 60 },
    { subjectId: 'unknown', date: '2026-11-16', start: '17:15', end: '17:45', durationMinutes: 30 },
    { subjectId: 'math', date: '2026-11-16', start: '18:05', end: '22:05', durationMinutes: 240 },
  ];
  const checks = new Map(evaluatePlan(input, rows).map((check) => [check.id, check.passed]));
  for (const key of ['knownSubjects', 'deadlines', 'noOverlap', 'breaks', 'dailyLimit', 'sessionLength', 'workload', 'availability']) assert.equal(checks.get(key), false, key);
});

test('generated plans satisfy hard constraints across varying realistic inputs', () => {
  for (let index = 0; index < 30; index++) {
    const input = fixture({
      sessionMinutes: 15 + index * 3, breakMinutes: index % 20, maxDailyHours: (index % 10) / 2,
      preferredTime: index % 2 ? 'evening' : 'balanced', blockedDates: index % 3 ? [] : ['2026-11-10'],
      availability: [1, 2, 3, 4, 5].flatMap((day) => [{ day, start: '08:00', end: '09:10' }, { day, start: '09:20', end: '11:00' }]),
    });
    input.subjects[0].hours = index / 2 + 0.5;
    input.subjects[1].examDate = '2026-11-12';
    const plan = generatePlan(input);
    assert.ok(hardChecks(plan).every((check) => check.passed), JSON.stringify(plan.checks));
    assert.equal(plan.stats.requiredMinutes, plan.stats.allocatedMinutes + plan.stats.unscheduledMinutes);
  }
});
