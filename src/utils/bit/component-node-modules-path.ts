import * as path from 'path';
import GeneralError from '../../error/general-error';
import { PathOsBasedRelative } from '../path';
import { NODE_PATH_COMPONENT_SEPARATOR, DEFAULT_BINDINGS_PREFIX } from '../../constants';
import BitId from '../../bit-id/bit-id';

export default function getNodeModulesPathOfComponent(
  bindingPrefix: string | null | undefined,
  id: BitId,
  allowNonScope = false
): PathOsBasedRelative {
  if (!id.scope && !allowNonScope) {
    throw new GeneralError(
      `Failed creating a path in node_modules for ${id.toString()}, as it does not have a scope yet`
    );
  }
  if (!bindingPrefix) bindingPrefix = DEFAULT_BINDINGS_PREFIX;
  // Temp fix to support old components before the migration has been running
  bindingPrefix = bindingPrefix === 'bit' ? '@bit' : bindingPrefix;
  const allSlashes = new RegExp('/', 'g');
  const name = id.name.replace(allSlashes, NODE_PATH_COMPONENT_SEPARATOR);
  const partsToJoin = id.scope ? [id.scope, name] : [name];
  return path.join('node_modules', bindingPrefix, partsToJoin.join(NODE_PATH_COMPONENT_SEPARATOR));
}
