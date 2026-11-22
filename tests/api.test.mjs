import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, basename } from 'node:path';
import { createApp } from '../server/index.mjs';

const config = () => ({
  startDate: '2026-11-09', endDate: '2026-11-10', sessionMinutes: 50, breakMinutes: 10,
  maxDailyHours: 2, preferredTime: 'balanced', blockedDates: [],
  subjects: [{ id: 'logic', name: 'Logic', examDate: '2026-11-11', hours: 1, priority: 2, difficulty: 2, topics: ['Propositions'] }],
  availability: [{ day: 1, start: '18:00', end: '20:00' }, { day: 2, start: '18:00', end: '20:00' }],
});

async function fixture(t, options = {}) {
  const dataDir = await mkdtemp(join(tmpdir(), 'studyflow-api-test-'));
  let server;
  let origin;
  const start = async () => {
    server = await createApp({ dataDir, env: {}, fetchImpl: async () => { throw new Error('External AI calls are disabled in integration tests.'); }, ...options });
    await new Promise((success, failure) => {
      server.once('error', failure);
      server.listen(0, '127.0.0.1', success);
    });
    origin = `http://127.0.0.1:${server.address().port}`;
  };
  const close = async () => {
    if (!server?.listening) return;
    server.closeAllConnections();
    await new Promise((success, failure) => server.close((error) => error ? failure(error) : success()));
  };
  t.after(async () => {
    await close();
    // Delete only the exact isolated temp directory created for this test.
    assert.equal(dirname(resolve(dataDir)), resolve(tmpdir()));
    assert.ok(basename(dataDir).startsWith('studyflow-api-test-'));
    await rm(dataDir, { recursive: true, force: true });
  });
  await start();
  return {
    dataDir,
    restart: async () => { await close(); await start(); },
    close,
    request: async (path, { method = 'GET', body, headers = {}, raw } = {}) => {
      const requestBody = raw !== undefined ? raw : body !== undefined ? JSON.stringify(body) : undefined;
      const response = await fetch(`${origin}${path}`, {
        method, headers: { ...(requestBody !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers }, body: requestBody,
      });
      const text = await response.text();
      let json;
      try { json = JSON.parse(text); } catch { /* Static files and exports are text. */ }
      return { status: response.status, headers: response.headers, text, json };
    },
    rawRequest: (path, { method = 'GET', headers = {}, body = '' } = {}) => new Promise((success, failure) => {
      const req = http.request(`${origin}${path}`, { method, headers }, (res) => {
        let text = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => { text += chunk; });
        res.on('end', () => success({ status: res.statusCode, text, headers: res.headers }));
      });
      req.on('error', failure);
      req.end(body);
    }),
  };
}

test('HTTP health, state, prompt definitions and schema are available without AI configuration', async (t) => {
  const app = await fixture(t);
  const health = await app.request('/api/health');
  assert.equal(health.status, 200);
  assert.equal(health.json.ok, true);
  assert.equal(health.json.ai.configured, false);
  assert.equal(health.json.storage, 'local-file');
  const state = await app.request('/api/state');
  assert.equal(state.status, 200);
  assert.deepEqual(state.json.config.subjects, []);
  assert.equal(state.json.plan, null);
  const prompts = await app.request('/api/prompts');
  assert.deepEqual(prompts.json.prompts.map((prompt) => prompt.id), ['v1', 'v2', 'v3']);
  assert.equal(prompts.json.schema.type, 'object');
  assert.equal(health.headers.get('cache-control'), 'no-store');
});

test('config, generation, completion, experiments and evaluation survive an actual server restart', async (t) => {
  const app = await fixture(t);
  const saved = await app.request('/api/config', { method: 'PUT', body: config() });
  assert.equal(saved.status, 200);
  assert.deepEqual(saved.json.config, config());
  const generated = await app.request('/api/generate', { method: 'POST', body: { mode: 'engine', promptVersion: 'v3' } });
  assert.equal(generated.status, 200);
  assert.equal(generated.json.plan.stats.allocatedMinutes, 60);
  assert.equal(generated.json.plan.stats.feasible, true);
  assert.equal(generated.json.plan.source, 'constraint-engine');
  assert.ok(generated.json.plan.checks.every((check) => check.passed));
  const id = generated.json.plan.sessions[0].id;
  const completed = await app.request(`/api/sessions/${id}`, { method: 'PATCH', body: { completed: true } });
  assert.equal(completed.status, 200);
  assert.equal(completed.json.plan.sessions[0].completed, true);
  const evaluated = await app.request('/api/evaluate', { method: 'POST', body: {} });
  assert.equal(evaluated.status, 200);
  assert.equal(evaluated.json.evaluation.passed, evaluated.json.evaluation.total);
  assert.equal(evaluated.json.evaluation.total, 12);
  await app.restart();
  const restored = (await app.request('/api/state')).json;
  assert.deepEqual(restored.config, config());
  assert.equal(restored.plan.id, generated.json.plan.id);
  assert.equal(restored.plan.sessions[0].completed, true);
  assert.equal(restored.experiments.length, 1);
  assert.equal(restored.evaluation.passed, 12);
  const disk = JSON.parse(await readFile(join(app.dataDir, 'state.json'), 'utf8'));
  assert.deepEqual(disk, restored);
});

