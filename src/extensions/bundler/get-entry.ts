import { BrowserRuntimeSlot } from './bundler.extension';
import { ExecutionContext } from '../environments';
import { PathOsBased } from '../../utils/path';
import { GetBitMapComponentOptions } from '../../consumer/bit-map/bit-map';
import { ComponentID } from '../component';

export type ComponentDir = {
  componentDir?: (
    componentId: ComponentID,
    bitMapOptions?: GetBitMapComponentOptions,
    options?: { relative: boolean }
  ) => PathOsBased | undefined;
};

/**
 * computes the bundler entry.
 */
export async function getEntry(
  context: ExecutionContext,
  uiRoot: ComponentDir,
  runtimeSlot: BrowserRuntimeSlot
): Promise<string[]> {
  // TODO: refactor this away from here and use computePaths instead
  const slotEntries = await Promise.all(
    runtimeSlot.values().map(async (browserRuntime) => browserRuntime.entry(context))
  );

  const slotPaths = slotEntries.reduce((acc, current) => {
    acc = acc.concat(current);
    return acc;
  });

  return slotPaths;
}
