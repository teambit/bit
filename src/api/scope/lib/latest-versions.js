// @flow
import { loadScope } from '../../../scope';

export default function latestVersions(path: string, componentIds: BitId[]): Promise<any> {
  return loadScope(path)
    .then(scope => scope.latestVersions(componentIds))
    .then(componentsIds => componentsIds.map(componentId => componentId.toString()));
}
