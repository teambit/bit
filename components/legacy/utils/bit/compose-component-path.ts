import { ComponentID } from '@teambit/component-id';
import format from 'string-format';
import { DEFAULT_COMPONENTS_DIR_PATH } from '@teambit/legacy/dist/constants';
import { PathLinuxRelative } from '@teambit/toolbox.path.path';
import { parseScope } from './parse-scope';

/**
 * the following place-holders are permitted:
 * name - component name includes namespace, e.g. 'ui/button'.
 * scopeId - full scope-id includes the owner, e.g. 'teambit.compilation'.
 * scope - scope name only, e.g. 'compilation'.
 * owner - owner name in bit.dev, e.g. 'teambit'.
 */
export function composeComponentPath(
  bitId: ComponentID,
  componentsDefaultDirectory: string = DEFAULT_COMPONENTS_DIR_PATH
): PathLinuxRelative {
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
  if (componentsDefaultDirectory.includes('{owner}/') && !owner) {
    defaultDir = componentsDefaultDirectory.replace('{owner}/', '');
  }
  const result = format(defaultDir, { name: bitId.fullName, scope, owner, scopeId: bitId.scope });
  return result;
}
