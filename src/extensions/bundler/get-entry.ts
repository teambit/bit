import { join } from 'path';
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
  const mainFiles = context.components.map((component) => {
    const path = join(
      // :TODO check how it works with david. Feels like a side-effect.
      // this.workspace.componentDir(component.id, {}, { relative: true }),
      // @ts-ignore
      uiRoot.componentDir(component.id, {}, { relative: true }),
      component.config.main
    );

    return path;
  });

  const slotEntries = await Promise.all(
    runtimeSlot.values().map(async (browserRuntime) => browserRuntime.entry(context))
  );

  const slotPaths = slotEntries.reduce((acc, current) => {
    acc = acc.concat(current);
    return acc;
  });

  const paths = mainFiles.concat(slotPaths);

  return paths;
}
