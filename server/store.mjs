import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { sampleConfig, emptyConfig } from './defaults.mjs';

export async function openStore(directory) {
  await mkdir(directory, { recursive: true });
  const file = join(directory, 'state.json');
  let state;
  try {
    state = JSON.parse(await readFile(file, 'utf8'));
    if (!state.config || !Array.isArray(state.experiments)) throw new Error('Invalid state structure');
  } catch (error) {
    if (error.code !== 'ENOENT') throw new Error('Saved data could not be read. Back up data/state.json and repair it before restarting. Your data has not been overwritten.');
    state = { schemaVersion: 2, config: emptyConfig(), plan: null, experiments: [], evaluation: null };
  }
  if (state.schemaVersion === 1) {
    const legacyStart = new Date(state.config.startDate + 'T06:00:00Z');
    if (Number.isFinite(+legacyStart) && isDeepStrictEqual(state.config, sampleConfig(legacyStart))) {
      // Keep the old demo and its completion history recoverable during this one-time migration.
      await writeFile(join(directory, 'template-backup-' + randomUUID() + '.json'), JSON.stringify(state), {mode:0o600, flag:'wx'});
      state.config = emptyConfig();
      state.plan = null;
      state.experiments = state.experiments.filter(run => !isDeepStrictEqual(run.input, sampleConfig(legacyStart)));
      if (state.chat) Object.assign(state.chat, {pending:null, undo:null});
    }
    state.schemaVersion = 2;
  }
  async function save(next) {
    const temporary = join(directory, `state-${randomUUID()}.tmp`);
    await writeFile(temporary, JSON.stringify(next, null, 2), { mode: 0o600 });
    await rename(temporary, file);
    state = next;
  }
  state.chat ??= { messages: [], pending: null, undo: null };
  await save(state);
  return { read: () => structuredClone(state), save };
}
