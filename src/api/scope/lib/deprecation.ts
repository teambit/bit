import { BitIds } from '../../../bit-id';
import {
  POST_DEPRECATE_REMOTE,
  POST_UNDEPRECATE_REMOTE,
  PRE_DEPRECATE_REMOTE,
  PRE_UNDEPRECATE_REMOTE,
} from '../../../constants';
import HooksManager from '../../../hooks';
import { loadScope } from '../../../scope';
import { deprecateMany, DeprecationResult, undeprecateMany } from '../../../scope/component-ops/components-deprecation';

const HooksManagerInstance = HooksManager.getInstance();

export async function deprecate(
  { path, ids }: { path: string; ids: string[] },
  headers: Record<string, any> | null | undefined
): Promise<DeprecationResult> {
  const bitIds = BitIds.deserialize(ids);
  const args = { path, bitIds };
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  HooksManagerInstance.triggerHook(PRE_DEPRECATE_REMOTE, args, headers);
  const scope = await loadScope(path);
  const deprecationResult = await deprecateMany(scope, bitIds);
  const hookArgs = {
    deprecatedComponentsIds: deprecationResult.bitIds,
    missingComponentsIds: deprecationResult.missingComponents,
    scopePath: path,
    componentsIds: bitIds.serialize(),
    scopeName: scope.scopeJson.name,
  };
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  await HooksManagerInstance.triggerHook(POST_DEPRECATE_REMOTE, hookArgs, headers);
  return deprecationResult;
}

export async function undeprecate(
  { path, ids }: { path: string; ids: string[] },
  headers: Record<string, any> | null | undefined
): Promise<DeprecationResult> {
  const bitIds = BitIds.deserialize(ids);
  const args = { path, bitIds };
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  HooksManagerInstance.triggerHook(PRE_UNDEPRECATE_REMOTE, args, headers);
  const scope = await loadScope(path);
  const deprecationResult = await undeprecateMany(scope, bitIds);
  const hookArgs = {
    deprecatedComponentsIds: deprecationResult.bitIds,
    missingComponentsIds: deprecationResult.missingComponents,
    scopePath: path,
    componentsIds: bitIds.serialize(),
    scopeName: scope.scopeJson.name,
  };
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  await HooksManagerInstance.triggerHook(POST_UNDEPRECATE_REMOTE, hookArgs, headers);
  return deprecationResult;
}