test('concurrent completion changes are serialized without losing another update', async (t) => {
  const app = await fixture(t);
  await app.request('/api/config', { method: 'PUT', body: config() });
  const generated = await app.request('/api/generate', { method: 'POST', body: {} });
  const changes = await Promise.all(generated.json.plan.sessions.map((session) => app.request(`/api/sessions/${session.id}`, { method: 'PATCH', body: { completed: true } })));
  assert.ok(changes.every((response) => response.status === 200));
  assert.ok((await app.request('/api/state')).json.plan.sessions.every((session) => session.completed));
});

test('JSON, CSV and ICS exports reflect the generated plan and completion status', async (t) => {
  const app = await fixture(t);
  assert.equal((await app.request('/api/export?format=json')).status, 409);
  await app.request('/api/config', { method: 'PUT', body: config() });
  const generated = await app.request('/api/generate', { method: 'POST', body: {} });
  await app.request(`/api/sessions/${generated.json.plan.sessions[0].id}`, { method: 'PATCH', body: { completed: true } });
  const json = await app.request('/api/export?format=json');
  assert.equal(json.status, 200);
  assert.equal(json.json.plan.id, generated.json.plan.id);
  assert.equal(json.json.plan.sessions[0].completed, true);
  const csv = await app.request('/api/export?format=csv');
  assert.equal(csv.status, 200);
  assert.match(csv.headers.get('content-type'), /text\/csv/);
  assert.match(csv.headers.get('content-disposition'), /studyflow-plan\.csv/);
  assert.match(csv.text, /"Date","Start","End","Subject"/);
  assert.match(csv.text, /"Logic","Propositions","study","50","Yes"/);
  const ics = await app.request('/api/export?format=ics');
  assert.equal(ics.status, 200);
  assert.match(ics.headers.get('content-type'), /text\/calendar/);
  assert.match(ics.text, /^BEGIN:VCALENDAR\r\n/);
  assert.equal((ics.text.match(/BEGIN:VEVENT/g) || []).length, 2);
  assert.match(ics.text, /DTSTART:20261109T180000/);
  assert.match(ics.text, /DTEND:20261109T185000/);
  assert.match(ics.text.replace(/\r\n /g, ''), /Completed \| 50 minutes/);
  assert.ok(ics.text.split('\r\n').every((line) => Buffer.byteLength(line) <= 75));
  assert.equal((await app.request('/api/export?format=exe')).status, 400);
});

test('exports escape spreadsheet formulas, CSV quotes, ICS punctuation and midnight correctly', async (t) => {
  const app = await fixture(t);
  const input = config();
  input.subjects[0].name = '=HYPERLINK("example")';
  input.subjects[0].topics = ['Long topic; commas, and a newline\n' + 'अ'.repeat(40)];
  input.subjects[0].hours = 0.5;
  input.availability = [{ day: 1, start: '23:30', end: '24:00' }];
  await app.request('/api/config', { method: 'PUT', body: input });
  await app.request('/api/generate', { method: 'POST', body: {} });
  const csv = await app.request('/api/export?format=csv');
  assert.ok(csv.text.includes('"\'=HYPERLINK(""example"")"'));
  const ics = await app.request('/api/export?format=ics');
  const unfolded = ics.text.replace(/\r\n /g, '');
  assert.match(unfolded, /DTEND:20261110T000000/);
  assert.ok(unfolded.includes('Long topic\\; commas\\, and a newline\\n'));
  assert.ok(ics.text.split('\r\n').every((line) => Buffer.byteLength(line) <= 75));
});

