import { Readable } from 'stream';
import semver from 'semver';
import { LaneId } from '@teambit/lane-id';
import { BitIds } from '../../../bit-id';
import { LATEST_BIT_VERSION, POST_SEND_OBJECTS, PRE_SEND_OBJECTS } from '../../../constants';
import HooksManager from '../../../hooks';
import logger from '../../../logger/logger';
import { loadScope, Scope } from '../../../scope';
import { Ref } from '../../../scope/objects';
import { ObjectList } from '../../../scope/objects/object-list';
import {
  ComponentWithCollectOptions,
  ObjectsReadableGenerator,
} from '../../../scope/objects/objects-readable-generator';
import { LaneNotFound } from './exceptions/lane-not-found';
import { Lane } from '../../../scope/models';

export type FETCH_TYPE = 'component' | 'lane' | 'object' | 'component-delta';
export type FETCH_OPTIONS = {
  type: FETCH_TYPE;
  /**
   * @deprecated (since 0.0.900) use includeDependencies
   */
  withoutDependencies?: boolean; // default - true
  includeDependencies?: boolean; // default - false
  includeArtifacts: boolean; // default - false
  allowExternal: boolean; // allow fetching components of other scope from this scope. needed for lanes.
  laneId?: string; // mandatory when fetching "latest" from lane. otherwise, we don't know where to find the latest
  onlyIfBuilt?: boolean; // relevant when fetching with deps. if true, and the component wasn't built successfully, don't fetch it.
  ignoreMissingHead?: boolean; // if asking for id without version and the component has no head, don't throw, just ignore
  /**
   * whether include VersionHistory object to get the snaps graph. it's needed to be able to traverse the snaps without
   * having all Version objects locally
   */
  includeVersionHistory?: boolean;
  /**
   * avoid this when importing to a workspace. mainly needed for communication between scopes.
   * it traverses and sends the entire history.
   */
  collectParents?: boolean;
  /**
   * in case dependencies are needed (includeDependencies=true) and a component was tagged with bit version >= 0.0.907, so then
   * the graph is saved inside the Version object, then don't send all dependencies.
   */
  preferDependencyGraph?: boolean;

  fetchSchema: string;
};

export const CURRENT_FETCH_SCHEMA = '0.0.2';

const HooksManagerInstance = HooksManager.getInstance();

