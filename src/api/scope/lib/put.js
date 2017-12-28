// @flow
import { loadScope } from '../../../scope';
import ComponentObjects from '../../../scope/component-objects';
import { PRE_RECEIVE_OBJECTS, POST_RECEIVE_OBJECTS } from '../../../constants';
import HooksManager from '../../../hooks';

const HooksManagerInstance = HooksManager.getInstance();

export type ComponentObjectsInput = {
  path: string,
  componentObjects: string
};

export default function put(
  { path, componentObjects }: ComponentObjectsInput,
  headers: ?Object
): Promise<ComponentObjects[]> {
  if (typeof componentObjects === 'string') {
    componentObjects = ComponentObjects.manyFromString(componentObjects);
  }
  HooksManagerInstance.triggerHook(PRE_RECEIVE_OBJECTS, { path, componentObjects }, headers);

  return loadScope(path).then((scope) => {
    return scope.exportManyBareScope(componentObjects).then((componentsIds) => {
      HooksManagerInstance.triggerHook(
        POST_RECEIVE_OBJECTS,
        {
          componentObjects,
          componentsIds,
          scopePath: path,
          scopeName: scope.scopeJson.name
        },
        headers
      );
      return componentsIds;
    });
  });
}
