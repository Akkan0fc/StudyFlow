import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { ensureDir } from './store.mjs';

const fail = (message, status = 400, noRepair = true) => Object.assign(new Error(message), { status, noRepair });
const endpoints = { responses: 'https://api.openai.com/v1/responses', 'chat-completions': 'https://api.openai.com/v1/chat/completions' };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

export function validateEndpoint(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 2000) throw fail('Enter a complete provider endpoint URL.');
  let url;
  try { url = new URL(value.trim()); } catch { throw fail('The provider endpoint must be a valid URL.'); }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.username || url.password || url.search || url.hash) throw fail('Provider URLs cannot contain credentials, query parameters, or fragments.');
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) throw fail('Use HTTPS for remote providers, or HTTP on localhost, 127.0.0.1, or [::1].');
  // Reject alternate numeric spellings that the URL parser normalizes into loopback.
  if (url.protocol === 'http:') {
    const authority = value.trim().match(/^http:\/\/([^/]+)/i)?.[1];
    if (!/^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(authority || '')) throw fail('HTTP is allowed only with an explicit supported localhost address.');
  }
  return url.href;
}

export function providerFromEnv(env = process.env) {
  return { provider: 'openai', protocol: 'responses', endpoint: endpoints.responses,
    model: typeof env.AI_MODEL === 'string' ? env.AI_MODEL.trim() : '',
    apiKey: typeof env.OPENAI_API_KEY === 'string' ? env.OPENAI_API_KEY.trim() : '', structuredOutputs: true, source: 'environment' };
}

export function normalizeProvider(raw, previous = null) {
  if (!object(raw)) throw fail('Provider settings must be a JSON object.');
  const permitted = ['provider', 'protocol', 'endpoint', 'model', 'apiKey', 'structuredOutputs', 'source', 'clearApiKey'];
  if (Object.keys(raw).some(key => !permitted.includes(key))) throw fail('Provider settings contain unsupported fields.');
  if (!['openai', 'custom'].includes(raw.provider)) throw fail('Choose openai or custom provider.');
  if (!['responses', 'chat-completions'].includes(raw.protocol)) throw fail('Choose responses or chat-completions protocol.');
  if (typeof raw.model !== 'string' || raw.model.length > 200 || /[\r\n]/.test(raw.model)) throw fail('Model must be a short model identifier.');
  if (typeof raw.structuredOutputs !== 'boolean') throw fail('structuredOutputs must be true or false.');
  if (raw.apiKey !== undefined && (typeof raw.apiKey !== 'string' || raw.apiKey.length > 4096 || /[\r\n]/.test(raw.apiKey))) throw fail('API key must be a single-line string.');
  const endpoint = validateEndpoint(raw.endpoint || (raw.provider === 'openai' ? endpoints[raw.protocol] : ''));
  if (raw.provider === 'openai' && endpoint !== endpoints[raw.protocol]) throw fail('The OpenAI preset uses its official endpoint. Choose Custom for a different service.');
  const sameDestination = previous && previous.provider === raw.provider && previous.endpoint === endpoint;
  if (raw.clearApiKey !== undefined && typeof raw.clearApiKey !== 'boolean') throw fail('clearApiKey must be true or false.');
  const apiKey = raw.clearApiKey ? '' : raw.apiKey?.trim() || (sameDestination ? previous.apiKey : '') || '';
  return { provider: raw.provider, protocol: raw.protocol, endpoint, model: raw.model.trim(), apiKey,
    structuredOutputs: raw.structuredOutputs, source: 'local-settings' };
}

export function publicProvider(settings) {
  const local = settings.provider === 'custom' && ['localhost', '127.0.0.1', '[::1]'].includes(new URL(settings.endpoint).hostname);
  return { provider: settings.provider, protocol: settings.protocol, endpoint: settings.endpoint, model: settings.model,
    structuredOutputs: settings.structuredOutputs, configured: Boolean(settings.model && (settings.apiKey || local)),
    hasApiKey: Boolean(settings.apiKey), apiKeyMasked: settings.apiKey ? '••••••••' : '', source: settings.source || 'local-settings' };
}

export async function openProviderStore(directory, env = process.env) {
  await ensureDir(directory);
  const filename = join(directory, 'ai-settings.json');
  let saved = null;
  try { saved = normalizeProvider(JSON.parse(await readFile(filename, 'utf8'))); }
  catch (error) { if (error.code !== 'ENOENT') throw fail('Local AI settings could not be read. Repair data/ai-settings.json; the file has not been overwritten.', 500); }
  const read = () => structuredClone(saved || providerFromEnv(env));
  return { read, public: () => publicProvider(read()), save: async raw => {
    const next = normalizeProvider(raw, read());
    const temporary = join(directory, `ai-settings-${randomUUID()}.tmp`);
    await writeFile(temporary, JSON.stringify(next, null, 2), { mode: 0o600 });
    await rename(temporary, filename);
    saved = next;
    return publicProvider(next);
  } };
}

