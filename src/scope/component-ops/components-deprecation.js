// @flow
import groupArray from 'group-array';
import logger from '../../logger/logger';
import { BitIds, BitId } from '../../bit-id';
import type { BitIdStr } from '../../bit-id/bit-id';
import { Scope } from '..';
import { getScopeRemotes } from '../scope-remotes';
import enrichContextFromGlobal from '../../hooks/utils/enrich-context-from-global';

export type DeprecationResult = {
  bitIds: BitIdStr[],
  missingComponents: BitIdStr[]
};

/**
 * deprecate components from scope
 */
export async function deprecateMany(scope: Scope, bitIds: BitIds): Promise<DeprecationResult> {
  logger.debug(`scope.deprecateMany, ids: ${bitIds.toString()}`);
  const { missingComponents, foundComponents } = await scope.filterFoundAndMissingComponents(bitIds);
  const deprecatedComponentsP = foundComponents.map(bitId => _deprecateSingle(scope, bitId));
  const deprecatedComponents = await Promise.all(deprecatedComponentsP);
  await scope.objects.persist();
  const missingComponentsStrings = missingComponents.map(id => id.toStringWithoutVersion());
  return { bitIds: deprecatedComponents, missingComponents: missingComponentsStrings };
}

export async function deprecateRemote(scope: Scope, bitIds: Array<BitId>): Promise<DeprecationResult[]> {
  const groupedBitsByScope = groupArray(bitIds, 'scope');
  const remotes = await getScopeRemotes(scope);
  const context = {};
  enrichContextFromGlobal(context);
  const deprecateP = Object.keys(groupedBitsByScope).map(async (scopeName) => {
    const resolvedRemote = await remotes.resolve(scopeName, scope);
    const idsStr = groupedBitsByScope[scopeName].map(id => id.toStringWithoutVersion());
    const deprecateResult = await resolvedRemote.deprecateMany(idsStr, context);
    return deprecateResult;
  });
  const deprecatedComponentsResult = await Promise.all(deprecateP);
  return deprecatedComponentsResult;
}

async function _deprecateSingle(scope: Scope, bitId: BitId): Promise<string> {
  const component = await scope.getModelComponent(bitId);
  component.deprecated = true;
  scope.objects.add(component);
  return bitId.toStringWithoutVersion();
}
