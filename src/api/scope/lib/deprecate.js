// @flow
import { loadScope } from '../../../scope';
import { BitIds } from '../../../bit-id';
import { PRE_DEPRECATE_REMOTE, POST_DEPRECATE_REMOTE } from '../../../constants';
import HooksManager from '../../../hooks';
import { deprecateMany } from '../../../scope/component-ops/components-deprecation';
import type { DeprecationResult } from '../../../scope/component-ops/components-deprecation';

const HooksManagerInstance = HooksManager.getInstance();

export default async function deprecate(
  { path, ids }: { path: string, ids: string[] },
  headers: ?Object
): Promise<DeprecationResult> {
  const bitIds = BitIds.deserialize(ids);
  const args = { path, bitIds };
  HooksManagerInstance.triggerHook(PRE_DEPRECATE_REMOTE, args, headers);
  const scope = await loadScope(path);
  const deprecationResult = await deprecateMany(scope, bitIds);
  const hookArgs = {
    deprecatedComponentsIds: deprecationResult.bitIds,
    missingComponentsIds: deprecationResult.missingComponents,
    scopePath: path,
    componentsIds: bitIds.serialize(),
    scopeName: scope.scopeJson.name
  };
  await HooksManagerInstance.triggerHook(POST_DEPRECATE_REMOTE, hookArgs, headers);
  return deprecationResult;
}