/** Only OpenAI Responses and OpenAI-compatible Chat Completions with optional Bearer auth are supported. */
export async function requestProvider({ provider, env = process.env, fetchImpl = fetch, instructions, input, schema, schemaName = 'result', structured = true, maxOutputTokens = 16000 }) {
  const settings = provider ? normalizeProvider(provider) : providerFromEnv(env);
  const status = publicProvider(settings);
  if (!status.configured) throw fail('AI is not configured. Save provider settings, or add OPENAI_API_KEY and AI_MODEL to .env. The local constraint engine is available now.', 503);
  const label = settings.provider === 'openai' ? 'OpenAI' : 'AI provider';
  const useSchema = Boolean(structured && schema && settings.structuredOutputs);
  const system = instructions + (structured && schema && !useSchema ? `\nReturn only JSON matching this schema:\n${JSON.stringify(schema)}` : '');
  const body = settings.protocol === 'responses' ? {
    model: settings.model, store: false, instructions: system, input, max_output_tokens: maxOutputTokens,
    ...(useSchema ? { text: { format: { type: 'json_schema', name: schemaName, strict: true, schema } } } : {}),
  } : {
    model: settings.model, messages: [{ role: 'system', content: system }, { role: 'user', content: input }],
    ...(settings.provider === 'openai' ? { max_completion_tokens: maxOutputTokens, store: false } : { max_tokens: maxOutputTokens }),
    ...(useSchema ? { response_format: { type: 'json_schema', json_schema: { name: schemaName, strict: true, schema } } } : {}),
  };
  let response;
  let result;
  try {
    response = await fetchImpl(settings.endpoint, { method: 'POST', redirect: 'error',
      headers: { 'Content-Type': 'application/json', ...(settings.apiKey ? { Authorization: `Bearer ${settings.apiKey}` } : {}) },
      body: JSON.stringify(body), signal: AbortSignal.timeout(60000),
    });
    if (!response.ok) {
      const hint = response.status === 401 || response.status === 403 ? 'Check the API key and provider permissions.' : response.status === 429 ? 'Check the account quota or try again later.' : response.status === 400 || response.status === 404 ? 'Check the endpoint, model and structured-output support.' : 'Try again later.';
      throw fail(`${label} returned HTTP ${response.status}. ${hint}`, 502);
    }
    result = await response.json();
  } catch (error) {
    if (error.status) throw error;
    throw fail(error.name === 'TimeoutError' || error.name === 'AbortError' ? `${label} timed out. Try a smaller request.` : `${label} could not be reached or returned unreadable data. Check the endpoint and connection.`, 502);
  }
  let rawOutput;
  if (settings.protocol === 'responses') {
    if (result.status && result.status !== 'completed') throw fail(`${label} returned an incomplete response. Try a smaller request.`, 502, false);
    rawOutput = Array.isArray(result.output) ? result.output.flatMap(item => item.content || []).filter(item => item.type === 'output_text').map(item => item.text).join('\n') : '';
  } else {
    const choice = result.choices?.[0];
    if (choice?.finish_reason && choice.finish_reason !== 'stop') throw fail(`${label} returned an incomplete or declined response. Try a smaller request.`, 502, false);
    rawOutput = choice?.message?.content;
  }
  if (typeof rawOutput !== 'string' || !rawOutput.trim() || rawOutput.length > 2_000_000) throw fail(`${label} returned no usable text or declined this request.`, 502, false);
  const usage = object(result.usage) ? Object.fromEntries(Object.entries(result.usage).filter(([, value]) => typeof value === 'number' && Number.isFinite(value))) : null;
  return { rawOutput, usage, provider: settings.provider, model: settings.model };
}

export async function testProvider(provider, { fetchImpl = fetch } = {}) {
  const started = performance.now();
  const result = await requestProvider({ provider, fetchImpl, instructions: 'This is a connectivity test. Reply with the word OK.', input: 'Reply OK.', maxOutputTokens: 32, structured: false });
  return { ok: true, message: 'The provider returned a usable text response. Timetable and chat outputs will still be validated independently.', latencyMs: Math.round(performance.now() - started), provider: result.provider, model: result.model };
}
