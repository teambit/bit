// @flow
import { loadScope } from '../../../scope';
import { BitId } from '../../../bit-id';

export default function latestVersions(path: string, componentIdsStr: string[]): Promise<any> {
  const componentIds = componentIdsStr.map(id => BitId.parse(id));
  return loadScope(path)
    .then(scope => scope.latestVersions(componentIds))
    .then(componentsIds => componentsIds.map(componentId => componentId.toString()));
}
