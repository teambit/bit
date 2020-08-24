import * as path from 'path';

import BitId from '../../bit-id/bit-id';
import { ExtensionDataList } from '../../consumer/config/extension-data';
import GeneralError from '../../error/general-error';
import { PathOsBasedRelative } from '../path';
import componentIdToPackageName from './component-id-to-package-name';

export default function getNodeModulesPathOfComponent({
  bindingPrefix,
  id,
  allowNonScope = false,
  defaultScope, // if an id doesn't have a scope, use defaultScope if exists. applies only when allowNonScope is true
  extensions,
  isDependency = false,
}: {
  bindingPrefix?: string;
  id: BitId;
  allowNonScope?: boolean;
  defaultScope?: string | null; // if an id doesn't have a scope, use defaultScope if exists. applies only when allowNonScope is true
  extensions: ExtensionDataList;
  isDependency?: boolean;
}): PathOsBasedRelative {
  if (!id.scope && !allowNonScope) {
    throw new GeneralError(
      `Failed creating a path in node_modules for ${id.toString()}, as it does not have a scope yet`
    );
  }
  const packageName = componentIdToPackageName({
    id,
    bindingPrefix,
    defaultScope,
    withPrefix: undefined,
    extensions,
    isDependency,
  });
  return path.join('node_modules', packageName);
}
