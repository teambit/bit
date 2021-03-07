import mapSeries from 'p-map-series';
import { flatten } from 'lodash';
import { BitIds } from '../../../bit-id';
import { POST_SEND_OBJECTS, PRE_SEND_OBJECTS } from '../../../constants';
import HooksManager from '../../../hooks';
import { RemoteLaneId } from '../../../lane-id/lane-id';
import logger from '../../../logger/logger';
import { loadScope, Scope } from '../../../scope';
// import logger from '../../../logger/logger';
import ScopeComponentsImporter from '../../../scope/component-ops/scope-components-importer';
import { CollectObjectsOpts } from '../../../scope/component-version';
import { Ref } from '../../../scope/objects';
import { ObjectList, ObjectItem } from '../../../scope/objects/object-list';

export type FETCH_TYPE = 'component' | 'lane' | 'object' | 'component-delta';
export type FETCH_OPTIONS = {
  type: FETCH_TYPE;
  withoutDependencies: boolean;
  includeArtifacts: boolean;
};

const HooksManagerInstance = HooksManager.getInstance();

export default async function fetch(
  path: string,
  ids: string[], // ids type are determined by the fetchOptions.type
  fetchOptions: FETCH_OPTIONS,
  headers?: Record<string, any> | null | undefined
): Promise<ObjectList> {
  logger.debug(`scope.fetch started, path ${path}, options`, fetchOptions);
  if (!fetchOptions.type) fetchOptions.type = 'component'; // for backward compatibility
  const args = { path, ids, ...fetchOptions };
  // This might be undefined in case of fork process like during bit test command
  if (HooksManagerInstance) {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    HooksManagerInstance.triggerHook(PRE_SEND_OBJECTS, args, headers);
  }
  // it should be safe to use the cached scope. when fetching without deps, there is no risk as it
  // just fetches local objects. when fetching with deps, there is a lock mechanism that allows
  // only one fetch at a time. the reason for not creating a new scope instance here is the high
  // memory consumption it causes as it caches many objects in-memory.
  const useCachedScope = true;
  const scope: Scope = await loadScope(path, useCachedScope);
  const objectList = new ObjectList();
  switch (fetchOptions.type) {
    case 'component': {
      const bitIds: BitIds = BitIds.deserialize(ids);
      const { withoutDependencies, includeArtifacts } = fetchOptions;
      const scopeComponentsImporter = ScopeComponentsImporter.getInstance(scope);
      const importedComponents = withoutDependencies
        ? await scopeComponentsImporter.fetchWithoutDeps(bitIds)
        : await scopeComponentsImporter.fetchWithDeps(bitIds);
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      const clientVersion = headers ? headers.version : null;
      const collectParents = !withoutDependencies;
      const componentObjects = await scopeComponentsImporter.componentsToComponentsObjects(
        importedComponents,
        clientVersion,
        collectParents,
        includeArtifacts
      );
      objectList.addIfNotExist(componentObjects);
      break;
    }
    case 'component-delta': {
      const bitIdsWithHashToStop: BitIds = BitIds.deserialize(ids);
      const scopeComponentsImporter = ScopeComponentsImporter.getInstance(scope);
      const bitIdsLatest = bitIdsWithHashToStop.toVersionLatest();
      const importedComponents = await scopeComponentsImporter.fetchWithoutDeps(bitIdsLatest);
      const options: CollectObjectsOpts = {
        collectParents: true,
        collectArtifacts: fetchOptions.includeArtifacts,
      };
      const clientVersion = headers ? headers.version : null;
      const allObjects = await mapSeries(importedComponents, (component) => {
        const hashToStop = bitIdsWithHashToStop.searchWithoutVersion(component.id)?.version;
        options.collectParentsUntil = hashToStop ? Ref.from(hashToStop) : null;
        return component.collectObjects(scope.objects, clientVersion, options);
      });
      objectList.addIfNotExist(flatten(allObjects));
      break;
    }
    case 'lane': {
      const laneIds: RemoteLaneId[] = ids.map((id) => RemoteLaneId.parse(id));
      const lanes = await scope.listLanes();
      const lanesToFetch = laneIds.map((laneId) => {
        const laneToFetch = lanes.find((lane) => lane.name === laneId.name);
        // @todo: throw LaneNotFound, make sure it shows correctly on the client using ssh
        if (!laneToFetch) throw new Error(`lane ${laneId.name} was not found in scope ${scope.name}`);
        return laneToFetch;
      });
      const lanesObjects: ObjectItem[] = await Promise.all(
        lanesToFetch.map(async (laneToFetch) => {
          laneToFetch.scope = scope.name;
          const laneBuffer = await laneToFetch.compress();
          return { ref: laneToFetch.hash(), buffer: laneBuffer };
        })
      );
      objectList.addIfNotExist(lanesObjects);
      break;
    }
    case 'object': {
      const refs = ids.map((id) => new Ref(id));
      const objectsItems = await scope.getObjectItems(refs);
      objectList.addIfNotExist(objectsItems);
      break;
    }
    default:
      throw new Error(`type ${fetchOptions.type} was not implemented`);
  }

  if (HooksManagerInstance) {
    await HooksManagerInstance.triggerHook(
      POST_SEND_OBJECTS,
      {
        objectList,
        scopePath: path,
        ids,
        scopeName: scope.scopeJson.name,
      },
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      headers
    );
  }
  logger.debug('scope.fetch completed');
  return objectList;
}
