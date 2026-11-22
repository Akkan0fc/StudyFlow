import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, basename } from 'node:path';
import { createApp } from '../server/index.mjs';

const config = () => ({
  startDate: '2026-11-09', endDate: '2026-11-10', sessionMinutes: 50, breakMinutes: 10,
  maxDailyHours: 2, preferredTime: 'balanced', blockedDates: [],
  subjects: [
    { id: 'math', name: 'Mathematics', examDate: '2026-11-11', hours: 1.5, priority: 3, difficulty: 2, topics: ['Matrices'] },
    { id: 'logic', name: 'Logic', examDate: '2026-11-12', hours: 1.5, priority: 2, difficulty: 2, topics: ['Propositions'] },
  ],
  availability: [{ day: 1, start: '18:00', end: '21:00' }, { day: 2, start: '18:00', end: '21:00' }],
});

async function fixture(t, options = {}) {
  const dataDir = await mkdtemp(join(tmpdir(), 'studyflow-chat-api-test-'));
  let server;
  let origin;
  const start = async () => {
    server = await createApp({
      dataDir, env: {},
      fetchImpl: async () => { throw new Error('Live model calls are disabled in integration tests.'); },
      ...options,
    });
    await new Promise((success, failure) => {
      server.once('error', failure);
      server.listen(0, '127.0.0.1', success);
    });
    origin = `http://127.0.0.1:${server.address().port}`;
  };
  const close = async () => {
    if (!server?.listening) return;
    server.closeAllConnections();
    await new Promise((success, failure) => server.close(error => error ? failure(error) : success()));
  };
  t.after(async () => {
    await close();
    // Cleanup is restricted to this fixture's exact generated temporary directory.
    assert.equal(dirname(resolve(dataDir)), resolve(tmpdir()));
    assert.ok(basename(dataDir).startsWith('studyflow-chat-api-test-'));
    await rm(dataDir, { recursive: true, force: true });
  });
  await start();
  return {
    dataDir,
    restart: async () => { await close(); await start(); },
    request: async (path, method = 'GET', body) => {
      const response = await fetch(`${origin}${path}`, {
        method,
        ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
      });
      return { status: response.status, json: await response.json() };
    },
  };
}

async function prepare(app) {
  const saved = await app.request('/api/config', 'PUT', config());
  assert.equal(saved.status, 200);
  const generated = await app.request('/api/generate', 'POST', { mode: 'engine', promptVersion: 'v3' });
  assert.equal(generated.status, 200);
  return generated.json.plan;
}

const propose = app => app.request('/api/chat', 'POST', { message: 'Use 50 minute sessions and 15 minute breaks', mode: 'local' });
const sessionKey = session => JSON.stringify([session.subjectId, session.date, session.start, session.end, session.topic, session.type]);

test('local chat previews changes without mutating config or plan, and survives restart', async (t) => {
  const app = await fixture(t);
  await prepare(app);
  const before = (await app.request('/api/state')).json;
  assert.ok(Array.isArray(before.chat.messages));
  const proposed = await propose(app);
  assert.equal(proposed.status, 200);
  const pending = proposed.json.chat.pending;
  assert.ok(pending.id);
  assert.ok(pending.createdAt);
  assert.ok(pending.baseFingerprint);
  assert.equal(pending.config.breakMinutes, 15);
  assert.ok(pending.changes.length > 0);
  const previewed = (await app.request('/api/state')).json;
  assert.deepEqual(previewed.config, before.config);
  assert.deepEqual(previewed.plan, before.plan);
  await app.restart();
  const restored = (await app.request('/api/state')).json;
  assert.deepEqual(restored.chat.pending, pending);
  assert.deepEqual(restored.chat.messages, proposed.json.chat.messages);
  const disk = JSON.parse(await readFile(join(app.dataDir, 'state.json'), 'utf8'));
  assert.deepEqual(disk.chat, restored.chat);
});

