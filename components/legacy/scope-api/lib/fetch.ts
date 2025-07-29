import { Readable } from 'stream';
import Queue from 'p-queue';
import { ComponentIdList } from '@teambit/component-id';
import semver from 'semver';
import { LaneId } from '@teambit/lane-id';
import { LATEST_BIT_VERSION } from '@teambit/legacy.constants';
import { logger } from '@teambit/legacy.logger';
import { loadScope, Scope } from '@teambit/legacy.scope';
import { Lane, LaneHistory, Ref, ComponentWithCollectOptions, ObjectsReadableGenerator } from '@teambit/objects';
import { LaneNotFound } from './exceptions/lane-not-found';

/**
 * 'component-delta' is not supported anymore in fetchSchema of 0.0.3 and above.
 */
export type FETCH_TYPE = 'component' | 'lane' | 'object' | 'component-delta';
export type FETCH_OPTIONS = {
  type: FETCH_TYPE;
  /**
   * @deprecated (since 0.0.900) use includeDependencies
   * since 0.1.53 this is ignored from the remotes.
   * it'll be safe to delete this prop once all remotes are updated to 0.1.53 or above.
   * otherwise, in absence of this prop, the remotes will fetch with deps.
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
   * having all Version objects locally. default - false.
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

  /**
   * introduced in fetchSchema 0.0.3
   * this was previously achieved by "component-delta" fetch-type, which is not supported since fetch-schema 0.0.3.
   * normally, when passing ids with versions, the client request that version from the remote.
   * if this option is enabled, it tells the remote that the given version exists already on the client, and if  this
   * version is the head on the remote, then, no need to return anything because the client is up to date already.
   * this is an optimization for the most commonly used case of "bit import", where most components are up-to-date.
   */
  returnNothingIfGivenVersionExists?: boolean;

  /**
   * relevant when type is "lane". in case the remote has the lane-history object, it'll be returned as well.
   */
  includeLaneHistory?: boolean;

  /**
   * relevant when fetching components from a lane. it tells the remote to include the components in the
   * updateDependents array.
   */
  includeUpdateDependents?: boolean;

  fetchSchema: string;
};

export const CURRENT_FETCH_SCHEMA = '0.0.3';

const openConnections: number[] = [];
const openConnectionsMetadata: { [connectionId: string]: Record<string, any> } = {};
let fetchCounter = 0;

// queues are needed because some fetch-request are very slow, for example, when includeParents is true.
// we don't want multiple of slow requests to block other requests. so we created three queues with different
// concurrency limits and different timeouts.
const fastQueue = new Queue({ concurrency: 50, timeout: 1000 * 60 * 3, throwOnTimeout: true });
const depsQueue = new Queue({ concurrency: 10, timeout: 1000 * 60 * 3, throwOnTimeout: true });
const parentsQueue = new Queue({ concurrency: 3, timeout: 1000 * 60 * 10, throwOnTimeout: true });

parentsQueue.on('add', () => {
  logger.debug(
    `scope.fetch parentsQueue added task for connection [${fetchCounter}], queue pending: ${parentsQueue.size}`
  );
});
depsQueue.on('add', () => {
  logger.debug(`scope.fetch depsQueue added task for connection [${fetchCounter}], queue pending: ${depsQueue.size}`);
});
fastQueue.on('add', () => {
  logger.debug(`scope.fetch fastQueue added task for connection [${fetchCounter}], queue pending: ${fastQueue.size}`);
});

