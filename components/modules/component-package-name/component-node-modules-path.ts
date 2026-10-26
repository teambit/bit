import * as path from 'path';
import type { ComponentID } from '@teambit/component-id';
import type { PathOsBasedRelative } from '@teambit/toolbox.path.path';
import type { ComponentExtensions } from './component-id-to-package-name';
import { componentIdToPackageName } from './component-id-to-package-name';

export function getNodeModulesPathOfComponent({
  bindingPrefix,
  id,
  defaultScope,
  extensions,
  isDependency = false,
}: {
  bindingPrefix?: string;
  id: ComponentID;
  defaultScope?: string | null;
  extensions: ComponentExtensions;
  isDependency?: boolean;
}): PathOsBasedRelative {
  const packageName = componentIdToPackageName({
    id,
    bindingPrefix,
    defaultScope,
    extensions,
    isDependency,
  });
  return path.join('node_modules', packageName);
}
