import { LaneId } from '@teambit/lane-id';

/** Allocate scalar identities only after the complete snapshot plan is eligible. */
export async function resolveSnapshotReceipt(identities: string[], preparation: any) {
  if (
    !Array.isArray(identities) ||
    !identities.length ||
    identities.length > 4096 ||
    identities.some((identity) => typeof identity !== 'string' || !identity || identity.length > 4096) ||
    new Set(identities).size !== identities.length ||
    !preparation ||
    typeof preparation.laneHistory !== 'boolean' ||
    !Array.isArray(preparation.squash)
  )
    throw new Error('resolve snapshot scalar preparation');
  const squash = new Map<string, LaneId>();
  for (const row of preparation.squash) {
    if (
      !identities.includes(row.identity) ||
      squash.has(row.identity) ||
      !row.laneId ||
      typeof row.laneId.scope !== 'string' ||
      typeof row.laneId.name !== 'string'
    )
      throw new Error('resolve squash scalar preparation');
    squash.set(row.identity, LaneId.from(row.laneId.name, row.laneId.scope));
  }
  const { newSnapHash, newSnapBatchId } = await import('@teambit/snapping/dist/new-snap-hash.js');
  const { getBasicLog, getLogForSquash } = await import('@teambit/harmony.modules.get-basic-log');
  const { getBitVersion } = await import('@teambit/bit.get-bit-version');
  const batchId = newSnapBatchId();
  const versions = identities.map((identity) => ({ identity, hash: newSnapHash() }));
  const log = await getBasicLog();
  const withSquash: { identity: string; hash: string; squashLog?: Awaited<ReturnType<typeof getLogForSquash>> }[] = [];
  for (const version of versions) {
    const lane = squash.get(version.identity);
    withSquash.push(lane ? { ...version, squashLog: await getLogForSquash(lane) } : version);
  }
  const laneLog = preparation.laneHistory ? await getBasicLog() : undefined;
  return { batchId, versions: withSquash, log, bitVersion: getBitVersion(), ...(laneLog && { laneLog }) };
}
