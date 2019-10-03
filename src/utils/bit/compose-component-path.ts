import * as path from 'path';
import format from 'string-format';
import { DEFAULT_COMPONENTS_DIR_PATH, DEFAULT_DEPENDENCIES_DIR_PATH } from '../../constants';
import BitId from '../../bit-id/bit-id';
import { PathOsBased } from '../path';

export function composeComponentPath(
  bitId: BitId,
  componentsDefaultDirectory?: string = DEFAULT_COMPONENTS_DIR_PATH
): string {
  return format(componentsDefaultDirectory, { name: bitId.name, scope: bitId.scope });
}

export function composeDependencyPath(
  bitId: BitId,
  dependenciesDir?: string = DEFAULT_DEPENDENCIES_DIR_PATH
): PathOsBased {
  return path.join(dependenciesDir, bitId.toFullPath());
}

export function composeDependencyPathForIsolated(
  bitId: BitId,
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
