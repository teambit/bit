import * as path from 'path';
import format from 'string-format';

import BitId from '../../bit-id/bit-id';
import { DEFAULT_COMPONENTS_DIR_PATH, DEFAULT_DEPENDENCIES_DIR_PATH } from '../../constants';
import { PathOsBased } from '../path';
import { parseScope } from './parse-scope';

/**
 * the following place-holders are permitted:
 * name - component name includes namespace, e.g. 'ui/button'.
 * scopeId - full scope-id includes the owner, e.g. 'teambit.compilation'.
 * scope - scope name only, e.g. 'compilation'.
 * owner - owner name in bit.dev, e.g. 'teambit'.
 */
export function composeComponentPath(
  bitId: BitId,
  componentsDefaultDirectory: string = DEFAULT_COMPONENTS_DIR_PATH
): string {
  let defaultDir = componentsDefaultDirectory;
  const { scope, owner } = parseScope(bitId.scope);
  // Prevent case where for example {scope}/{name} becomes /my-comp (in case the scope is empty)
  if (componentsDefaultDirectory.includes('{scope}/') && !bitId.scope) {
    defaultDir = componentsDefaultDirectory.replace('{scope}/', '');
  }
  if (componentsDefaultDirectory.includes('{scopeId}/') && !bitId.scope) {
    defaultDir = componentsDefaultDirectory.replace('{scopeId}/', '');
  }
  if (componentsDefaultDirectory.includes('{owner}.') && !owner) {
    defaultDir = componentsDefaultDirectory.replace('{owner}.', '');
  }
  const result = format(defaultDir, { name: bitId.name, scope, owner, scopeId: bitId.scope });
  return result;
}

export function composeDependencyPath(
  bitId: BitId,
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  dependenciesDir?: string = DEFAULT_DEPENDENCIES_DIR_PATH
): PathOsBased {
  return path.join(dependenciesDir, bitId.toFullPath());
}

export function composeDependencyPathForIsolated(
  bitId: BitId,
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  dependenciesDir?: string = DEFAULT_DEPENDENCIES_DIR_PATH
): PathOsBased {
  const getIdPath = () => {
    try {
      return bitId.toFullPath();
    } catch (err) {
      return bitId.name;
    }
  };
  return path.join(dependenciesDir, getIdPath());
}
