/* eslint-disable no-console */
/**
 * Standalone subprocess runner for `helper.snapping.snapFromScope`. The helper spawns this script
 * via `child_process` so each invocation gets a clean Node process — `loadBit` mutates module-level
 * state that doesn't fully reset between in-process calls, and accumulating that state across many
 * scenarios in one process surfaces as "Version X not found in scope" failures during downstream
 * shell-spawned `bit` commands.
 *
 * argv: <scopePath> <snapDataJson> <optionsJson>
 */
import { loadBit } from '@teambit/bit';
import type { SnappingMain } from '@teambit/snapping';
import { SnappingAspect } from '@teambit/snapping';

async function main(): Promise<void> {
  const [, , scopePath, snapDataJson, optionsJson] = process.argv;
  const snapData = JSON.parse(snapDataJson);
  const options = JSON.parse(optionsJson);

  const harmony = await loadBit(scopePath);
  const snapping = harmony.get<SnappingMain>(SnappingAspect.id);
  await snapping.snapFromScope(snapData, {
    lane: options.lane,
    updateDependents: options.updateDependents,
    push: options.push,
    message: options.message,
    build: false,
    disableTagAndSnapPipelines: true,
  });
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
