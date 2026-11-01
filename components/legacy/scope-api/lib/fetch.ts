import type { Readable } from 'stream';
import Queue from 'p-queue';
import { omit } from 'lodash';
import { ComponentIdList } from '@teambit/component-id';
import semver from 'semver';
import { isHash } from '@teambit/component-version';
import { LaneId } from '@teambit/lane-id';
import { LATEST_BIT_VERSION } from '@teambit/legacy.constants';
import { logger } from '@teambit/legacy.logger';
import type { Scope, FETCH_OPTIONS } from '@teambit/legacy.scope';
import { loadScope, LaneNotFound } from '@teambit/legacy.scope';
import type { Lane, LaneHistory, ComponentWithCollectOptions } from '@teambit/objects';
import { Ref, ObjectsReadableGenerator } from '@teambit/objects';

export type { FETCH_TYPE, FETCH_OPTIONS } from '@teambit/legacy.scope';

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
  // Strip authorization/cookie before storing — this metadata gets serialized into trace logs.
  const redactedHeaders = headers ? omit(headers, ['authorization', 'cookie']) : headers;
  openConnectionsMetadata[currentFetch] = {
    started: dateNow,
    ids,
    fetchOptions,
    headers: redactedHeaders,
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
      // ids here are raw object hashes from the client. validate before constructing Refs because
      // Ref.hash is later joined into a filesystem path (Repository.objectPath) and a malformed
      // hash containing path-traversal segments would escape the objects dir on fs.readFile.
      for (const id of ids) {
        if (!isHash(id)) throw new Error(`invalid object ref: ${JSON.stringify(id)}`);
      }
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
