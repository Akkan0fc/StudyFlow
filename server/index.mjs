import { openProviderStore, testProvider, requestProvider } from './provider.mjs';
import {prepareIntake, timetablePrompt, plannerRole, timetableSchema, applyTimetable} from './intake.mjs';
import { extractSyllabus } from './syllabus.mjs';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, dirname, extname } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { openStore } from './store.mjs';
import { validateInput, generatePlan } from './scheduler.mjs';
import { prompts, outputSchema, buildPrompt } from './prompts.mjs';
import { aiStatus, generateWithAI } from './ai.mjs';
import { runEvaluation } from './evaluate.mjs';
import { exportCSV, exportICS } from './exports.mjs';
import { interpretChat } from './chat.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const plannerFingerprint = state => createHash('sha256').update(JSON.stringify({ config: state.config, plan: state.plan })).digest('hex');
function chatState(state) {
  state.chat ??= { messages: [], pending: null, undo: null };
  return state.chat;
}
function chatMessage(chat, role, text, mode) {
  chat.messages.push({ id: randomUUID(), role, text, mode, createdAt: new Date().toISOString() });
  chat.messages = chat.messages.slice(-60);
}
const sessionIdentity = session => JSON.stringify([session.subjectId, session.date, session.start, session.end, session.topic, session.type]);
function send(res, status, value, type = 'application/json; charset=utf-8', headers = {}) {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'", ...headers });
  res.end(type.startsWith('application/json') ? JSON.stringify(value) : value);
}
async function readJSON(req, limit = 128000) {
  if (!req.headers['content-type']?.startsWith('application/json')) throw fail('Send JSON with Content-Type: application/json.', 415);
  let bytes = 0;
  const chunks = [];
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > limit) throw fail('Request is too large.', 413);
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw fail('Request body is not valid JSON.'); }
}

export function isAllowedHost(authority, env = process.env) {
  if (!authority) return false;
  const allowed = env.ALLOWED_HOSTS ?? process.env.ALLOWED_HOSTS;
  if (allowed === '*' || allowed === 'all') return true;
  if (allowed) {
    const hostWithoutPort = authority.replace(/:\d+$/, '').toLowerCase();
    const target = authority.toLowerCase();
    const list = allowed.split(',').map(s => s.trim().toLowerCase());
    if (list.includes('*')) return true;
    return list.some(item => item === target || item === hostWithoutPort || (item.startsWith('*.') && hostWithoutPort.endsWith(item.slice(1))));
  }
  if (/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(authority)) return true;
  if (/\.(?:snapdeploy\.app|railway\.app|onrender\.com|fly\.dev|herokuapp\.com)(:\d+)?$/i.test(authority)) return true;
  return false;
}

export function isAllowedOrigin(originHeader, authority, req) {
  if (!originHeader) return true;
  if (originHeader === `http://${authority}` || originHeader === `https://${authority}`) return true;
  try {
    const originUrl = new URL(originHeader);
    const originHost = originUrl.host.toLowerCase().replace(/:(80|443)$/, '');
    const candidates = [
      authority,
      req?.headers?.host,
      req?.headers?.['x-forwarded-host']?.split(',')[0]?.trim()
    ].filter(Boolean);
    return candidates.some(c => originHost === c.toLowerCase().replace(/:(80|443)$/, ''));
  } catch {
    return false;
  }
}