test('applying a proposal regenerates valid sessions and preserves only matching completed work', async (t) => {
  const app = await fixture(t);
  const original = await prepare(app);
  assert.ok(original.sessions.length >= 2);
  for (const session of original.sessions.slice(0, 2)) {
    assert.equal((await app.request(`/api/sessions/${session.id}`, 'PATCH', { completed: true })).status, 200);
  }
  const before = (await app.request('/api/state')).json;
  const proposal = await propose(app);
  assert.equal(proposal.status, 200);
  const applied = await app.request('/api/chat/apply', 'POST', { proposalId: proposal.json.chat.pending.id });
  assert.equal(applied.status, 200);
  assert.equal(applied.json.config.breakMinutes, 15);
  assert.equal(applied.json.plan.source, 'constraint-engine');
  assert.ok(applied.json.plan.checks.filter(check => check.id !== 'coverage').every(check => check.passed));
  assert.equal(applied.json.chat.pending, null);
  assert.ok(applied.json.chat.undo);
  const oldCompleted = new Set(before.plan.sessions.filter(session => session.completed).map(sessionKey));
  const retained = applied.json.plan.sessions.filter(session => oldCompleted.has(sessionKey(session)));
  assert.ok(retained.length >= 1, 'At least the first unchanged session must remain.');
  assert.ok(retained.every(session => session.completed));
  const moved = applied.json.plan.sessions.filter(session => !oldCompleted.has(sessionKey(session)));
  assert.ok(moved.length >= 1);
  assert.ok(moved.every(session => session.completed === false));
  await app.restart();
  const saved = (await app.request('/api/state')).json;
  assert.deepEqual(saved.plan, applied.json.plan);
  assert.deepEqual(saved.config, applied.json.config);
});

test('undo restores the exact previous config, timetable and completion state', async (t) => {
  const app = await fixture(t);
  const original = await prepare(app);
  await app.request(`/api/sessions/${original.sessions[0].id}`, 'PATCH', { completed: true });
  const before = (await app.request('/api/state')).json;
  const proposal = await propose(app);
  const applied = await app.request('/api/chat/apply', 'POST', { proposalId: proposal.json.chat.pending.id });
  assert.equal(applied.status, 200);
  const undone = await app.request('/api/chat/undo', 'POST', {});
  assert.equal(undone.status, 200);
  assert.deepEqual(undone.json.config, before.config);
  assert.deepEqual(undone.json.plan, before.plan);
  assert.equal(undone.json.chat.undo, null);
  await app.restart();
  assert.deepEqual((await app.request('/api/state')).json.plan, before.plan);
  assert.equal((await app.request('/api/chat/undo', 'POST', {})).status, 409);
});

test('dismissing and clearing chat leave the existing timetable unchanged', async (t) => {
  const app = await fixture(t);
  await prepare(app);
  const before = (await app.request('/api/state')).json;
  const first = await propose(app);
  const dismissed = await app.request('/api/chat/dismiss', 'POST', { proposalId: first.json.chat.pending.id });
  assert.equal(dismissed.status, 200);
  assert.equal(dismissed.json.chat.pending, null);
  const second = await propose(app);
  assert.ok(second.json.chat.pending);
  const cleared = await app.request('/api/chat/clear', 'POST', {});
  assert.equal(cleared.status, 200);
  assert.equal(cleared.json.chat.pending, null);
  assert.deepEqual(cleared.json.chat.messages, []);
  const state = (await app.request('/api/state')).json;
  assert.deepEqual(state.plan, before.plan);
  assert.deepEqual(state.config, before.config);
});

