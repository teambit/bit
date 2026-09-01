/* eslint-disable no-console */
/**
 * Standalone subprocess runner for `helper.snapping.removeUpdateDependents`. Mirrors the Cloud UI's
 * `removeUpdateDependents` GraphQL mutation by calling `LanesMain.removeUpdateDependents` directly
 * against a bare scope path. Spawned via `child_process` so each invocation gets a clean Node
 * process — see snap-from-scope-runner.ts for the same rationale.
 *
 * argv: <scopePath> <laneId> [<idsJson>]
 */
import { loadBit } from '@teambit/bit';
import { ComponentID } from '@teambit/component-id';
import { LaneId } from '@teambit/lane-id';
import type { LanesMain } from '@teambit/lanes';
import { LanesAspect } from '@teambit/lanes';

async function main(): Promise<void> {
  const [, , scopePath, laneIdStr, idsJson] = process.argv;
  const harmony = await loadBit(scopePath);
  const lanes = harmony.get<LanesMain>(LanesAspect.id);
  const laneId = LaneId.parse(laneIdStr);
  const ids = idsJson ? (JSON.parse(idsJson) as string[]).map((id) => ComponentID.fromString(id)) : undefined;
  await lanes.removeUpdateDependents(laneId, ids);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
