import { LaneId } from '@teambit/lane-id';

/** Tags allocate each Version hash and squash log after their shared basic log. */
export async function tagSnapshotReceipt(identities: string[], preparation: any) {
  if (
    !Array.isArray(identities) ||
    !identities.length ||
    identities.length > 4096 ||
    new Set(identities).size !== identities.length ||
    identities.some((id) => typeof id !== 'string' || !id || id.length > 4096) ||
    !preparation ||
    preparation.laneHistory !== false ||
    !Array.isArray(preparation.squash)
  )
    throw new Error('tag scalar preparation');
  const squash = new Map<string, LaneId>();
  for (const row of preparation.squash) {
    if (
      !row ||
      !identities.includes(row.identity) ||
      squash.has(row.identity) ||
      !row.laneId ||
      typeof row.laneId.scope !== 'string' ||
      typeof row.laneId.name !== 'string'
    )
      throw new Error('tag squash scalar preparation');
    squash.set(row.identity, LaneId.from(row.laneId.name, row.laneId.scope));
  }
  const { newSnapBatchId } = await import('@teambit/snapping/dist/new-snap-hash.js');
  const { newTagHash } = await import('@teambit/objects/dist/models/new-tag-hash.js');
  const { getBasicLog, getLogForSquash } = await import('@teambit/harmony.modules.get-basic-log');
  const { getBitVersion } = await import('@teambit/bit.get-bit-version');
  const batchId = newSnapBatchId();
  const log = await getBasicLog();
  const versions: { identity: string; hash: string; squashLog?: Awaited<ReturnType<typeof getLogForSquash>> }[] = [];
  for (const identity of identities) {
    const hash = newTagHash();
    const lane = squash.get(identity);
    versions.push({ identity, hash, ...(lane && { squashLog: await getLogForSquash(lane) }) });
  }
  return { batchId, log, versions, bitVersion: getBitVersion() };
}
