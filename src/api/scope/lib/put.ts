import R from 'ramda';
import { loadScope } from '../../../scope';
import ComponentObjects from '../../../scope/component-objects';
import { PRE_RECEIVE_OBJECTS, POST_RECEIVE_OBJECTS } from '../../../constants';
import HooksManager from '../../../hooks';
import { exportManyBareScope } from '../../../scope/component-ops/export-scope-components';
import BitIds from '../../../bit-id/bit-ids';
import { isClientHasVersionBefore } from '../../../scope/network/check-version-compatibility';

const HooksManagerInstance = HooksManager.getInstance();

export type ComponentObjectsInput = {
  path: string;
  componentObjects: string | ComponentObjects[];
};

export default (async function put(
  { path, componentObjects }: ComponentObjectsInput,
  headers: Record<string, any> | null | undefined
): Promise<string[]> {
  if (typeof componentObjects === 'string') {
    componentObjects = ComponentObjects.manyFromString(componentObjects);
  }

  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  await HooksManagerInstance.triggerHook(PRE_RECEIVE_OBJECTS, { path, componentObjects }, headers);
  const scope = await loadScope(path);
  // @todo: remove this once v15 is out.
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  const clientIsOld = Boolean(headers && headers.version && isClientHasVersionBefore('14.1.1', headers.version));
  const componentsBitIds: BitIds = await exportManyBareScope(scope, componentObjects, clientIsOld);
  const componentsIds: string[] = componentsBitIds.map(id => id.toString());
  let uniqComponentsIds = componentsIds;
  if (componentsIds && componentsIds.length) {
    uniqComponentsIds = R.uniq(componentsIds);
  }
  await HooksManagerInstance.triggerHook(
    POST_RECEIVE_OBJECTS,
    {
      componentObjects,
      componentsIds: uniqComponentsIds,
      scopePath: path,
      scopeName: scope.scopeJson.name
    },
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    headers
  );
  return componentsIds;
});
