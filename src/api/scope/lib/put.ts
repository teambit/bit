import R from 'ramda';
import { loadScope } from '../../../scope';
import { PRE_RECEIVE_OBJECTS, POST_RECEIVE_OBJECTS } from '../../../constants';
import HooksManager from '../../../hooks';
import { exportManyBareScope } from '../../../scope/component-ops/export-scope-components';
import BitIds from '../../../bit-id/bit-ids';
import { isClientHasVersionBefore } from '../../../scope/network/check-version-compatibility';
import CompsAndLanesObjects from '../../../scope/comps-and-lanes-objects';

const HooksManagerInstance = HooksManager.getInstance();

export type ComponentObjectsInput = {
  path: string;
  compsAndLanesObjects: string | CompsAndLanesObjects;
};

export default (async function put(
  { path, compsAndLanesObjects }: ComponentObjectsInput,
  headers: Record<string, any>
): Promise<string[]> {
  if (typeof compsAndLanesObjects === 'string') {
    compsAndLanesObjects = CompsAndLanesObjects.fromString(compsAndLanesObjects);
  }

  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  await HooksManagerInstance.triggerHook(
    PRE_RECEIVE_OBJECTS,
    { path, componentObjects: compsAndLanesObjects.componentsObjects },
    headers
  );
  const scope = await loadScope(path);
  // @todo: remove this once v15 is out.
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  const clientIsOld = Boolean(headers && headers.version && isClientHasVersionBefore('14.1.1', headers.version));
  const componentsBitIds: BitIds = await exportManyBareScope(
    scope,
    compsAndLanesObjects.componentsObjects,
    clientIsOld,
    compsAndLanesObjects.laneObjects
  );
  const componentsIds: string[] = componentsBitIds.map((id) => id.toString());
  let uniqComponentsIds = componentsIds;
  if (componentsIds && componentsIds.length) {
    uniqComponentsIds = R.uniq(componentsIds);
  }
  await HooksManagerInstance.triggerHook(
    POST_RECEIVE_OBJECTS,
    {
      componentObjects: compsAndLanesObjects.componentsObjects,
      componentsIds: uniqComponentsIds,
      scopePath: path,
      scopeName: scope.scopeJson.name,
    },
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    headers
  );
  return componentsIds;
});
