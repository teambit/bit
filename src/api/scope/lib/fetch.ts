import { loadScope, Scope } from '../../../scope';
import { BitIds } from '../../../bit-id';
import { PRE_SEND_OBJECTS, POST_SEND_OBJECTS } from '../../../constants';
import HooksManager from '../../../hooks';
// import logger from '../../../logger/logger';
import ScopeComponentsImporter from '../../../scope/component-ops/scope-components-importer';
import ComponentObjects from '../../../scope/component-objects';

const HooksManagerInstance = HooksManager.getInstance();

export default (async function fetch(
  path: string,
  ids: string[],
  noDependencies = false,
  headers: Record<string, any> | null | undefined
): Promise<ComponentObjects[]> {
  const bitIds: BitIds = BitIds.deserialize(ids);

  const args = { path, bitIds, noDependencies };
  // This might be undefined in case of fork process like during bit test command
  if (HooksManagerInstance) {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    HooksManagerInstance.triggerHook(PRE_SEND_OBJECTS, args, headers);
  }
  const scope: Scope = await loadScope(path);
  const scopeComponentsImporter = ScopeComponentsImporter.getInstance(scope);
  const importedComponents = noDependencies
    ? await scopeComponentsImporter.importManyWithoutDependencies(bitIds, false)
    : await scopeComponentsImporter.importMany(bitIds);
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  const clientVersion = headers ? headers.version : null;

  const componentObjects = await scopeComponentsImporter.componentsToComponentsObjects(
    importedComponents,
    clientVersion
  );
  if (HooksManagerInstance) {
    await HooksManagerInstance.triggerHook(
      POST_SEND_OBJECTS,
      {
        componentObjects,
        scopePath: path,
        componentsIds: bitIds.serialize(),
        scopeName: scope.scopeJson.name
      },
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      headers
    );
  }
  return componentObjects;
});