test('control experiments are truthful, persisted independently and deletable', async (t) => {
  const app = await fixture(t);
  await app.request('/api/config', { method: 'PUT', body: config() });
  const run = await app.request('/api/experiments', { method: 'POST', body: { mode: 'engine', promptVersion: 'v1' } });
  assert.equal(run.status, 200);
  assert.equal(run.json.experiment.mode, 'engine');
  assert.match(run.json.experiment.note, /not an LLM experiment/);
  assert.deepEqual(run.json.experiment.input, config());
  assert.equal(run.json.experiment.metrics.constraintPassRate, 100);
  assert.equal((await app.request('/api/state')).json.plan, null);
  await app.restart();
  assert.equal((await app.request('/api/state')).json.experiments[0].id, run.json.experiment.id);
  const removed = await app.request(`/api/experiments/${run.json.experiment.id}`, { method: 'DELETE' });
  assert.equal(removed.status, 200);
  assert.deepEqual(removed.json.experiments, []);
  assert.equal((await app.request(`/api/experiments/${run.json.experiment.id}`, { method: 'DELETE' })).status, 404);
  await app.restart();
  assert.deepEqual((await app.request('/api/state')).json.experiments, []);
});

test('config changes invalidate the active plan while preserving previous experiment inputs', async (t) => {
  const app = await fixture(t);
  await app.request('/api/config', { method: 'PUT', body: config() });
  await app.request('/api/generate', { method: 'POST', body: {} });
  const changed = config();
  changed.subjects[0].hours = 2;
  const saved = await app.request('/api/config', { method: 'PUT', body: changed });
  assert.equal(saved.status, 200);
  assert.equal(saved.json.plan, null);
  const state = (await app.request('/api/state')).json;
  assert.equal(state.config.subjects[0].hours, 2);
  assert.equal(state.experiments[0].input.subjects[0].hours, 1);
  assert.equal((await app.request('/api/export')).status, 409);
});

test('missing AI setup returns a clear 503 and preserves the current valid plan', async (t) => {
  const app = await fixture(t);
  await app.request('/api/config', { method: 'PUT', body: config() });
  const generated = await app.request('/api/generate', { method: 'POST', body: {} });
  const ai = await app.request('/api/generate', { method: 'POST', body: { mode: 'ai', promptVersion: 'v3' } });
  assert.equal(ai.status, 503);
  assert.match(ai.json.error, /AI settings/);
  const state = (await app.request('/api/state')).json;
  assert.equal(state.plan.id, generated.json.plan.id);
  assert.equal(state.experiments.length, 1);
});

test('failed AI checks are persisted as experiment evidence and cannot replace a valid plan', async (t) => {
  let calls = 0;
  const fakeOutput = { sessions: [{ subjectId: 'logic', date: '2026-11-11', start: '18:00', end: '19:00', durationMinutes: 60, topic: 'Propositions', type: 'study', reason: 'Invalid exam-day session.' }], warnings: [] };
  const app = await fixture(t, { env: { OPENAI_API_KEY: 'fake-key', AI_MODEL: 'fake-model' }, fetchImpl: async () => {
    calls++;
    return { ok: true, status: 200, json: async () => ({ status: 'completed', output: [{ content: [{ type: 'output_text', text: JSON.stringify(fakeOutput) }] }] }) };
  } });
  await app.request('/api/config', { method: 'PUT', body: config() });
  const generated = await app.request('/api/generate', { method: 'POST', body: {} });
  const rejected = await app.request('/api/generate', { method: 'POST', body: { mode: 'ai', promptVersion: 'v2' } });
  assert.equal(rejected.status, 422);
  assert.ok(rejected.json.experimentId);
  assert.equal(calls, 1);
  const state = (await app.request('/api/state')).json;
  assert.equal(state.plan.id, generated.json.plan.id);
  assert.equal(state.experiments[0].id, rejected.json.experimentId);
  assert.ok(state.experiments[0].error);
  assert.equal(state.experiments[0].rawOutput, JSON.stringify(fakeOutput));
  assert.equal(state.experiments[0].attempts.length, 1);
  await app.restart();
  assert.equal((await app.request('/api/state')).json.experiments[0].id, rejected.json.experimentId);
});