export async function createApp({ dataDir = process.env.DATA_DIR || resolve(root, 'data'), env = process.env, fetchImpl = fetch } = {}) {
  const store = await openStore(dataDir);
  const providers = await openProviderStore(dataDir, env);
  validateInput(store.read().config, {allowEmpty:true});
  let mutations = Promise.resolve();
  function serialized(work) {
    const result = mutations.then(work);
    mutations = result.catch(() => {});
    return result;
  }
  async function execute(input, mode, promptVersion) {
    if (!['engine', 'ai'].includes(mode)) throw fail('Choose engine or ai generation mode.');
    buildPrompt(promptVersion, input);
    const started = performance.now();
    if (mode === 'ai') return generateWithAI(input, promptVersion, { env, fetchImpl, provider:providers.read() });
    return { ...generatePlan(input), latencyMs: Math.round(performance.now() - started), rawOutput: null, attempts: [], error: null };
  }
  function record(input, mode, promptVersion, result) {
    const hardChecks = result.checks.filter(c => c.id !== 'coverage');
    return {
      id: randomUUID(), createdAt: new Date().toISOString(), mode,
      provider: mode === 'ai' ? providers.read().provider : 'constraint-engine', model: mode === 'ai' ? providers.read().model : null,
      promptVersion, input, prompt: buildPrompt(promptVersion, input),
      output: { sessions: result.sessions, warnings: result.warnings, checks: result.checks, stats: result.stats, subjectSummaries: result.subjectSummaries },
      rawOutput: result.rawOutput, attempts: result.attempts, error: result.error,
      metrics: { constraintPassRate: hardChecks.length ? Math.round(hardChecks.filter(c => c.passed).length / hardChecks.length * 100) : 0,
        coveragePercent: result.stats.coveragePercent, latencyMs: result.latencyMs, sessionCount: result.sessions.length },
      note: mode === 'engine' ? 'Rule-based control run. Prompt version is recorded for workflow traceability but does not change this algorithm. This is not an LLM experiment.' : 'Actual configured-provider response checked independently. Compare only matching inputs and models.'
    };
  }
  async function route(req, res) {
    const authority = req.headers['x-forwarded-host']?.split(',')[0]?.trim() || req.headers.host || '';
    if (!isAllowedHost(authority, env)) throw fail('This application is available only on localhost. Set ALLOWED_HOSTS=* to allow external access.', 403);
    const url = new URL(req.url, `http://${authority}`);
    const mutating = !['GET', 'HEAD'].includes(req.method);
    if (mutating && !isAllowedOrigin(req.headers.origin, authority, req)) throw fail('Cross-origin changes are not permitted.', 403);
    if (req.headers['sec-fetch-site'] === 'cross-site' && (mutating || url.pathname.startsWith('/api/'))) throw fail('Cross-site requests are not permitted.', 403);
    if (req.method === 'GET' && url.pathname === '/api/health') return send(res, 200, { ok: true, ai: aiStatus(env, providers.read()), storage: 'local-file', version: '1.2.0' });
    if (req.method === 'GET' && url.pathname === '/api/provider') return send(res, 200, {settings:providers.public()});
    if (req.method === 'GET' && url.pathname === '/api/state') {
      const state = store.read();
      chatState(state);
      return send(res, 200, state);
    }
    if (req.method === 'GET' && url.pathname === '/api/prompts') return send(res, 200, { prompts, schema: outputSchema });
    if (req.method === 'GET' && url.pathname === '/api/export') {
      const state = store.read();
      if (!state.plan) throw fail('Generate a study plan before exporting.', 409);
      const format = url.searchParams.get('format') || 'json';
      if (!['json', 'csv', 'ics'].includes(format)) throw fail('Export format must be json, csv, or ics.');
      const content = format === 'json' ? state : format === 'csv' ? exportCSV(state.plan) : exportICS(state.plan);
      const type = format === 'json' ? 'application/json; charset=utf-8' : format === 'csv' ? 'text/csv; charset=utf-8' : 'text/calendar; charset=utf-8';
      return send(res, 200, content, type, { 'Content-Disposition': `attachment; filename="studyflow-plan.${format}"` });
    }
    if (url.pathname.startsWith('/api/') && mutating) {
      const body = req.method === 'DELETE' ? {} : await readJSON(req, url.pathname === '/api/syllabus/extract' ? 8*1024*1024 : url.pathname.startsWith('/api/intake/') ? 2*1024*1024 : 128000);
      if (!body || typeof body !== 'object' || Array.isArray(body)) throw fail('Request body must be a JSON object.');
      return serialized(async () => {
        const state = store.read();
        if (req.method === 'PUT' && url.pathname === '/api/provider') return send(res, 200, {settings:await providers.save(body)});
        if (req.method === 'POST' && url.pathname === '/api/provider/test') return send(res, 200, {...await testProvider(providers.read(), {fetchImpl}), settings:providers.public()});
        if (req.method === 'POST' && url.pathname === '/api/syllabus/extract') return send(res, 200, await extractSyllabus(body));
        if (req.method === 'POST' && url.pathname === '/api/intake/prepare') {
          const draft = prepareIntake(body);
          state.intake = {draft, prompt:timetablePrompt(draft), base:plannerFingerprint(state)};
          await store.save(state);
          return send(res, 200, state.intake);
        }
        if (req.method === 'POST' && ['/api/intake/generate','/api/intake/import'].includes(url.pathname)) {
          const pending = state.intake;
          if (!pending || body.draftId !== pending.draft.id) throw fail('This prompt has been superseded. Reload to see the current setup.',409);
          if (pending.base !== plannerFingerprint(state)) throw fail('The active planner changed. Review your inputs and prepare a fresh prompt before replacing it.',409);
          const connected = url.pathname.endsWith('/generate');
          let answer = body.answer;
          if (connected) {
            const response = await requestProvider({provider:providers.read(), fetchImpl, instructions:plannerRole,
              input:pending.prompt, schema:timetableSchema, schemaName:'syllabus_timetable'});
            answer = response.rawOutput;
          }
          const result = applyTimetable(pending.draft, answer, connected ? providers.read().provider : 'web', connected ? providers.read().model : null);
          Object.assign(state, result, {intake:null});
          await store.save(state);
          return send(res, 200, result);
        }
        if (req.method === 'POST' && url.pathname === '/api/chat') {
          if (typeof body.message !== 'string' || !body.message.trim() || body.message.trim().length > 4000) throw fail('Write a message between 1 and 4,000 characters.');
          const mode = body.mode ?? 'local';
          if (!['local', 'ai'].includes(mode)) throw fail('Choose local or ai chat mode.');
          const chat = chatState(state);
          const history = chat.messages.slice(-12).map(({ role, text }) => ({ role, content: text.slice(0, 4000) }));
          const result = await interpretChat(body.message.trim(), state.config, history, { mode, env, fetchImpl, provider:providers.read() });
          chatMessage(chat, 'user', body.message.trim(), mode);
          chat.pending = null;
          if (result.config) {
            const config = validateInput(result.config);
            if (JSON.stringify(config) === JSON.stringify(state.config)) {
              chatMessage(chat, 'assistant', 'Your saved planner already uses those settings. No changes are needed.', mode);
            } else {
              chat.pending = { id: randomUUID(), createdAt: new Date().toISOString(), config, changes: result.changes,
                baseFingerprint: plannerFingerprint(state), mode };
              chatMessage(chat, 'assistant', `${result.reply}\n\nReview the proposed changes below, then apply them to update your timetable. Nothing has changed yet.`, mode);
            }
          } else chatMessage(chat, 'assistant', result.reply, mode);
          await store.save(state);
          return send(res, 200, { chat });
        }
        if (req.method === 'POST' && url.pathname === '/api/chat/apply') {
          const chat = chatState(state);
          if (!chat.pending || body.proposalId !== chat.pending.id) throw fail('This proposal is no longer available. Send your request again.', 409);
          if (chat.pending.baseFingerprint !== plannerFingerprint(state)) throw fail('Your planner changed after this proposal. Send your request again so it uses your latest settings and progress.', 409);
          const pending = chat.pending;
          const input = validateInput(pending.config);
          const result = generatePlan(input);
          if (result.checks.some(check => check.id !== 'coverage' && !check.passed)) throw fail('The proposed timetable failed its constraint checks. Your current plan has been kept.', 422);
          const completed = new Set((state.plan?.sessions || []).filter(s => s.completed).map(sessionIdentity));
          result.sessions.forEach(session => { session.completed = completed.has(sessionIdentity(session)); });
          const before = { config: structuredClone(state.config), plan: structuredClone(state.plan) };
          state.config = input;
          state.plan = { id: randomUUID(), createdAt: new Date().toISOString(), input, ...result,
            source: 'constraint-engine', promptVersion: 'chat-v1', model: null, chatSource: pending.mode, chatChangeId: pending.id };
          chat.pending = null;
          chat.undo = { id: randomUUID(), createdAt: new Date().toISOString(), before, afterFingerprint: plannerFingerprint(state) };
          const kept = result.sessions.filter(s => s.completed).length;
          const moved = completed.size - kept;
          const progressNote = completed.size ? ` ${kept} matching completed session(s) kept.${moved ? ` ${moved} completed session(s) no longer match the new timetable; Undo restores the earlier plan and progress.` : ''}` : '';
          chatMessage(chat, 'assistant', `Applied ${pending.changes.length} change(s) and rebuilt your timetable: ${result.stats.sessionCount} sessions, ${result.stats.coveragePercent}% of requested study time allocated.${result.stats.unscheduledMinutes ? ` ${result.stats.unscheduledMinutes} minutes could not fit; review the planner warnings.` : ' All requested study time fits.'}${progressNote}`, pending.mode);
          await store.save(state);
          return send(res, 200, { chat, config: state.config, plan: state.plan });
        }
        if (req.method === 'POST' && url.pathname === '/api/chat/dismiss') {
          const chat = chatState(state);
          if (!chat.pending || body.proposalId !== chat.pending.id) throw fail('This proposal is no longer available.', 409);
          chat.pending = null;
          chatMessage(chat, 'assistant', 'Proposal dismissed. Your study plan is unchanged.', 'local');
          await store.save(state);
          return send(res, 200, { chat });
        }
        if (req.method === 'POST' && url.pathname === '/api/chat/undo') {
          const chat = chatState(state);
          if (!chat.undo) throw fail('There is no assistant update to undo.', 409);
          if (chat.undo.afterFingerprint !== plannerFingerprint(state)) throw fail('The planner or your progress changed after that update. Undo would overwrite newer work, so it was not applied.', 409);
          state.config = validateInput(chat.undo.before.config, {allowEmpty:true});
          state.plan = chat.undo.before.plan;
          chat.undo = null;
          chat.pending = null;
          chatMessage(chat, 'assistant', 'Restored the settings, timetable and completion progress from before the last assistant update.', 'local');
          await store.save(state);
          return send(res, 200, { chat, config: state.config, plan: state.plan });
        }
        if (req.method === 'POST' && url.pathname === '/api/chat/clear') {
          const chat = chatState(state);
          chat.messages = [];
          chat.pending = null;
          await store.save(state);
          return send(res, 200, { chat });
        }
        if (req.method === 'PUT' && url.pathname === '/api/config') {
          state.config = validateInput(body, {allowEmpty:true});
          state.plan = null;
          await store.save(state);
          return send(res, 200, { config: state.config, plan: null });
        }
        if (req.method === 'POST' && ['/api/generate', '/api/experiments'].includes(url.pathname)) {
          const mode = body.mode ?? 'engine';
          const promptVersion = body.promptVersion ?? 'v3';
          const input = validateInput(state.config);
          const result = await execute(input, mode, promptVersion);
          const experiment = record(input, mode, promptVersion, result);
          state.experiments.unshift(experiment);
          state.experiments = state.experiments.slice(0, 100);
          if (url.pathname === '/api/experiments') {
            await store.save(state);
            return send(res, 200, { experiment, experiments: state.experiments });
          }
          if (result.error) {
            await store.save(state);
            return send(res, 422, { error: result.error, checks: result.checks, experimentId: experiment.id });
          }
          state.plan = { id: randomUUID(), createdAt: new Date().toISOString(), input,
            sessions: result.sessions, warnings: result.warnings, checks: result.checks, stats: result.stats, subjectSummaries: result.subjectSummaries,
            source: mode === 'ai' ? providers.read().provider : 'constraint-engine', promptVersion, model: mode === 'ai' ? providers.read().model : null };
          await store.save(state);
          return send(res, 200, { plan: state.plan });
        }
        const sessionMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)$/);
        if (req.method === 'PATCH' && sessionMatch) {
          if (typeof body.completed !== 'boolean') throw fail('completed must be true or false.');
          const session = state.plan?.sessions.find(s => s.id === decodeURIComponent(sessionMatch[1]));
          if (!session) throw fail('Study session not found. Generate a plan first.', 404);
          session.completed = body.completed;
          await store.save(state);
          return send(res, 200, { plan: state.plan });
        }
        if (req.method === 'POST' && url.pathname === '/api/evaluate') {
          state.evaluation = runEvaluation();
          await store.save(state);
          return send(res, 200, { evaluation: state.evaluation });
        }
        const experimentMatch = url.pathname.match(/^\/api\/experiments\/([^/]+)$/);
        if (req.method === 'DELETE' && experimentMatch) {
          const id = decodeURIComponent(experimentMatch[1]);
          if (!state.experiments.some(e => e.id === id)) throw fail('Experiment not found.', 404);
          state.experiments = state.experiments.filter(e => e.id !== id);
          await store.save(state);
          return send(res, 200, { experiments: state.experiments });
        }
        throw fail('API route not found.', 404);
      });
    }
    if (req.method === 'GET' || req.method === 'HEAD') {
      const publicFiles = new Map([['/', 'index.html'], ['/index.html', 'index.html'], ['/app.js', 'app.js'], ['/styles.css', 'styles.css'], ...['features.css','features.js','planner-setup.js','timer-core.js','theme.js','theme.css'].map(file=>['/'+file,file])]);
      let file;
      if (publicFiles.has(url.pathname)) file = resolve(root, 'public', publicFiles.get(url.pathname));
      if (/^\/docs\/(REPORT\.md|SUBMISSION-CHECKLIST\.md|DEMO-SCRIPTS\.md|CONTRIBUTIONS\.csv|PROMPT-ITERATIONS\.md|CHAT-GUIDE\.md|FEATURES-GUIDE\.md|evaluation-results\.json)$/.test(url.pathname)) file = resolve(root, '.' + url.pathname);
      if (!file) throw fail('Page not found.', 404);
      const type = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.md': 'text/plain', '.csv': 'text/csv', '.json': 'text/plain' }[extname(file)] + '; charset=utf-8';
      try { return send(res, 200, req.method === 'HEAD' ? '' : await readFile(file), type); }
      catch (error) { if (error.code === 'ENOENT') throw fail('File not found.', 404); throw error; }
    }
    throw fail('Route not found.', 404);
  }
  const server = http.createServer((req, res) => {
    route(req, res).catch(error => {
      if (!res.headersSent) send(res, error.status || 500, { error: error.status ? error.message : 'An unexpected server error occurred. Your previous saved data is preserved.' });
      else res.end();
      if (!error.status) console.error('Request failed:', error.code || error.name);
    });
  });
  server.requestTimeout = 150000;
  server.headersTimeout = 15000;
  return server;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.loadEnvFile(resolve(root, '.env')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const port = Number(process.env.PORT || 4310);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer from 1 to 65535.');
  const server = await createApp();
  server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? `Port ${port} is already in use. Close the existing server or set another PORT in .env.` : error.message); process.exitCode = 1; });
  const host = process.env.HOST || '0.0.0.0';
  server.listen(port, host, () => {
    console.log(`StudyFlow is ready at http://${host}:${port}`);
    console.log('AI provider settings are available inside the app.');
  });
}
