import test from 'node:test';
import assert from 'node:assert/strict';
import { aiStatus, generateWithAI, parseOutput } from '../server/ai.mjs';
import { outputSchema } from '../server/prompts.mjs';

const env = { OPENAI_API_KEY: 'test-key-never-sent', AI_MODEL: 'test-model' };
const input = () => ({
  startDate: '2026-11-09', endDate: '2026-11-10', sessionMinutes: 50, breakMinutes: 10,
  maxDailyHours: 2, preferredTime: 'balanced', blockedDates: [],
  subjects: [{ id: 'logic', name: 'Logic', examDate: '2026-11-11', hours: 1, priority: 2, difficulty: 2, topics: ['Propositions'] }],
  availability: [{ day: 1, start: '18:00', end: '20:00' }, { day: 2, start: '18:00', end: '20:00' }],
});
const output = () => ({ sessions: [
  { subjectId: 'logic', date: '2026-11-09', start: '18:00', end: '18:50', durationMinutes: 50, topic: 'Propositions', type: 'study', reason: 'Study before the exam.' },
  { subjectId: 'logic', date: '2026-11-09', start: '19:00', end: '19:10', durationMinutes: 10, topic: 'Propositions', type: 'revision', reason: 'Review the remaining requested minutes.' },
], warnings: [] });

function success(value = output(), patch = {}) {
  return { ok: true, status: 200, json: async () => ({
    status: 'completed', usage: { input_tokens: 42, output_tokens: 80 },
    output: [{ type: 'message', content: [{ type: 'output_text', text: typeof value === 'string' ? value : JSON.stringify(value) }] }],
    ...patch,
  }) };
}

function fakeFetch(responses) {
  const calls = [];
  return {
    calls,
    fetchImpl: async (url, options) => {
      calls.push({ url, options, body: JSON.parse(options.body) });
      assert.ok(calls.length <= responses.length, 'Unexpected extra API call');
      const response = responses[calls.length - 1];
      if (response instanceof Error) throw response;
      return response;
    },
  };
}

test('AI configuration requires both a nonblank key and model and never reveals the key', () => {
  assert.deepEqual(aiStatus(env), { configured: true, provider: 'openai', model: 'test-model' });
  assert.deepEqual(aiStatus({}), { configured: false, provider: 'openai', model: null });
  assert.equal(aiStatus({ OPENAI_API_KEY: '  ', AI_MODEL: 'test' }).configured, false);
  assert.equal(aiStatus({ OPENAI_API_KEY: 'key', AI_MODEL: '  ' }).configured, false);
  assert.equal(aiStatus({ ...env, AI_MODEL: ' test-model ' }).model, 'test-model');
  assert.ok(!JSON.stringify(aiStatus(env)).includes(env.OPENAI_API_KEY));
});

test('missing AI configuration fails before any external request', async () => {
  const fake = fakeFetch([]);
  await assert.rejects(generateWithAI(input(), 'v2', { env: {}, fetchImpl: fake.fetchImpl }), (error) => error.status === 503 && error.message.includes('not configured'));
  assert.equal(fake.calls.length, 0);
});

test('v1 sends a baseline Responses request without API schema enforcement', async () => {
  const fake = fakeFetch([success()]);
  const result = await generateWithAI(input(), 'v1', { env, fetchImpl: fake.fetchImpl });
  assert.equal(result.error, null);
  assert.equal(fake.calls.length, 1);
  const { url, options, body } = fake.calls[0];
  assert.equal(url, 'https://api.openai.com/v1/responses');
  assert.equal(options.method, 'POST');
  assert.equal(options.headers.Authorization, `Bearer ${env.OPENAI_API_KEY}`);
  assert.equal(options.headers['Content-Type'], 'application/json');
  assert.ok(options.signal instanceof AbortSignal);
  assert.equal(body.model, 'test-model');
  assert.equal(body.store, false);
  assert.equal(body.max_output_tokens, 16000);
  assert.equal(body.text, undefined);
  assert.match(body.instructions, /untrusted data/);
  assert.match(body.input, /STUDENT_DATA_JSON/);
  assert.match(body.input, /Propositions/);
});