test('a changed configuration makes an earlier proposal stale without overwriting the new settings', async (t) => {
  const app = await fixture(t);
  await prepare(app);
  const proposal = await propose(app);
  const changed = { ...config(), maxDailyHours: 1 };
  assert.equal((await app.request('/api/config', 'PUT', changed)).status, 200);
  const stale = await app.request('/api/chat/apply', 'POST', { proposalId: proposal.json.chat.pending.id });
  assert.equal(stale.status, 409);
  const state = (await app.request('/api/state')).json;
  assert.deepEqual(state.config, changed);
  assert.equal(state.plan, null);
});

test('completion edits after a preview make it stale and preserve the newer progress', async (t) => {
  const app = await fixture(t);
  const plan = await prepare(app);
  const proposal = await propose(app);
  await app.request(`/api/sessions/${plan.sessions[0].id}`, 'PATCH', { completed: true });
  const before = (await app.request('/api/state')).json;
  const stale = await app.request('/api/chat/apply', 'POST', { proposalId: proposal.json.chat.pending.id });
  assert.equal(stale.status, 409);
  const after = (await app.request('/api/state')).json;
  assert.deepEqual(after.config, before.config);
  assert.deepEqual(after.plan, before.plan);
});

test('undo cannot overwrite completion changes made after a chat update', async (t) => {
  const app = await fixture(t);
  await prepare(app);
  const proposal = await propose(app);
  const applied = await app.request('/api/chat/apply', 'POST', { proposalId: proposal.json.chat.pending.id });
  assert.equal(applied.status, 200);
  await app.request(`/api/sessions/${applied.json.plan.sessions[0].id}`, 'PATCH', { completed: true });
  const before = (await app.request('/api/state')).json;
  const stale = await app.request('/api/chat/undo', 'POST', {});
  assert.equal(stale.status, 409);
  assert.deepEqual((await app.request('/api/state')).json.plan, before.plan);
});

test('a new proposal supersedes an older preview and rejects its old identifier', async (t) => {
  const app = await fixture(t);
  await prepare(app);
  const first = await propose(app);
  const second = await app.request('/api/chat', 'POST', { message: 'Limit study to 1 hour a day', mode: 'local' });
  assert.equal(second.status, 200);
  assert.ok(second.json.chat.pending);
  assert.notEqual(second.json.chat.pending.id, first.json.chat.pending.id);
  assert.equal(second.json.chat.pending.config.maxDailyHours, 1);
  const stale = await app.request('/api/chat/apply', 'POST', { proposalId: first.json.chat.pending.id });
  assert.equal(stale.status, 409);
  assert.equal((await app.request('/api/state')).json.chat.pending.id, second.json.chat.pending.id);
});

test('local help has no mutation and chat history is capped at sixty persisted messages', async (t) => {
  const app = await fixture(t);
  await prepare(app);
  const before = (await app.request('/api/state')).json;
  for (let index = 0; index < 32; index++) {
    const reply = await app.request('/api/chat', 'POST', { message: 'What can you change?', mode: 'local' });
    assert.equal(reply.status, 200);
    assert.equal(reply.json.chat.pending, null);
    assert.ok(reply.json.chat.messages.length <= 60);
  }
  const state = (await app.request('/api/state')).json;
  assert.equal(state.chat.messages.length, 60);
  assert.deepEqual(state.config, before.config);
  assert.deepEqual(state.plan, before.plan);
  await app.restart();
  assert.deepEqual((await app.request('/api/state')).json.chat.messages, state.chat.messages);
});

test('unconfigured AI chat responds without silently changing or falling back to a plan update', async (t) => {
  const app = await fixture(t);
  await prepare(app);
  const before = (await app.request('/api/state')).json;
  const reply = await app.request('/api/chat', 'POST', { message: 'Limit study to 1 hour a day', mode: 'ai' });
  assert.equal(reply.status, 200);
  assert.equal(reply.json.chat.pending, null);
  assert.ok(reply.json.chat.messages.length > before.chat.messages.length);
  const after = (await app.request('/api/state')).json;
  assert.deepEqual(after.config, before.config);
  assert.deepEqual(after.plan, before.plan);
});
