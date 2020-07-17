import groupArray from 'group-array';
import logger from '../../logger/logger';
import { BitIds, BitId } from '../../bit-id';
import { BitIdStr } from '../../bit-id/bit-id';
import { Scope } from '..';
import enrichContextFromGlobal from '../../hooks/utils/enrich-context-from-global';
import Remotes from '../../remotes/remotes';

export type DeprecationResult = {
  bitIds: BitIdStr[];
  missingComponents: BitIdStr[];
};

export async function deprecateMany(scope: Scope, bitIds: BitIds): Promise<DeprecationResult> {
  logger.debug(`scope.deprecateMany, ids: ${bitIds.toString()}`);
  return _deprecationMany(scope, bitIds, _deprecateSingle);
}

export async function undeprecateMany(scope: Scope, bitIds: BitIds): Promise<DeprecationResult> {
  logger.debug(`scope.undeprecateMany, ids: ${bitIds.toString()}`);
  return _deprecationMany(scope, bitIds, _undeprecateSingle);
}

export async function deprecateRemote(
  remotes: Remotes,
  scope: Scope | null | undefined,
  bitIds: Array<BitId>
): Promise<DeprecationResult[]> {
  return _deprecationRemote(remotes, scope, bitIds, true);
}

export async function undeprecateRemote(
  remotes: Remotes,
  scope: Scope | null | undefined,
  bitIds: Array<BitId>
): Promise<DeprecationResult[]> {
  return _deprecationRemote(remotes, scope, bitIds, false);
}

async function _deprecationMany(scope: Scope, ids: BitIds, deprecationAction: Function): Promise<DeprecationResult> {
  const { missingComponents, foundComponents } = await scope.filterFoundAndMissingComponents(ids);
  const bitIdsP = foundComponents.map((bitId) => deprecationAction(scope, bitId));
  const bitIds = await Promise.all(bitIdsP);
  await scope.objects.persist();
  const missingComponentsStrings = missingComponents.map((id) => id.toStringWithoutVersion());
  return { bitIds, missingComponents: missingComponentsStrings };
}

async function _deprecationRemote(
  remotes: Remotes,
  scope: Scope | null | undefined,
  bitIds: Array<BitId>,
  deprecate: boolean
): Promise<DeprecationResult[]> {
  const groupedBitsByScope = groupArray(bitIds, 'scope');
  const context = {};
  enrichContextFromGlobal(context);
  const deprecateP = Object.keys(groupedBitsByScope).map(async (scopeName) => {
    const resolvedRemote = await remotes.resolve(scopeName, scope);
    const idsStr = groupedBitsByScope[scopeName].map((id) => id.toStringWithoutVersion());
    const deprecateResult = deprecate
      ? await resolvedRemote.deprecateMany(idsStr, context)
      : await resolvedRemote.undeprecateMany(idsStr, context);
    return deprecateResult;
  });
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  return Promise.all(deprecateP);
}

async function _deprecateSingle(scope: Scope, bitId: BitId): Promise<BitIdStr> {
  const component = await scope.getModelComponent(bitId);
  component.deprecated = true;
  scope.objects.add(component);
  return bitId.toStringWithoutVersion();
}

async function _undeprecateSingle(scope: Scope, bitId: BitId): Promise<BitIdStr> {
  const component = await scope.getModelComponent(bitId);
  component.deprecated = false;
  scope.objects.add(component);
  return bitId.toStringWithoutVersion();
}