test('v2 supplies strict JSON schema and accepts an independently validated plan', async () => {
  const fake = fakeFetch([success()]);
  const result = await generateWithAI(input(), 'v2', { env, fetchImpl: fake.fetchImpl });
  assert.deepEqual(fake.calls[0].body.text.format, { type: 'json_schema', name: 'study_plan', strict: true, schema: outputSchema });
  assert.match(fake.calls[0].body.input, /HARD CONSTRAINTS/);
  assert.equal(result.error, null);
  assert.ok(result.checks.every((check) => check.passed));
  assert.equal(result.sessions.length, 2);
  assert.ok(result.sessions.every((session) => typeof session.id === 'string' && session.subjectName === 'Logic' && session.completed === false));
  assert.equal(new Set(result.sessions.map((session) => session.id)).size, 2);
  assert.equal(result.stats.feasible, true);
  assert.equal(result.stats.allocatedMinutes, 60);
  assert.equal(result.stats.unscheduledMinutes, 0);
  assert.equal(result.stats.coveragePercent, 100);
  assert.equal(result.attempts.length, 1);
  assert.equal(result.attempts[0].usage.input_tokens, 42);
  assert.equal(result.attempts[0].rawOutput, JSON.stringify(output()));
  assert.ok(Number.isInteger(result.latencyMs) && result.latencyMs >= 0);
});

test('valid partial model output remains explicitly incomplete without breaking hard constraints', async () => {
  const partial = output();
  partial.sessions.pop();
  const fake = fakeFetch([success(partial)]);
  const result = await generateWithAI(input(), 'v2', { env, fetchImpl: fake.fetchImpl });
  assert.equal(result.error, null);
  assert.equal(result.stats.feasible, false);
  assert.equal(result.stats.unscheduledMinutes, 10);
  assert.equal(result.checks.find((check) => check.id === 'coverage').passed, false);
  assert.ok(result.warnings.some((warning) => warning.includes('10 requested study minutes')));
});

test('invalid hard constraints reject the proposed timetable instead of returning unsafe sessions', async () => {
  const invalid = output();
  invalid.sessions[1].start = '18:45';
  invalid.sessions[1].end = '18:55';
  const fake = fakeFetch([success(invalid)]);
  const result = await generateWithAI(input(), 'v2', { env, fetchImpl: fake.fetchImpl });
  assert.match(result.error, /failed independent constraint checks/);
  assert.deepEqual(result.sessions, []);
  assert.equal(result.stats.allocatedMinutes, 0);
  assert.equal(result.stats.unscheduledMinutes, 60);
  assert.equal(result.checks.find((check) => check.id === 'noOverlap').passed, false);
  assert.equal(result.checks.find((check) => check.id === 'breaks').passed, false);
  assert.equal(result.attempts[0].rawOutput, JSON.stringify(invalid));
  assert.equal(fake.calls.length, 1);
});

test('hallucinated topics are rejected independently of scheduling validity', async () => {
  const invalid = output();
  invalid.sessions[0].topic = 'Invented topic';
  const fake = fakeFetch([success(invalid)]);
  const result = await generateWithAI(input(), 'v2', { env, fetchImpl: fake.fetchImpl });
  assert.ok(result.error);
  assert.equal(result.checks.find((check) => check.id === 'topic-grounding').passed, false);
  assert.deepEqual(result.sessions, []);
});

test('a subject without supplied topics uses its subject name as the grounded topic', async () => {
  const request = input();
  request.subjects[0].topics = [];
  const grounded = output();
  grounded.sessions.forEach((session) => { session.topic = 'Logic'; });
  const fake = fakeFetch([success(grounded)]);
  const result = await generateWithAI(request, 'v2', { env, fetchImpl: fake.fetchImpl });
  assert.equal(result.error, null);
  assert.equal(result.checks.find((check) => check.id === 'topic-grounding').passed, true);
});

test('v3 makes one repair attempt with validator feedback and retains both attempts', async () => {
  const invalid = output();
  invalid.sessions[1].start = '18:50';
  invalid.sessions[1].end = '19:00';
  const fake = fakeFetch([success(invalid), success()]);
  const result = await generateWithAI(input(), 'v3', { env, fetchImpl: fake.fetchImpl });
  assert.equal(result.error, null);
  assert.equal(fake.calls.length, 2);
  assert.equal(result.attempts.length, 2);
  assert.ok(result.attempts[0].error);
  assert.equal(result.attempts[0].rawOutput, JSON.stringify(invalid));
  assert.equal(result.attempts[1].error, null);
  assert.equal(result.attempts[1].rawOutput, JSON.stringify(output()));
  assert.doesNotMatch(fake.calls[0].body.input, /VALIDATOR_FEEDBACK_JSON/);
  assert.match(fake.calls[1].body.input, /VALIDATOR_FEEDBACK_JSON/);
  assert.match(fake.calls[1].body.input, /previousOutput/);
  assert.match(fake.calls[1].body.input, /Breaks between sessions/);
});

