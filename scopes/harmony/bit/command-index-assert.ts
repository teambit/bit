import type { CLIMain, Command } from '@teambit/cli';
import { logger } from '@teambit/legacy.logger';
import type { CommandIndexEntry } from './command-index.generated';
import { COMMAND_INDEX } from './command-index.generated';

/**
 * Verifies that the generated command index (committed under
 * `command-index.generated.ts`) matches the live `commandsSlot` after eager
 * bootstrap. On divergence, logs a loud warning. When
 * `BIT_STRICT_COMMAND_INDEX=1` is set, divergence throws instead.
 *
 * See RFC §7 Phase 1 / §10 Slice 2 (docs/rfc-esm-lazy-aspects.md).
 */
export function assertCommandIndexMatchesLive(cli: CLIMain) {
  // Empty placeholder index means the codegen hasn't run yet on this checkout.
  // Don't fail — just hint at how to populate it.
  if (COMMAND_INDEX.length === 0) {
    logger.debug('command-index.generated.ts is empty; run `npm run generate-command-index`');
    return;
  }

  const live = buildLiveIndex(cli);
  const diff = diffIndexes(COMMAND_INDEX, live);
  if (diff.length === 0) return;

  const msg = [
    '*** command index out of date ***',
    'The generated index at scopes/harmony/bit/command-index.generated.ts',
    'does not match the live commandsSlot. Regenerate it with:',
    '    npm run generate-command-index',
    '',
    'Differences (first 20):',
    ...diff.slice(0, 20).map((d) => `  - ${d}`),
    diff.length > 20 ? `  ... and ${diff.length - 20} more` : '',
  ]
    .filter(Boolean)
    .join('\n');

  if (process.env.BIT_STRICT_COMMAND_INDEX === '1') {
    throw new Error(msg);
  }
  // Show on stderr too so devs notice — logger.warn alone is silent in normal runs.
  // eslint-disable-next-line no-console
  console.error(msg);
  logger.warn(msg);
}

function buildLiveIndex(cli: CLIMain): CommandIndexEntry[] {
  const result: CommandIndexEntry[] = [];
  for (const [aspectId, commands] of cli.commandsByAspect()) {
    for (const cmd of commands) {
      result.push(toEntry(aspectId, cmd));
    }
  }
  return sortEntries(result);
}

function toEntry(aspectId: string, cmd: Command): CommandIndexEntry {
  const entry: CommandIndexEntry = {
    name: commandName(cmd.name),
    aspectId,
  };
  if (cmd.alias) entry.alias = cmd.alias;
  if (cmd.description) entry.description = String(cmd.description);
  if (cmd.group) entry.group = String(cmd.group);
  if (cmd.private) entry.private = true;
  if (cmd.loader === false) entry.loader = false;
  if (cmd.loadAspects === false) entry.loadAspects = false;
  if (cmd.remoteOp) entry.remoteOp = true;
  if (cmd.skipWorkspace) entry.skipWorkspace = true;
  if (cmd.commands && cmd.commands.length > 0) {
    entry.subCommands = sortEntries(cmd.commands.map((sub) => toEntry(aspectId, sub)));
  }
  return entry;
}

function commandName(name: string): string {
  return name.split(' ')[0].trim();
}

function sortEntries(entries: CommandIndexEntry[]): CommandIndexEntry[] {
  return [...entries].sort((a, b) => a.name.localeCompare(b.name) || a.aspectId.localeCompare(b.aspectId));
}

function diffIndexes(generated: CommandIndexEntry[], live: CommandIndexEntry[]): string[] {
  const out: string[] = [];
  const keyOf = (e: CommandIndexEntry) => `${e.name}@${e.aspectId}`;
  const genMap = new Map(generated.map((e) => [keyOf(e), e]));
  const liveMap = new Map(live.map((e) => [keyOf(e), e]));

  for (const key of genMap.keys()) {
    if (!liveMap.has(key)) out.push(`missing at runtime: ${key} (in generated index but not registered)`);
  }
  for (const key of liveMap.keys()) {
    if (!genMap.has(key)) out.push(`missing from index: ${key} (registered at runtime but not in generated index)`);
  }
  for (const [key, genEntry] of genMap.entries()) {
    const liveEntry = liveMap.get(key);
    if (!liveEntry) continue;
    const fieldDiffs = compareFields(genEntry, liveEntry);
    for (const fd of fieldDiffs) out.push(`${key}: ${fd}`);
  }
  return out;
}

const COMPARED_FIELDS: Array<keyof CommandIndexEntry> = [
  'alias',
  'description',
  'group',
  'private',
  'loader',
  'loadAspects',
  'remoteOp',
  'skipWorkspace',
];

function compareFields(a: CommandIndexEntry, b: CommandIndexEntry): string[] {
  const out: string[] = [];
  for (const f of COMPARED_FIELDS) {
    if (a[f] !== b[f]) out.push(`${f}: generated=${JSON.stringify(a[f])} live=${JSON.stringify(b[f])}`);
  }
  const aSub = (a.subCommands ?? []).map((s) => s.name).sort();
  const bSub = (b.subCommands ?? []).map((s) => s.name).sort();
  if (aSub.join(',') !== bSub.join(',')) {
    out.push(`subCommands: generated=[${aSub.join(',')}] live=[${bSub.join(',')}]`);
  }
  return out;
}
