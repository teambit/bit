import groupArray from 'group-array';

import { Scope } from '..';
import { BitId, BitIds } from '../../bit-id';
import { BitIdStr } from '../../bit-id/bit-id';
import enrichContextFromGlobal from '../../hooks/utils/enrich-context-from-global';
import logger from '../../logger/logger';
import Remotes from '../../remotes/remotes';
import { ModelComponent } from '../models';

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
  scope: Scope | undefined,
  bitIds: Array<BitId>
): Promise<DeprecationResult[]> {
  return _deprecationRemote(remotes, scope, bitIds, true);
}

export async function undeprecateRemote(
  remotes: Remotes,
  scope: Scope | undefined,
  bitIds: Array<BitId>
): Promise<DeprecationResult[]> {
  return _deprecationRemote(remotes, scope, bitIds, false);
}

async function _deprecationMany(
  scope: Scope,
  ids: BitIds,
  deprecationAction: DeprecationFunction
): Promise<DeprecationResult> {
  const { missingComponents, foundComponents } = await scope.filterFoundAndMissingComponents(ids);
  const modelComponentsP = foundComponents.map((bitId) => deprecationAction(scope, bitId));
  const modelComponents = await Promise.all(modelComponentsP);
  await scope.objects.writeObjectsToTheFS(modelComponents);
  scope.objects.clearCache();
  const missingComponentsStrings = missingComponents.map((id) => id.toStringWithoutVersion());
  const bitIds = modelComponents.map((comp) => comp.id());
  return { bitIds, missingComponents: missingComponentsStrings };
}

async function _deprecationRemote(
  remotes: Remotes,
  scope: Scope | undefined,
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

async function _deprecateSingle(scope: Scope, bitId: BitId): Promise<ModelComponent> {
  const component = await scope.getModelComponent(bitId);
  component.deprecated = true;
  return component;
}

async function _undeprecateSingle(scope: Scope, bitId: BitId): Promise<ModelComponent> {
  const component = await scope.getModelComponent(bitId);
  component.deprecated = false;
  return component;
}

type DeprecationFunction = (scope: Scope, bitId: BitId) => Promise<ModelComponent>;
