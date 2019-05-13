// @flow
import { loadScope } from '../../../scope';
import ComponentObjects from '../../../scope/component-objects';
import { PRE_RECEIVE_OBJECTS, POST_RECEIVE_OBJECTS } from '../../../constants';
import HooksManager from '../../../hooks';
import { exportManyBareScope } from '../../../scope/component-ops/export-scope-components';
import BitId from '../../../bit-id/bit-id';

const HooksManagerInstance = HooksManager.getInstance();

export type ComponentObjectsInput = {
  path: string,
  componentObjects: string | ComponentObjects[]
};

export default (async function put(
  { path, componentObjects }: ComponentObjectsInput,
  headers: ?Object
): Promise<string[]> {
  if (typeof componentObjects === 'string') {
    componentObjects = ComponentObjects.manyFromString(componentObjects);
  }

  await HooksManagerInstance.triggerHook(PRE_RECEIVE_OBJECTS, { path, componentObjects }, headers);
  const scope = await loadScope(path);
  const componentsBitIds: BitId[] = await exportManyBareScope(scope, componentObjects);
  const componentsIds: string[] = componentsBitIds.map(id => id.toString());
  await HooksManagerInstance.triggerHook(
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
