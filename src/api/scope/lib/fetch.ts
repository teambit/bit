import { Readable } from 'stream';
import { BitIds } from '../../../bit-id';
import { POST_SEND_OBJECTS, PRE_SEND_OBJECTS } from '../../../constants';
import HooksManager from '../../../hooks';
import { RemoteLaneId } from '../../../lane-id/lane-id';
import logger from '../../../logger/logger';
import { loadScope, Scope } from '../../../scope';
import ScopeComponentsImporter from '../../../scope/component-ops/scope-components-importer';
import { Ref } from '../../../scope/objects';
import { ObjectList } from '../../../scope/objects/object-list';
import {
  ComponentWithCollectOptions,
  ObjectsReadableGenerator,
} from '../../../scope/objects/objects-readable-generator';

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
): Promise<Readable> {
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
  const objectsReadableGenerator = new ObjectsReadableGenerator(scope.objects);
  switch (fetchOptions.type) {
    case 'component': {
      const bitIds: BitIds = BitIds.deserialize(ids);
      const { withoutDependencies, includeArtifacts } = fetchOptions;
      const collectParents = !withoutDependencies;
      const scopeComponentsImporter = ScopeComponentsImporter.getInstance(scope);
      const getComponentsWithOptions = async (): Promise<ComponentWithCollectOptions[]> => {
        if (withoutDependencies) {
          const componentsVersions = await scopeComponentsImporter.fetchWithoutDeps(bitIds);
          return componentsVersions.map((compVersion) => ({
            component: compVersion.component,
            version: compVersion.version,
            collectArtifacts: includeArtifacts,
            collectParents,
          }));
        }
        const versionsDependencies = await scopeComponentsImporter.fetchWithDeps(bitIds);
        return versionsDependencies
          .map((versionDep) => [
            {
              component: versionDep.component.component,
              version: versionDep.component.version,
              collectArtifacts: includeArtifacts,
              collectParents,
            },
            ...versionDep.allDependencies.map((verDep) => ({
              component: verDep.component,
              version: verDep.version,
              collectArtifacts: includeArtifacts,
              collectParents: false, // for dependencies, no need to traverse the entire history
            })),
          ])
          .flat();
      };
      const componentsWithOptions = await getComponentsWithOptions();
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      objectsReadableGenerator.pushObjectsToReadable(componentsWithOptions);
      break;
    }
    case 'component-delta': {
      const bitIdsWithHashToStop: BitIds = BitIds.deserialize(ids);
      const scopeComponentsImporter = ScopeComponentsImporter.getInstance(scope);
      const bitIdsLatest = bitIdsWithHashToStop.toVersionLatest();
      const importedComponents = await scopeComponentsImporter.fetchWithoutDeps(bitIdsLatest);
      const componentsWithOptions: ComponentWithCollectOptions[] = importedComponents.map((compVersion) => {
        const hashToStop = bitIdsWithHashToStop.searchWithoutVersion(compVersion.id)?.version;
        return {
          component: compVersion.component,
          version: compVersion.version,
          collectArtifacts: fetchOptions.includeArtifacts,
          collectParents: true,
          collectParentsUntil: hashToStop ? Ref.from(hashToStop) : null,
        };
      });
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      objectsReadableGenerator.pushObjectsToReadable(componentsWithOptions);
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
      lanesToFetch.forEach((laneToFetch) => {
        laneToFetch.scope = scope.name;
      });
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      objectsReadableGenerator.pushLanes(lanesToFetch);
      break;
    }
    case 'object': {
      const refs = ids.map((id) => new Ref(id));
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      objectsReadableGenerator.pushObjects(refs, scope);
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
  logger.debug('scope.fetch returns readable');
  return objectsReadableGenerator.readable;
}