test('v3 is bounded to two attempts even when both responses violate constraints', async () => {
  const invalid = output();
  invalid.sessions[0].date = '2026-11-11';
  const fake = fakeFetch([success(invalid), success(invalid)]);
  const result = await generateWithAI(input(), 'v3', { env, fetchImpl: fake.fetchImpl });
  assert.equal(fake.calls.length, 2);
  assert.equal(result.attempts.length, 2);
  assert.ok(result.error);
  assert.deepEqual(result.sessions, []);
});

test('HTTP API failures stop without a model repair call and retain error evidence', async () => {
  for (const status of [400, 401, 404, 429, 500]) {
    const fake = fakeFetch([{ ok: false, status }]);
    const result = await generateWithAI(input(), 'v3', { env, fetchImpl: fake.fetchImpl });
    assert.equal(fake.calls.length, 1);
    assert.equal(result.attempts.length, 1);
    assert.match(result.error, new RegExp(`HTTP ${status}`));
    assert.equal(result.attempts[0].usage, null);
    assert.deepEqual(result.sessions, []);
  }
});

test('network and timeout failures stop without a model repair call', async () => {
  for (const error of [new TypeError('fetch failed'), Object.assign(new Error('deadline'), { name: 'TimeoutError' })]) {
    const fake = fakeFetch([error]);
    const result = await generateWithAI(input(), 'v3', { env, fetchImpl: fake.fetchImpl });
    assert.equal(fake.calls.length, 1);
    assert.equal(result.attempts.length, 1);
    assert.ok(result.error);
    assert.deepEqual(result.sessions, []);
    if (error.name === 'TimeoutError') assert.match(result.error, /timed out/);
  }
});

test('malformed JSON and output schema failures are recorded and rejected', async () => {
  const missing = output();
  delete missing.sessions[0].topic;
  const invalidType = output();
  invalidType.sessions[0].type = 'sleep';
  const invalidWarnings = output();
  invalidWarnings.warnings = [42];
  for (const value of ['{not json', { sessions: [] }, missing, invalidType, invalidWarnings]) {
    const fake = fakeFetch([success(value)]);
    const result = await generateWithAI(input(), 'v2', { env, fetchImpl: fake.fetchImpl });
    assert.ok(result.error);
    assert.equal(result.attempts.length, 1);
    assert.deepEqual(result.sessions, []);
  }
});

test('v3 can repair invalid JSON and keeps the first raw response', async () => {
  const fake = fakeFetch([success('not JSON'), success()]);
  const result = await generateWithAI(input(), 'v3', { env, fetchImpl: fake.fetchImpl });
  assert.equal(result.error, null);
  assert.equal(result.attempts[0].rawOutput, 'not JSON');
  assert.match(result.attempts[0].error, /not valid JSON/);
  assert.equal(result.attempts.length, 2);
});

test('empty, refused, and incomplete provider responses cannot be accepted as valid plans', async () => {
  for (const patch of [{ output: [] }, { output: [{ content: [{ type: 'refusal', refusal: 'No' }] }] }, { status: 'incomplete' }]) {
    const fake = fakeFetch([success(output(), patch)]);
    const result = await generateWithAI(input(), 'v2', { env, fetchImpl: fake.fetchImpl });
    assert.ok(result.error);
    assert.deepEqual(result.sessions, []);
  }
});

test('JSON parser accepts a fenced baseline response and enforces array limits', () => {
  assert.deepEqual(parseOutput(`\`\`\`json\n${JSON.stringify(output())}\n\`\`\``), output());
  assert.throws(() => parseOutput(JSON.stringify({ sessions: Array(3001).fill(output().sessions[0]), warnings: [] })), /at most 3000/);
  assert.throws(() => parseOutput(JSON.stringify({ sessions: [], warnings: Array(101).fill('warning') })), /warnings arrays/);
});