test('invalid JSON, types, settings, mode and session edits return actionable client errors', async (t) => {
  const app = await fixture(t);
  const requests = [
    ['/api/config', { method: 'PUT', raw: '{not json' }, 400],
    ['/api/config', { method: 'PUT', body: [] }, 400],
    ['/api/config', { method: 'PUT', body: null }, 400],
    ['/api/config', { method: 'PUT', body: config(), headers: { 'Content-Type': 'text/plain' } }, 415],
    ['/api/config', { method: 'PUT', body: { ...config(), startDate: '2026-02-30' } }, 400],
    ['/api/generate', { method: 'POST', body: { mode: 'imaginary' } }, 400],
    ['/api/generate', { method: 'POST', body: { promptVersion: 'v999' } }, 400],
    ['/api/sessions/missing', { method: 'PATCH', body: { completed: 'yes' } }, 400],
    ['/api/sessions/missing', { method: 'PATCH', body: { completed: true } }, 404],
    ['/api/nonexistent', { method: 'POST', body: {} }, 404],
  ];
  for (const [path, options, status] of requests) {
    const response = await app.request(path, options);
    assert.equal(response.status, status, `${path}: ${response.text}`);
    assert.ok(response.json.error);
  }
  assert.equal((await app.request('/api/health')).status, 200);
});

test('oversized JSON bodies receive a 413 response and leave the server healthy', async (t) => {
  const app = await fixture(t);
  const response = await app.request('/api/config', { method: 'PUT', body: { padding: 'x'.repeat(130000) } });
  assert.equal(response.status, 413);
  assert.match(response.json.error, /too large/);
  assert.equal((await app.request('/api/health')).status, 200);
});

test('host, origin and cross-site request guards reject unauthorized browser access', async (t) => {
  const app = await fixture(t);
  const host = await app.rawRequest('/api/health', { headers: { Host: 'evil.example' } });
  assert.equal(host.status, 403);
  const origin = await app.request('/api/generate', { method: 'POST', body: {}, headers: { Origin: 'https://evil.example' } });
  assert.equal(origin.status, 403);
  const crossSite = await app.rawRequest('/api/state', { headers: { 'Sec-Fetch-Site': 'cross-site' } });
  assert.equal(crossSite.status, 403);
  const navigation = await app.rawRequest('/', { headers: { 'Sec-Fetch-Site': 'cross-site', 'Sec-Fetch-Mode': 'navigate' } });
  assert.equal(navigation.status, 200);
  assert.match(navigation.text, /<html/i);
  assert.equal((await app.request('/api/state')).json.experiments.length, 0);
});

test('remote host and HTTPS origin allow authorized container and configured deployments', async (t) => {
  const snapApp = await fixture(t);
  const snapHost = await snapApp.rawRequest('/api/health', { headers: { Host: 'studyflow-85087.containers.snapdeploy.app' } });
  assert.equal(snapHost.status, 200);

  const envApp = await fixture(t, { env: { ALLOWED_HOSTS: '*' } });
  const customHost = await envApp.rawRequest('/api/health', { headers: { Host: 'my-custom-domain.example' } });
  assert.equal(customHost.status, 200);

  const postRes = await envApp.rawRequest('/api/generate', {
    method: 'POST',
    body: '{}',
    headers: {
      Host: 'my-custom-domain.example',
      Origin: 'https://my-custom-domain.example',
      'Content-Type': 'application/json',
    },
  });
  assert.notEqual(postRes.status, 403);
});

test('static pages have protective headers and the file allowlist blocks server/private files', async (t) => {
  const app = await fixture(t);
  const page = await app.request('/');
  assert.equal(page.status, 200);
  assert.match(page.text, /<html/i);
  assert.match(page.headers.get('content-type'), /text\/html/);
  assert.match(page.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.equal(page.headers.get('x-content-type-options'), 'nosniff');
  const css = await app.request('/styles.css');
  assert.equal(css.status, 200);
  assert.match(css.headers.get('content-type'), /text\/css/);
  const script = await app.request('/app.js');
  assert.equal(script.status, 200);
  assert.match(script.headers.get('content-type'), /text\/javascript/);
  const head = await app.request('/', { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(head.text, '');
  for (const path of ['/server/index.mjs', '/.env', '/data/state.json', '/package.json', '/docs/../server/index.mjs']) {
    assert.equal((await app.request(path)).status, 404, path);
  }
});

test('malformed saved data is preserved and startup refuses to silently reset it', async (t) => {
  const app = await fixture(t);
  await app.close();
  const file = join(app.dataDir, 'state.json');
  const damaged = '{bad saved data';
  await writeFile(file, damaged);
  await assert.rejects(createApp({ dataDir: app.dataDir, env: {} }), /has not been overwritten/);
  assert.equal(await readFile(file, 'utf8'), damaged);
});