export default async function fetch(
  path: string,
  ids: string[], // ids type are determined by the fetchOptions.type
  fetchOptions: FETCH_OPTIONS,
  headers?: Record<string, any> | null | undefined
): Promise<Readable> {
  logger.debug(`scope.fetch started, path ${path}, fetchOptions`, fetchOptions);
  if (!fetchOptions.type) fetchOptions.type = 'component'; // for backward compatibility
  const args = { path, ids, ...fetchOptions };
  // This might be undefined in case of fork process like during bit test command
  if (HooksManagerInstance) {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    HooksManagerInstance.triggerHook(PRE_SEND_OBJECTS, args, headers);
  }
  const fetchSchema = fetchOptions.fetchSchema || '0.0.1';
  const clientSupportsVersionHistory = semver.gte(fetchSchema, '0.0.2');

  // it should be safe to use the cached scope. when fetching without deps, there is no risk as it
  // just fetches local objects. when fetching with deps, there is a lock mechanism that allows
  // only one fetch at a time. the reason for not creating a new scope instance here is the high
  // memory consumption it causes as it caches many objects in-memory.
  const useCachedScope = true;
  const scope: Scope = await loadScope(path, useCachedScope);
  const objectList = new ObjectList();
  const objectsReadableGenerator = new ObjectsReadableGenerator(scope.objects);
  const shouldFetchDependencies = () => {
    if (fetchOptions.includeDependencies) return true;
    // backward compatible before 0.0.900
    return !fetchOptions.withoutDependencies;
  };
  switch (fetchOptions.type) {
    case 'component': {
      const bitIds: BitIds = BitIds.deserialize(ids);
      const shouldCollectParents = () => {
        if (clientSupportsVersionHistory) {
          return Boolean(fetchOptions.collectParents);
        }
        // backward compatible before 0.0.900 - we used to conclude whether the parents need to be collected based on the need for dependencies
        return !fetchOptions.withoutDependencies;
      };
      const { includeArtifacts, allowExternal } = fetchOptions;
      const collectParents = shouldCollectParents();

      // important! don't create a new instance of ScopeComponentImporter. Otherwise, the Mutex will be created
      // every request, and won't do anything.
      const scopeComponentsImporter = scope.scopeImporter;

      const laneId = fetchOptions.laneId ? LaneId.parse(fetchOptions.laneId) : null;
      const lane = laneId ? await scope.loadLane(laneId) : null;

      const getBitIds = () => {
        if (!lane) return bitIds;
        const laneIds = lane.toBitIds();
        return BitIds.fromArray(
          bitIds.map((bitId) => {
            if (bitId.hasVersion()) return bitId;
            // when the client asks for bitId without version and it's on the lane, we need the latest from the lane, not main
            const inLane = laneIds.searchWithoutVersion(bitId);
            return inLane || bitId;
          })
        );
      };
      const bitIdsToFetch = getBitIds();

      const getComponentsWithOptions = async (): Promise<ComponentWithCollectOptions[]> => {
        if (shouldFetchDependencies()) {
          const versionsDependencies = await scopeComponentsImporter.fetchWithDeps(
            bitIdsToFetch,
            allowExternal,
            fetchOptions
          );
          const flatDeps = versionsDependencies
            .map((versionDep) => [
              {
                component: versionDep.component.component,
                version: versionDep.component.version,
                collectArtifacts: includeArtifacts,
                collectParents,
                includeVersionHistory: fetchOptions.includeVersionHistory,
              },
              ...versionDep.allDependencies.map((verDep) => ({
                component: verDep.component,
                version: verDep.version,
                collectArtifacts: includeArtifacts,
                collectParents: false, // for dependencies, no need to traverse the entire history
              })),
            ])
            .flat()
            .reduce((uniqueDeps, dep) => {
              const key = `${dep.component.id()}@${dep.version}`;
              if (!uniqueDeps[key] || (!uniqueDeps[key].collectParents && dep.collectParents)) {
                uniqueDeps[key] = dep;
              }
              return uniqueDeps;
            }, {});
          return Object.values(flatDeps);
        }

        const componentsVersions = await scopeComponentsImporter.fetchWithoutDeps(
          bitIdsToFetch,
          allowExternal,
          fetchOptions.ignoreMissingHead
        );
        return componentsVersions.map((compVersion) => ({
          component: compVersion.component,
          version: compVersion.version,
          collectArtifacts: includeArtifacts,
          collectParents,
          includeVersionHistory: fetchOptions.includeVersionHistory,
        }));
      };
      const componentsWithOptions = await getComponentsWithOptions();
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      objectsReadableGenerator.pushObjectsToReadable(componentsWithOptions);
      break;
    }
    case 'component-delta': {
      const shouldCollectParents = () => {
        if (clientSupportsVersionHistory) {
          return Boolean(fetchOptions.collectParents);
        }
        // backward compatible before 0.0.900 - it was always true
        return true;
      };
      const bitIdsWithHashToStop: BitIds = BitIds.deserialize(ids);
      const scopeComponentsImporter = scope.scopeImporter;
      const laneId = fetchOptions.laneId ? LaneId.parse(fetchOptions.laneId) : null;
      const lane = laneId ? await scope.loadLane(laneId) : null;
      const bitIdsLatest = bitIdsToLatest(bitIdsWithHashToStop, lane);
      const importedComponents = await scopeComponentsImporter.fetchWithoutDeps(
        bitIdsLatest,
        fetchOptions.allowExternal,
        fetchOptions.ignoreMissingHead
      );
      const componentsWithOptions: ComponentWithCollectOptions[] = importedComponents.map((compVersion) => {
        const hashToStop = bitIdsWithHashToStop.searchWithoutVersion(compVersion.id)?.version;
        return {
          component: compVersion.component,
          version: compVersion.version,
          collectArtifacts: fetchOptions.includeArtifacts,
          collectParents: shouldCollectParents(),
          lane,
          includeVersionHistory: fetchOptions.includeVersionHistory,
          collectParentsUntil: hashToStop ? Ref.from(hashToStop) : null,
        };
      });
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      objectsReadableGenerator.pushObjectsToReadable(componentsWithOptions);
      break;
    }
    case 'lane': {
      const laneIds: LaneId[] = ids.map((id) => LaneId.parse(id));
      const lanes = await scope.listLanes();
      const lanesToFetch = laneIds.map((laneId) => {
        const laneToFetch = lanes.find((lane) => lane.name === laneId.name);
        if (!laneToFetch) {
          throw new LaneNotFound(scope.name, laneId.name);
        }
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

function bitIdsToLatest(bitIds: BitIds, lane: Lane | null) {
  if (!lane) {
    return bitIds.toVersionLatest();
  }
  const laneIds = lane.toBitIds();
  return BitIds.fromArray(
    bitIds.map((bitId) => {
      const inLane = laneIds.searchWithoutVersion(bitId);
      return inLane || bitId.changeVersion(LATEST_BIT_VERSION);
    })
  );
}