export async function fetch(
  path: string,
  ids: string[], // ids type are determined by the fetchOptions.type
  fetchOptions: FETCH_OPTIONS,
  headers?: Record<string, any> | null | undefined
): Promise<Readable> {
  fetchCounter += 1;
  const currentFetch = fetchCounter;
  openConnections.push(currentFetch);
  const startTime = new Date().getTime();

  const logIds = ids.length < 10 ? `\nids: ${ids.join(', ')}` : '';
  logger.debug(
    `scope.fetch [${currentFetch}] started.
path ${path}.
open connections: [${openConnections.join(', ')}]. (total ${openConnections.length}).
memory usage: ${getMemoryUsageInMB()} MB.
total ids: ${ids.length}.${logIds}
queues: fastQueue ${fastQueue.size} pending, depsQueue ${depsQueue.size} pending, parentsQueue ${
      parentsQueue.size
    } pending.
fetchOptions`,
    fetchOptions
  );
  const dateNow = new Date().toISOString().split('.')[0];
  openConnectionsMetadata[currentFetch] = {
    started: dateNow,
    ids,
    fetchOptions,
    headers,
  };
  logger.trace(
    `DEBUG-CONNECTIONS: Date now: ${dateNow}. Connections:\n${JSON.stringify(openConnectionsMetadata, null, 2)}`
  );

  if (!fetchOptions.type) fetchOptions.type = 'component'; // for backward compatibility
  if (fetchOptions.returnNothingIfGivenVersionExists) {
    fetchOptions.type = 'component-delta';
  }
  const fetchSchema = fetchOptions.fetchSchema || '0.0.1';
  const clientSupportsVersionHistory = semver.gte(fetchSchema, '0.0.2');

  // it should be safe to use the cached scope. when fetching without deps, there is no risk as it
  // just fetches local objects. when fetching with deps, there is a lock mechanism that allows
  // only one fetch at a time. the reason for not creating a new scope instance here is the high
  // memory consumption it causes as it caches many objects in-memory.
  const useCachedScope = true;
  const scope: Scope = await loadScope(path, useCachedScope);
  const finishLog = (err?: Error) => {
    const duration = new Date().getTime() - startTime;
    openConnections.splice(openConnections.indexOf(currentFetch), 1);
    delete openConnectionsMetadata[currentFetch];
    const successOrErr = `${err ? 'with errors' : 'successfully'}`;
    logger.debug(`scope.fetch [${currentFetch}] completed ${successOrErr}.
open connections: [${openConnections.join(', ')}]. (total ${openConnections.length}).
memory usage: ${getMemoryUsageInMB()} MB.
took: ${duration} ms.`);
  };
  const objectsReadableGenerator = new ObjectsReadableGenerator(scope.objects, finishLog);

  try {
    await fetchByType(fetchOptions, ids, clientSupportsVersionHistory, scope, objectsReadableGenerator);
  } catch (err: any) {
    finishLog(err);
    throw err;
  }
  logger.debug('scope.fetch returns readable');
  return objectsReadableGenerator.readable;
}

async function fetchByType(
  fetchOptions: FETCH_OPTIONS,
  ids: string[],
  clientSupportsVersionHistory: boolean,
  scope: Scope,
  objectsReadableGenerator: ObjectsReadableGenerator
): Promise<void> {
  const shouldFetchDependencies = () => {
    return fetchOptions.includeDependencies;
  };
  const catchTimeoutErr = (err: Error) => {
    const error = err.name === 'TimeoutError' ? new Error(`fetch timed out`) : err;
    objectsReadableGenerator.readable.destroy(error);
  };
  switch (fetchOptions.type) {
    case 'component': {
      const bitIds: ComponentIdList = ComponentIdList.fromStringArray(ids);
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
        const laneIds = fetchOptions.includeUpdateDependents
          ? lane.toComponentIdsIncludeUpdateDependents()
          : lane.toComponentIds();
        return ComponentIdList.fromArray(
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
      const getQueue = () => {
        if (componentsWithOptions.length === 1) return fastQueue;
        if (collectParents) return parentsQueue;
        if (shouldFetchDependencies()) return depsQueue;
        return fastQueue;
      };
      const queue = getQueue();
      queue
        .add(async () => objectsReadableGenerator.pushObjectsToReadable(componentsWithOptions))
        .catch(catchTimeoutErr);
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
      const bitIdsWithHashToStop: ComponentIdList = ComponentIdList.fromStringArray(ids);
      const scopeComponentsImporter = scope.scopeImporter;
      const laneId = fetchOptions.laneId ? LaneId.parse(fetchOptions.laneId) : null;
      const lane = laneId ? await scope.loadLane(laneId) : undefined;
      const bitIdsLatest = bitIdsToLatest(bitIdsWithHashToStop, fetchOptions, lane);
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
      const isSlow = componentsWithOptions.length > 1 && (shouldCollectParents() || shouldFetchDependencies());
      const queue = isSlow ? parentsQueue : fastQueue;
      queue
        .add(async () => objectsReadableGenerator.pushObjectsToReadable(componentsWithOptions))
        .catch(catchTimeoutErr);
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
      const lanesHistory: LaneHistory[] = [];
      if (fetchOptions.includeLaneHistory) {
        const laneHistoryPromises = lanesToFetch.map(async (laneToFetch) => {
          const laneHistory = await scope.lanes.getOrCreateLaneHistory(laneToFetch);
          return laneHistory;
        });
        lanesHistory.push(...(await Promise.all(laneHistoryPromises)));
      }
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      objectsReadableGenerator.pushLanes(lanesToFetch, lanesHistory);
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
}

function bitIdsToLatest(bitIds: ComponentIdList, fetchOptions: FETCH_OPTIONS, lane?: Lane) {
  if (!lane) {
    return bitIds.toVersionLatest();
  }
  const laneIds = fetchOptions.includeUpdateDependents
    ? lane.toComponentIdsIncludeUpdateDependents()
    : lane.toComponentIds();
  return ComponentIdList.fromArray(
    bitIds.map((bitId) => {
      const inLane = laneIds.searchWithoutVersion(bitId);
      return inLane || bitId.changeVersion(LATEST_BIT_VERSION);
    })
  );
}

function getMemoryUsageInMB(): number {
  const used = process.memoryUsage().heapUsed / (1024 * 1024);
  return Math.round(used * 100) / 100;
}
