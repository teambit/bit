import { ExecutionContext } from '@teambit/envs';
import { BrowserRuntimeSlot } from './bundler.main.runtime';

/**
 * computes the bundler entry.
 */
export async function getExposes(
  context: ExecutionContext,
  runtimeSlot: BrowserRuntimeSlot
): Promise<Record<string, string>> {
  // TODO: refactor this away from here and use computePaths instead
  const slotEntries = await Promise.all(
    runtimeSlot.values().map(async (browserRuntime) => browserRuntime.exposes?.(context))
  );

  const exposes = slotEntries.reduce((acc, current) => {
    if (current) {
      acc = Object.assign(acc, current);
    }
    return acc;
  }, {});

  return exposes || {};
}
