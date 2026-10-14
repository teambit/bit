import { LaneId } from '@teambit/lane-id';
import { getBasicLog, getLogForSquash } from '@teambit/harmony.modules.get-basic-log';
import { newLaneHistoryKey } from '@teambit/objects/dist/models/new-lane-history-key.js';
import { splitComponentPatterns, matchComponentPatterns } from '@teambit/scope/dist/component-id-patterns.js';

export function commandLanePatternIds(context: any, pattern: string): string[] {
  const patterns = splitComponentPatterns(pattern);
  if (patterns.some((part) => part.startsWith('$') || part.includes(' AND ')))
    throw new Error('command lane state selector requires workspace callbacks');
  const targets = context?.lane?.targets;
  if (!Array.isArray(targets) || targets.length > 4096) throw new Error('command lane pattern targets');
  const identities = targets.map((target) => target.identity);
  if (
    identities.some((identity) => typeof identity !== 'string' || !identity || identity.length > 4096) ||
    new Set(identities).size !== identities.length
  )
    throw new Error('command lane pattern identities');
  const selected = matchComponentPatterns(identities, patterns);
  if (!selected.length) throw new Error('command lane pattern has no matches');
  return selected;
}

/** Supply only durable identities and user/time metadata; Rust owns the lane objects. */
export async function commandLaneReceipt(preparation: any, context: any) {
  const count = preparation?.importHistoryCount ?? 0;
  if (typeof preparation?.history !== 'boolean' || !Number.isSafeInteger(count) || count < 0 || count > 4096)
    throw new Error('command lane preparation receipt');
  const hashes = preparation.squashMessageHashes ?? [];
  if (
    !Array.isArray(hashes) ||
    hashes.length > 4096 ||
    hashes.some((hash) => typeof hash !== 'string' || !/^[a-f0-9]{40}$/.test(hash)) ||
    new Set(hashes).size !== hashes.length
  )
    throw new Error('command lane squash message receipt');
  const lane = commandOtherLane(context);
  if (typeof context.lane.shouldSquash !== 'boolean') throw new Error('command lane squash receipt');
  if (hashes.length && !context.lane.shouldSquash) throw new Error('command lane squash message without squash');
  const importHistories: Array<{ historyKey: string; log: Awaited<ReturnType<typeof getBasicLog>> }> = [];
  for (let index = 0; index < count; index++) {
    const log = await getBasicLog();
    importHistories.push({ historyKey: newLaneHistoryKey(), log });
  }
  const squashLog = context.lane.shouldSquash ? await getLogForSquash(lane) : undefined;
  const squashMessages = hashes.map((hash) => ({ hash, date: Date.now().toString() }));
  const log = preparation.history ? await getBasicLog() : undefined;
  return {
    importHistories,
    ...(squashLog && { squashLog }),
    ...(squashMessages.length && { squashMessages }),
    ...(log && { historyKey: newLaneHistoryKey(), log }),
  };
}

export function commandOtherLane(context: any, identity?: string): LaneId {
  const other = context?.lane?.otherId;
  if (typeof other?.name !== 'string' || !other.name || typeof other?.scope !== 'string' || !other.scope)
    throw new Error('command lane identity receipt');
  if (identity !== undefined && (!identity.includes('/') || !identity.split('/')[0]))
    throw new Error('command lane component identity');
  return LaneId.from(other.name, other.name === 'main' && identity ? identity.split('/')[0] : other.scope);
}
