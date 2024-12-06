import { filter } from 'bluebird';
import { ComponentID, ComponentIdList } from '@teambit/component-id';
import { Mutex, withTimeout } from 'async-mutex';
import mapSeries from 'p-map-series';
import { DEFAULT_LANE, LaneId } from '@teambit/lane-id';
import { BitError } from '@teambit/bit-error';
import groupArray from 'group-array';
import R from 'ramda';
import { CLOUD_IMPORTER, CLOUD_IMPORTER_V2, isFeatureEnabled } from '@teambit/harmony.modules.feature-toggle';
import { compact, flatten, partition, uniq } from 'lodash';
import { Scope } from '..';
import { ConsumerComponent } from '@teambit/legacy.consumer-component';
import logger from '../../logger/logger';
import ComponentVersion from '../component-version';
import { ComponentNotFound, HeadNotFound, ParentNotFound, VersionNotFound } from '../exceptions';
import { Lane, ModelComponent, Version, VersionHistory } from '../models';
import { Ref, Repository } from '../objects';
import { ObjectItemsStream, ObjectList } from '../objects/object-list';
import SourcesRepository, { ComponentDef } from '../repositories/sources';
import { Remotes, getScopeRemotes } from '@teambit/scope.remotes';
import VersionDependencies from '../version-dependencies';
import { BitObjectList } from '@teambit/scope.objects';
import { ObjectFetcher } from '../objects-fetcher/objects-fetcher';
import { pMapPool } from '@teambit/toolbox.promise.map-pool';
import { concurrentComponentsLimit } from '@teambit/harmony.modules.concurrency';
import { BuildStatus } from '../../constants';
import { NoHeadNoVersion } from '../exceptions/no-head-no-version';
import { HashesPerRemotes, MissingObjects } from '../exceptions/missing-objects';
import { getAllVersionHashes } from './traverse-versions';
import { FETCH_OPTIONS } from '@teambit/legacy.scope-api';

type HashesPerRemote = { [remoteName: string]: string[] };

const TIMEOUT_FOR_MUTEX = 5 * 60 * 1000; // 5 minutes

/**
 * Helper to import objects/components from remotes.
 * this class is singleton because it uses Mutex to ensure that the same objects are not fetched and written at the same time.
 * (if this won't be a singleton, then the mutex will be created for each instance, hence, one instance won't lock the other one).
 */
export default class ScopeComponentsImporter {
  private static instancePerScope: { [scopeName: string]: ScopeComponentsImporter } = {};
  private sources: SourcesRepository;
  private repo: Repository;
  private fetchWithDepsMutex = withTimeout(
    new Mutex(),
    TIMEOUT_FOR_MUTEX,
    new BitError(`error: fetch-with-dependencies timeout exceeded (${TIMEOUT_FOR_MUTEX} minutes)`)
  );
  private importManyObjectsMutex = withTimeout(
    new Mutex(),
    TIMEOUT_FOR_MUTEX,
    new BitError(`error: fetch-multiple-objects timeout exceeded (${TIMEOUT_FOR_MUTEX} minutes)`)
  );
  /**
   * important!
   * refrain from using this. it's a workaround for bare-scopes to import from the lane when the call is
   * very deep in the stack and is hard to pass the lane object.
   * this can be an issue in case we deliberately want to fetch from main.
   * (especially when "importer" is not used, because the importer has a fallback to go to the main scope).
   */
  shouldOnlyFetchFromCurrentLane = false;
  private constructor(private scope: Scope) {
    if (!scope) throw new Error('unable to instantiate ScopeComponentsImporter without Scope');
    this.sources = scope.sources;
    this.repo = scope.objects;
  }

  static getInstance(scope: Scope): ScopeComponentsImporter {
    if (!this.instancePerScope[scope.name]) {
      this.instancePerScope[scope.name] = new ScopeComponentsImporter(scope);
    }
    return this.instancePerScope[scope.name];
  }

  /**
   * todo: rename to importWithDeps
   *
   * ensure the given ids and their dependencies are in the scope.
   * if they belong to this scope and are not exist, throw ComponentNotFound.
   * if they are external, fetch them from their remotes by calling this.getExternalMany(), which
   * fetches these components and all their flattened dependencies.
   *
   * keep in mind that as a rule, an indirect dependency should be fetched from its dependent
   * remote first and not from its original scope because it might not be available anymore in the
   * original scope but it must be available in the dependent scope.
   * to ensure we ask getExternalMany for the direct dependency only, the following is done for
   * each one of the components:
   * 1. get the component object.
   * 1.a. If It's a local component and not exists, throw ComponentNotFound.
   * 1.b. If it's an external component and not exists, put it in the externalsToFetch array.
   * 2. If all flattened exist locally - exit.
   * 3. otherwise, go to each one of the direct dependencies and do the following:
   * 3. a. Load the component. (Again, if it's local and not found, throw. Otherwise, put it in the externalsToFetch array).
   * 3. b. If all flattened exists locally - exit the loop.
   * 3. c. otherwise, put it in the externalsToFetch array.
   */
  async importMany({
    ids,
    cache = true,
    throwForDependencyNotFound = false,
    throwForSeederNotFound = true,
    reFetchUnBuiltVersion = true,
    lane,
    ignoreMissingHead = false,
    preferDependencyGraph = true,
    includeUnexported = false,
    includeUpdateDependents = false,
    reason,
  }: {
    ids: ComponentIdList;
    cache?: boolean;
    throwForDependencyNotFound?: boolean;
    throwForSeederNotFound?: boolean; // in some cases, the "ids" params are not seeders but deps, e.g. in buildGraphFromFS.
    reFetchUnBuiltVersion?: boolean;
    lane?: Lane; // if ids coming from a lane, add the lane object so we could fetch these ids from the lane's remote
    ignoreMissingHead?: boolean; // needed when fetching "main" objects when on a lane
    preferDependencyGraph?: boolean; // if an external is missing and the remote has it with the dependency graph, don't fetch all its dependencies
    includeUnexported?: boolean; // whether filter out new component-ids that were not exported yet (default), or not (for cases we want to fix out-of-sync scenarios)
    includeUpdateDependents?: boolean; // whether to include the updateDependents components on a lane
    reason?: string; // reason why this import is needed
  }): Promise<VersionDependencies[]> {
    if (!ids.length) return [];
    logger.debug(
      `importMany, cache ${cache}, preferDependencyGraph: ${preferDependencyGraph}, reFetchUnBuiltVersion: ${reFetchUnBuiltVersion}, throwForDependencyNotFound: ${throwForDependencyNotFound}. ids: ${ids.toString()}, lane: ${lane?.id()}`
    );
    const idsToImport = compact(ids.filter((id) => (includeUnexported ? id.hasScope() : this.scope.isExported(id))));
    if (R.isEmpty(idsToImport)) {
      logger.debug(`importMany, nothing to import`);
      return [];
    }

    const externalsToFetch: ComponentID[] = [];

    const compDefs = await this.sources.getMany(idsToImport, reFetchUnBuiltVersion);
    const checkForIncompleteHistory: ComponentDef[] = [];
    const existingDefs = compDefs.filter(({ id, component }) => {
      if (this.scope.isLocal(id)) {
        if (!component) throw new ComponentNotFound(id.toString());
        return true;
      }
      if (cache && component) {
        checkForIncompleteHistory.push({ id, component });
        return true;
      }
      externalsToFetch.push(id);
      return false;
    });

    const shouldRefetchIncompleteHistory = process.env.BIT_FETCH_INCOMPLETE_VERSION_HISTORY;

    let incompleteVersionHistory: ComponentID[] = [];
    if (shouldRefetchIncompleteHistory) {
      incompleteVersionHistory = await this.getIncompleteVersionHistory(checkForIncompleteHistory);
      externalsToFetch.push(...incompleteVersionHistory);
    }

    await this.findMissingExternalsRecursively(
      existingDefs,
      externalsToFetch,
      ignoreMissingHead,
      reFetchUnBuiltVersion,
      preferDependencyGraph
    );
    const uniqExternals = ComponentIdList.uniqFromArray(externalsToFetch);
    logger.debug('importMany', `total missing externals: ${uniqExternals.length}`);
    const remotes = await getScopeRemotes(this.scope);
    // we don't care about the VersionDeps returned here as it may belong to the dependencies
    await this.getExternalMany(uniqExternals, remotes, {
      throwForDependencyNotFound,
      lane,
      throwOnUnavailableScope: throwForSeederNotFound,
      preferDependencyGraph,
      includeUnexported,
      includeUpdateDependents,
      reason,
    });

    if (shouldRefetchIncompleteHistory) {
      await this.warnForIncompleteVersionHistory(incompleteVersionHistory);
    }

    const versionDeps = await this.bitIdsToVersionDeps(idsToImport, throwForSeederNotFound, preferDependencyGraph);
    logger.debug('importMany, completed!');
    return versionDeps;
  }

  private async warnForIncompleteVersionHistory(bitIds: ComponentID[]) {
    const defs = await this.sources.getMany(bitIds);
    const stillIncomplete = await this.getIncompleteVersionHistory(defs);
    if (!stillIncomplete.length) return;
    const ids = stillIncomplete.map((id) => id.toString());
    const msg = `${ids.length} components still have incomplete version-history after importing them from the remote`;
    logger.error(`the following ${msg}\n${ids.join('\n')}`);
    // for now remove this console, until we know better when this is not an error
    // logger.console(`warning: ${msg}, see the debug.log for their ids`, 'warn', 'yellow');
  }

  private async getIncompleteVersionHistory(existingDefs: ComponentDef[]) {
    const incompleteVersionHistory: ComponentID[] = [];
    logger.profile(`getIncompleteVersionHistory`); // temporarily here to see how if affects the performance
    const changedVersionHistory: VersionHistory[] = [];
    await pMapPool(
      existingDefs,
      async ({ id, component }) => {
        if (this.scope.isLocal(id)) return;
        if (!id.hasVersion()) return;
        if (!component)
          throw new Error(`importMany, a component for ${id.toString()} is needed for version-history validation`);
        const versionHistory = await component.getVersionHistory(this.repo);
        if (versionHistory.isEmpty()) return;
        const ref = component.getRef(id.version as string);
        if (!ref) throw new Error(`importMany, a ref for ${id.toString()} is needed for version-history validation`);
        const isComplete = versionHistory.isGraphCompleteSince(ref);
        if (!isComplete) {
          incompleteVersionHistory.push(id);
        }
        if (versionHistory.hasChanged) changedVersionHistory.push(versionHistory);
      },
      { concurrency: concurrentComponentsLimit() }
    );
    if (changedVersionHistory.length) {
      await this.repo.writeObjectsToTheFS(changedVersionHistory);
    }
    if (incompleteVersionHistory.length) {
      const ids = incompleteVersionHistory.map((id) => id.toString()).join('\n');
      logger.warn(`the following components have incomplete VersionHistory object:\n${ids}`);
    }
    logger.profile(`getIncompleteVersionHistory`);
    return incompleteVersionHistory;
  }

  /**
   * as opposed to importMany, which imports from dependents only.
   * needed mostly for cases when importMany doesn't work due to corrupted cache or the cache
   * doesn't exist yet.
   *
   * the downside is that a flattened-dependency could be on a dependent only and not on the
   * original scope, so it won't be retrieved by this method, however, next time the component is
   * imported,
   */
  async importManyFromOriginalScopes(ids: ComponentIdList) {
    logger.debugAndAddBreadCrumb('importManyFromOriginalScopes', `ids: {ids}`, { ids: ids.toString() });
    const idsToImport = compact(ids);
    if (R.isEmpty(idsToImport)) return [];

    const externalsToFetch: ComponentID[] = [];
    const defs = await this.sources.getMany(idsToImport);
    const existingDefs = defs.filter(({ id, component }) => {
      if (component) return true;
      if (this.scope.isLocal(id)) throw new ComponentNotFound(id.toString());
      externalsToFetch.push(id);
      return false;
    });
    const versionDeps = await this.multipleCompsDefsToVersionDeps(existingDefs);
    const remotes = await getScopeRemotes(this.scope);
    logger.debugAndAddBreadCrumb(
      'importManyFromOriginalScopes',
      'successfully fetched local components and their dependencies. Going to fetch externals'
    );
    const externalDeps = await this.getExternalMany(externalsToFetch, remotes);
    return [...versionDeps, ...externalDeps];
  }

  /**
   * checks whether the given components has all history.
   * if not, it fetches the history from their remotes without deps.
   */
  async importMissingHistory(bitIds: ComponentIdList) {
    const externals = bitIds.filter((bitId) => !this.scope.isLocal(bitId));
    if (!externals.length) {
      return;
    }
    const missingHistoryWithNulls = await mapSeries(externals, async (id) => {
      const missingId = await this.importMissingHistoryOne(id);
      return missingId;
    });
    const missingHistory = compact(missingHistoryWithNulls);
    if (!missingHistory.length) {
      logger.debug(`importMissingHistory, all history is already in scope, nothing to fetch`);
      return;
    }
    logger.debug(`importMissingHistory, total ${missingHistory.length} component has history missing`);
    await this.importWithoutDeps(ComponentIdList.fromArray(missingHistory).toVersionLatest(), {
      cache: false,
      collectParents: true,
      includeVersionHistory: true,
      reason: 'for missing history from main to the scope-lane',
    });
  }

  /**
   * an efficient way to verify that all history exists locally.
   * instead of loading all versions objects, load only the VersionHistory, get the graph from head, then only check whether
   * the objects exist in the filesystem.
   */
  private async importMissingHistoryOne(id: ComponentID) {
    const modelComponent = await this.scope.getModelComponent(id);
    if (!modelComponent.head) return null; // doesn't exist on the remote.
    const verHistory = await modelComponent.getAndPopulateVersionHistory(this.scope.objects, modelComponent.head);
    const { found, missing } = verHistory.getAllHashesFrom(modelComponent.head);
    if (missing?.length) {
      return id;
    }
    if (!found)
      throw new Error(`importMissingHistoryOne, found is empty, it must be populated when nothing is missing`);
    const allExist = await Promise.all(found.map((f) => this.scope.objects.has(Ref.from(f))));
    const someAreMissing = allExist.some((e) => !e);
    if (someAreMissing) return id;
    return null;
  }

  /**
   * this is relevant when a lane has components from other scopes, otherwise, the scope always have the entire history
   * of its own components.
   * checks whether the given components has all history graph so then it's possible to traverse the history.
   * if missing, go to their origin-scope and fetch their version-history. (currently, it also fetches the head
   * Version object, but it can be optimized to not fetch it)
   */
  async importMissingVersionHistory(externalComponents: ModelComponent[]) {
    // profiler is here temporarily to make sure this doesn't cost too much for some reason
    logger.profile(`importMissingVersionHistory, ${externalComponents.length} externalComponents`);
    const [compsWithHead, compsWithoutHead] = partition(externalComponents, (comp) => comp.hasHead());
    try {
      await this.importWithoutDeps(
        ComponentIdList.fromArray(compsWithoutHead.map((c) => c.toComponentId())).toVersionLatest(),
        {
          cache: false,
          includeVersionHistory: true,
          reason: 'lane-components without heads from main to ensure they have version-history',
        }
      );
    } catch (err) {
      // probably scope doesn't exist, which is fine.
      logger.debug(`importMissingVersionHistory failed getting a component without head from the other scope`, err);
    }
    const missingHistoryWithNulls = await mapSeries(compsWithHead, async (modelComponent) => {
      try {
        await getAllVersionHashes({ modelComponent, repo: this.repo, throws: true, startFrom: modelComponent.head });
      } catch (err: any) {
        if (errorIsTypeOfMissingObject(err)) {
          return modelComponent.toComponentId();
        }
        // we don't care much about other errors here. but it's good to know about them.
        logger.warn(`importMissingVersionHistory, failed traversing ${modelComponent.id()}, err: ${err.message}`, err);
        return null;
      }
      return null;
    });
    const missingHistory = compact(missingHistoryWithNulls);
    if (!missingHistory.length) return;
    logger.debug(`importMissingVersionHistory, total ${missingHistory.length} component has version-history missing`);
    await this.importWithoutDeps(ComponentIdList.fromArray(missingHistory).toVersionLatest(), {
      cache: false,
      includeVersionHistory: true,
      reason: 'lane-components from main to ensure they have version-history',
    });
    logger.profile(`importMissingVersionHistory, ${externalComponents.length} externalComponents`);
  }

  async importWithoutDeps(
    ids: ComponentIdList,
    {
      cache = true,
      lane,
      includeVersionHistory = false,
      ignoreMissingHead = false,
      collectParents = false,
      fetchHeadIfLocalIsBehind = false,
      includeUnexported = false,
      includeUpdateDependents = false,
      reason,
    }: {
      /**
       * if cache is true and the component found locally, don't go to the remote
       */
      cache?: boolean;
      lane?: Lane;
      includeVersionHistory?: boolean;
      /**
       * relevant when fetching from main and we're not sure whether the component exists on main
       */
      ignoreMissingHead?: boolean;
      /**
       * fetch all history of the component (all previous Version objects)
       */
      collectParents?: boolean;
      /**
       * go to the remote, check what’s the head. if the local head is behind, then fetch it, otherwise, return nothing
       */
      fetchHeadIfLocalIsBehind?: boolean;
      /**
       * whether filter out new component-ids that were not exported yet (default), or not (for cases we want to fix
       * out-of-sync scenarios)
       */
      includeUnexported?: boolean;
      /**
       * the reason why this import is needed (shown during the import)
       */
      reason?: string;
      /**
       * whether to include the updateDependents components on a lane (needed only when merging lane to main)
       */
      includeUpdateDependents?: boolean;
    }
  ): Promise<void> {
    const idsWithoutNils = compact(ids);
    if (!idsWithoutNils.length) return;
    logger.debug(`importWithoutDeps, total ids: ${ids.length}`);

    const [, externals] = partition(idsWithoutNils, (id) => this.isIdLocal(id, includeUnexported));
    if (!externals.length) return;

    const getIds = async () => {
      if (!fetchHeadIfLocalIsBehind) {
        return externals;
      }
      const compDef = await this.sources.getMany(ComponentIdList.fromArray(externals).toVersionLatest(), true);
      const idsForDelta = await mapSeries(compDef, async ({ id, component }) => {
        if (!component) {
          return id.changeVersion(undefined);
        }
        const remoteLaneId = lane ? lane.toLaneId() : LaneId.from(DEFAULT_LANE, id.scope as string);
        const remoteHead = await this.repo.remoteLanes.getRef(remoteLaneId, id);
        if (!remoteHead) {
          return id.changeVersion(undefined);
        }
        const remoteHeadExists = await this.repo.has(remoteHead);
        if (!remoteHeadExists) {
          logger.warn(
            `remote-ref exists for ${id.toString()}, lane ${remoteLaneId.toString()}, but the object is missing on the fs`
          );
          return id.changeVersion(undefined);
        }
        return id.changeVersion(remoteHead.toString());
      });
      return idsForDelta;
    };

    const idsToFetch = await getIds();

    await this.getExternalManyWithoutDeps(idsToFetch, {
      localFetch: cache,
      lane,
      includeVersionHistory,
      ignoreMissingHead,
      collectParents,
      delta: fetchHeadIfLocalIsBehind,
      includeUpdateDependents,
      reason,
    });
  }

  private isIdLocal(id: ComponentID, includeNonExported = false) {
    return includeNonExported ? id.isLocal(this.scope.name) : this.scope.isLocal(id);
  }

  async importLanes(remoteLaneIds: LaneId[], includeLaneHistory = false): Promise<Lane[]> {
    const remotes = await getScopeRemotes(this.scope);
    const objectsStreamPerRemote = await remotes.fetch(groupByScopeName(remoteLaneIds), this.scope, {
      type: 'lane',
      includeLaneHistory,
    });
    const bitObjects = await this.multipleStreamsToBitObjects(objectsStreamPerRemote);
    const lanes = bitObjects.getLanes();
    await Promise.all(lanes.map((lane) => this.repo.remoteLanes.syncWithLaneObject(lane.scope as string, lane)));
    if (includeLaneHistory) {
      const laneHistories = bitObjects.getLaneHistories();
      await this.scope.objects.writeObjectsToTheFS(laneHistories);
    }
    return lanes;
  }

  /**
   * currently used for import artifacts, but can be used to import any arbitrary array of hashes.
   * it takes care to remove any duplications and check whether the object exists locally before
   * going to the remote.
   * just make sure not to use it for components/lanes, as they require a proper "merge" before
   * persisting them to the filesystem. this method is good for immutable objects.
   */
  async importManyObjects(groupedHashes: HashesPerRemote, reason?: string): Promise<void> {
    await this.importManyObjectsMutex.runExclusive(async () => {
      const groupedHashedMissing = {};
      await Promise.all(
        Object.keys(groupedHashes).map(async (scopeName) => {
          const uniqueHashes: string[] = R.uniq(groupedHashes[scopeName]);
          const missing = await filter(uniqueHashes, async (hash) => !(await this.repo.has(new Ref(hash))));
          if (missing.length) {
            groupedHashedMissing[scopeName] = missing;
          }
        })
      );
      if (R.isEmpty(groupedHashedMissing)) return;

      const remotes = await getScopeRemotes(this.scope);
      const allObjects = await new ObjectFetcher(
        this.repo,
        this.scope,
        remotes,
        {
          type: 'object',
        },
        [],
        undefined,
        undefined,
        undefined,
        groupedHashedMissing,
        reason
      ).fetchFromRemoteAndWrite();
      this.throwForMissingObjects(groupedHashedMissing, allObjects);
    });
  }

  async checkWhatHashesExistOnRemote(remoteName: string, hashes: string[]): Promise<string[]> {
    const remotes: Remotes = await getScopeRemotes(this.scope);
    const remote = await remotes.resolve(remoteName);
    const getExistingLegacy = async () => {
      const multipleStreams = await remotes.fetch({ [remoteName]: hashes }, this.scope, { type: 'object' });
      const existing = await this.streamToHashes(remoteName, multipleStreams[remoteName]);
      return existing;
    };

    // @todo: this is supported since version > 1.6.150. once all remote scopes are updated, then change the below
    // call `const existing = await getExistingLegacy();` to `const existing = await getExisting();`
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const getExisting = async () => {
      try {
        return await remote.hasObjects(hashes);
      } catch (err: any) {
        if (err.name !== 'GraphQLClientError') throw err;
        // probably not supported by the server
        return getExistingLegacy();
      }
    };
    const existing = await getExistingLegacy();
    logger.debug(
      `checkWhatHashesExistOnRemote, searched for ${hashes.length} hashes, found ${existing.length} hashes on ${remote}`
    );
    return existing;
  }

  private throwForMissingObjects(groupedHashes: HashesPerRemote, receivedObjects: string[]) {
    const allRequestedHashes = uniq(Object.values(groupedHashes).flat());
    const allReceivedHashes = uniq(receivedObjects);
    const missingHashes = allRequestedHashes.filter((hash) => !allReceivedHashes.includes(hash));
    if (!missingHashes.length) {
      return; // all good, nothing is missing
    }
    const missingPerRemotes: HashesPerRemotes = {};
    missingHashes.forEach((hash) => {
      const remotes = Object.keys(groupedHashes).filter((remoteName) => groupedHashes[remoteName].includes(hash));
      missingPerRemotes[hash] = remotes;
    });
    throw new MissingObjects(missingPerRemotes);
  }

  async fetchWithoutDeps(
    ids: ComponentIdList,
    allowExternal: boolean,
    ignoreMissingHead = false
  ): Promise<ComponentVersion[]> {
    logger.debugAndAddBreadCrumb('fetchWithoutDeps', `total ids: {ids}`, { ids: ids.length });
    if (!allowExternal) this.throwIfExternalFound(ids);
    const localDefs: ComponentDef[] = await this.sources.getMany(ids);
    const componentVersionArr = localDefs.map(({ id, component }) => {
      if (!component) {
        logger.warn(`fetchWithoutDeps, failed finding a local component ${id.toString()}`);
        return null;
      }
      if (ignoreMissingHead && !component.head && !id.hasVersion()) {
        logger.debug(`fetchWithoutDeps, ignored missing head ${id.toString()}`);
        return null;
      }
      return component.toComponentVersion(id.version as string);
    });
    return compact(componentVersionArr);
  }

  async fetchWithDeps(
    ids: ComponentIdList,
    allowExternal: boolean,
    fetchOptions: Partial<FETCH_OPTIONS>
  ): Promise<VersionDependencies[]> {
    const { onlyIfBuilt, preferDependencyGraph } = fetchOptions;
    logger.debugAndAddBreadCrumb('fetchWithDeps', `ids: {ids}, options: {options}`, {
      ids: ids.toString(),
      options: fetchOptions,
    });
    if (!allowExternal) this.throwIfExternalFound(ids);

    // in case `preferDependencyGraph` is true, we normally don't import anything, so no need for the mutex.
    // an exception is when fetching an old component that doesn't have the dependency graph saved on the model, but
    // looking at the traffic on the remote scope, this is rare.
    const shouldUseMutex = !preferDependencyGraph;

    if (!shouldUseMutex) {
      logger.debug('fetchWithDeps, skipping the mutex');
      const localDefs: ComponentDef[] = await this.sources.getMany(ids);
      const versionDeps = await this.multipleCompsDefsToVersionDeps(localDefs, {
        onlyIfBuilt,
        skipComponentsWithDepsGraph: preferDependencyGraph,
        reasonForImport: `which are flattened dependencies of components that don't have dependency-graph`,
      });
      return versionDeps;
    }

    logger.debug(`fetchWithDeps, is locked? ${this.fetchWithDepsMutex.isLocked()}`);
    // avoid race condition of getting multiple "fetch" requests, which later translates into
    // multiple getExternalMany calls, which saves objects and write refs files at the same time
    return this.fetchWithDepsMutex.runExclusive(async () => {
      logger.debug('fetchWithDeps, acquiring a lock');
      const localDefs: ComponentDef[] = await this.sources.getMany(ids);
      const versionDeps = await this.multipleCompsDefsToVersionDeps(localDefs, {
        onlyIfBuilt,
        skipComponentsWithDepsGraph: preferDependencyGraph,
        reasonForImport: 'which are flattened dependencies of the components to fetch',
      });
      logger.debug('fetchWithDeps, releasing the lock');
      return versionDeps;
    });
  }

  /**
   * get ConsumerComponent by bitId. if the component was not found locally, import it from a remote scope
   */
  async loadRemoteComponent(id: ComponentID): Promise<ConsumerComponent> {
    const component = await this._getComponentVersion(id);
    if (!component) throw new ComponentNotFound(id.toString());
    return component.toConsumer(this.scope.objects);
  }

  async loadComponent(id: ComponentID, localOnly = true): Promise<ConsumerComponent> {
    logger.debugAndAddBreadCrumb('ScopeComponentsImporter', 'loadComponent {id}', { id: id.toString() });

    if (localOnly && !this.scope.isLocal(id)) {
      throw new BitError('cannot load a component from remote scope, please import first');
    }
    return this.loadRemoteComponent(id);
  }

  /**
   * get a single component from a remote without saving it locally
   */
  async getRemoteComponent(id: ComponentID): Promise<BitObjectList | null | undefined> {
    if (!this.scope.isExported(id)) {
      throw new Error(`unable to get remote component "${id.toString()}", the scope was not exported yet`);
    }
    const remotes = await getScopeRemotes(this.scope);
    let bitObjectsList: BitObjectList;
    try {
      const streams = await remotes.fetch({ [id.scope as string]: [id.toString()] }, this.scope);
      bitObjectsList = await this.multipleStreamsToBitObjects(streams);
    } catch (err: any) {
      logger.error(`getRemoteComponent, failed to get ${id.toString()}`, err);
      return null; // probably doesn't exist
    }

    return bitObjectsList;
  }

  /**
   * get components from a remote without saving it locally
   */
  async getManyRemoteComponents(ids: ComponentID[]): Promise<BitObjectList> {
    logger.debug(`getManyRemoteComponents, ids: ${ids.map((id) => id.toString()).join(', ')}`);
    ids.forEach((id) => {
      if (!this.scope.isExported(id)) {
        throw new Error(`unable to get remote component "${id.toString()}", the scope was not exported yet`);
      }
    });
    const remotes = await getScopeRemotes(this.scope);
    const grouped = groupByScopeName(ids);
    const streams = await remotes.fetch(grouped, this.scope);
    return this.multipleStreamsToBitObjects(streams);
  }

  private async multipleStreamsToBitObjects(remoteStreams: {
    [remoteName: string]: ObjectItemsStream;
  }): Promise<BitObjectList> {
    const objectListPerRemote = await Promise.all(
      Object.keys(remoteStreams).map(async (remoteName) => {
        try {
          return await ObjectList.fromReadableStream(remoteStreams[remoteName]);
        } catch (err: any) {
          logger.error(`multipleStreamsToBitObjects, error from ${remoteName}`, err);
          throw new Error(`the remote "${remoteName}" threw an error:\n${err.message}`);
        }
      })
    );
    const objectList = ObjectList.mergeMultipleInstances(objectListPerRemote);
    const bitObjects = await objectList.toBitObjects();
    return bitObjects;
  }

  private async streamToHashes(remoteName: string, stream: ObjectItemsStream): Promise<string[]> {
    const hashes: string[] = [];
    try {
      for await (const obj of stream) {
        hashes.push(obj.ref.hash);
      }
    } catch (err: any) {
      logger.error(`streamToHashes, error from ${remoteName}`, err);
      throw new Error(`the remote "${remoteName}" threw an error:\n${err.message}`);
    }
    return hashes;
  }

  private async getVersionFromComponentDef(component: ModelComponent, id: ComponentID): Promise<Version | null> {
    const versionComp: ComponentVersion = component.toComponentVersion(id.version);
    const version = await versionComp.getVersion(this.scope.objects, false);
    if (version) return version;
    if (this.scope.isLocal(id)) {
      // it should have been fetched locally, since it wasn't found, this is an error
      throw new BitError(
        `Version ${versionComp.version} of ${id.toString()} was not found in scope ${this.scope.name}`
      );
    }
    return null;
  }

  private async multipleCompsDefsToVersionDeps(
    compsDefs: ComponentDef[],
    {
      lane,
      onlyIfBuilt = false,
      skipComponentsWithDepsGraph = false,
      reasonForImport,
    }: {
      lane?: Lane;
      onlyIfBuilt?: boolean;
      skipComponentsWithDepsGraph?: boolean;
      reasonForImport?: string;
    } = {}
  ): Promise<VersionDependencies[]> {
    const concurrency = concurrentComponentsLimit();
    const componentsWithVersionsWithNulls = await pMapPool(
      compsDefs,
      async ({ component, id }) => {
        if (!component) return null;
        if (component.isEmpty() && !id.hasVersion() && !component.laneHeadLocal) {
          // this happens for example when importing a remote lane and then running "bit fetch --components"
          // the head is empty because it exists on the lane only, it was never tagged and
          // laneHeadLocal was never set as it originated from the scope, not the consumer.
          logger.warn(
            `multipleCompsDefsToVersionDeps, id: ${id.toString()} has no version and no head, cannot provide the VersionDeps`
          );
          return null;
        }
        const versionComp: ComponentVersion = component.toComponentVersion(id.version);
        const version = await this.getVersionFromComponentDef(component, id);
        if (!version) {
          throw new Error(
            `ScopeComponentImporter, expect ${id.toString()} to have a Version object of "${versionComp.version}"`
          );
        }
        if (onlyIfBuilt && version.buildStatus !== BuildStatus.Succeed && version.buildStatus !== BuildStatus.Skipped) {
          logger.debug(
            `multipleCompsDefsToVersionDeps, id: ${id.toString()} is skipped because its build-status is ${
              version.buildStatus
            }`
          );
          return null;
        }

        return { componentVersion: versionComp, versionObj: version };
      },
      { concurrency }
    );
    const componentsWithVersion = compact(componentsWithVersionsWithNulls);

    const flattenedDepsToFetch = new ComponentIdList();
    await Promise.all(
      componentsWithVersion.map(async (compWithVer) => {
        const flattenedEdges = await compWithVer.versionObj.getFlattenedEdges(this.repo);
        if (skipComponentsWithDepsGraph) {
          if (flattenedEdges.length) return;
          if (!compWithVer.versionObj.flattenedDependencies.length) return;
          logger.debug(
            `scopeComponentImporter, unable to get dependencies graph from ${compWithVer.componentVersion.id.toString()}, will import all its deps`
          );
        }
        flattenedDepsToFetch.add(compWithVer.versionObj.flattenedDependencies);
      })
    );

    await this.importWithoutDeps(flattenedDepsToFetch, { lane, reason: reasonForImport });
    const compDefsOfDeps = await this.sources.getMany(flattenedDepsToFetch);
    const compVersionsOfDeps = this.componentsDefToComponentsVersion(compDefsOfDeps, false, true);

    const versionDeps = componentsWithVersion.map(({ componentVersion, versionObj }) => {
      const dependencies = versionObj.flattenedDependencies.map((dep) =>
        compVersionsOfDeps.find((c) => c.toComponentId().isEqual(dep))
      );
      return new VersionDependencies(componentVersion, compact(dependencies), versionObj);
    });
    return versionDeps;
  }

  /**
   * get multiple components from remotes with their dependencies.
   * never checks if exist locally. always fetches from remote and then, save into the model.
   */
  private async getExternalMany(
    ids: ComponentID[],
    remotes: Remotes,
    {
      throwForDependencyNotFound = false,
      lane,
      throwOnUnavailableScope = true,
      preferDependencyGraph = false,
      includeUnexported = false,
      includeUpdateDependents = false,
      reason,
    }: {
      throwForDependencyNotFound?: boolean;
      lane?: Lane;
      throwOnUnavailableScope?: boolean;
      preferDependencyGraph?: boolean;
      includeUnexported?: boolean;
      includeUpdateDependents?: boolean;
      reason?: string;
    } = {}
  ): Promise<VersionDependencies[]> {
    if (!ids.length) return [];
    lane = await this.getLaneForFetcher(lane);
    logger.debug(
      `copeComponentsImporter.getExternalMany, fetching from remote scope. Ids: ${ids.join(', ')}, Lane: ${lane?.id()}`
    );
    const context = {};
    ids.forEach((id) => {
      if (this.isIdLocal(id, includeUnexported))
        throw new Error(`getExternalMany expects to get external ids only, got ${id.toString()}`);
    });
    // avoid re-fetching the components with all deps if they're still un-built
    const onlyIfBuilt = ids.every((id) => this.sources.isUnBuiltInCache(id));
    await new ObjectFetcher(
      this.repo,
      this.scope,
      remotes,
      {
        withoutDependencies: false, // backward compatibility. not needed for remotes > 0.0.900
        includeDependencies: true,
        includeVersionHistory: true,
        includeUpdateDependents,
        onlyIfBuilt,
        preferDependencyGraph,
        laneId: lane?.id(),
      },
      ids,
      lane,
      context,
      throwOnUnavailableScope,
      undefined,
      reason
    ).fetchFromRemoteAndWrite();
    const componentDefs = await this.sources.getMany(ids);
    const versionDeps = await this.multipleCompsDefsToVersionDeps(componentDefs, {
      lane,
      skipComponentsWithDepsGraph: preferDependencyGraph,
      reasonForImport: reason ? `${reason} - missing dependencies` : 'which are missing dependencies',
    });
    if (throwForDependencyNotFound) {
      versionDeps.forEach((verDep) => verDep.throwForMissingDependencies());
    }
    return versionDeps;
  }

  private componentsDefToComponentsVersion(
    defs: ComponentDef[],
    ignoreMissingHead = false,
    ignoreIfMissing = false
  ): ComponentVersion[] {
    const componentVersions = defs.map((def) => {
      if (!def.component) {
        if (ignoreIfMissing || ignoreMissingHead) return null;
        throw new Error(`componentsDefToComponentsVersion, def.component is missing for ${def.id.toString()}`);
      }
      if (ignoreMissingHead && !def.component.head && !def.id.hasVersion()) return null;
      return def.component.toComponentVersion(def.id.version);
    });

    return compact(componentVersions);
  }

  private async getExternalManyWithoutDeps(
    ids: ComponentID[],
    {
      localFetch = false,
      lane,
      includeVersionHistory = false,
      ignoreMissingHead = false,
      collectParents = false,
      delta = false,
      includeUpdateDependents,
      reason,
    }: {
      localFetch?: boolean;
      lane?: Lane;
      includeVersionHistory?: boolean;
      ignoreMissingHead?: boolean;
      collectParents?: boolean;
      delta?: boolean;
      includeUpdateDependents?: boolean;
      reason?: string;
    }
  ): Promise<void> {
    if (!ids.length) return;
    const remotes = await getScopeRemotes(this.scope);
    logger.debug(`getExternalManyWithoutDeps, total ids: ${ids.length}, localFetch: ${localFetch.toString()}`);
    const defs: ComponentDef[] = await this.sources.getMany(ids, true);
    const left = defs.filter((def) => !localFetch || !def.component);

    if (left.length === 0) {
      logger.debug('getExternalManyWithoutDeps, no more ids left, all found locally');
      return;
    }
    const leftIds = left.map((def) => def.id);
    const leftIdsStr = leftIds.map((id) => id.toString());
    logger.debug(`getExternalManyWithoutDeps, ${left.length} left. Fetching them from a remote. ids: ${leftIdsStr}`);
    const context = { requestedBitIds: leftIds.map((id) => id.toString()) };
    lane = await this.getLaneForFetcher(lane);
    const isUsingImporter = isFeatureEnabled(CLOUD_IMPORTER) || isFeatureEnabled(CLOUD_IMPORTER_V2);
    await new ObjectFetcher(
      this.repo,
      this.scope,
      remotes,
      {
        // since fetchSchema 0.0.3, "component-delta" type has removed and "returnNothingIfGivenVersionExists" is used instead
        type: delta && !isUsingImporter ? 'component-delta' : 'component',
        includeVersionHistory,
        ignoreMissingHead,
        laneId: lane?.id(),
        collectParents,
        returnNothingIfGivenVersionExists: delta,
        includeUpdateDependents,
      },
      leftIds,
      lane,
      context,
      undefined,
      undefined,
      reason
    ).fetchFromRemoteAndWrite();
  }

  private async getLaneForFetcher(lane?: Lane): Promise<Lane | undefined> {
    if (lane) {
      return lane.isNew ? undefined : lane;
    }
    if (!this.shouldOnlyFetchFromCurrentLane) return undefined;
    const currentLane = await this.scope.getCurrentLaneObject();
    return currentLane && !currentLane.isNew ? currentLane : undefined;
  }

  private async _getComponentVersion(id: ComponentID): Promise<ComponentVersion> {
    if (!this.scope.isLocal(id)) {
      await this.getExternalManyWithoutDeps([id], { localFetch: true });
      const compDefs: ComponentDef[] = await this.sources.getMany([id]);
      const componentVersions = this.componentsDefToComponentsVersion(compDefs, false, true);

      if (!componentVersions.length) throw new BitError(`unable to find ${id.toString()} in its remote`);
      return componentVersions[0];
    }

    return this.sources.get(id).then((component) => {
      if (!component) throw new ComponentNotFound(id.toString());
      return component.toComponentVersion(id.version);
    });
  }

  /**
   * once we discover that a component is external, no need to dig deeper to its dependencies, we
   * just add it to `externalsToFetch` array. later, its dependencies will be fetched from the
   * dependent remote.
   * the recursive is needed for locals. if this component is local, we need to know what
   * components to ask for from the remote. we iterate over the direct dependencies and if some of
   * them are local as well, we need to iterate over their dependencies and so on.
   */
  private async findMissingExternalsRecursively(
    compDefs: ComponentDef[],
    externalsToFetch: ComponentID[],
    ignoreMissingHead: boolean,
    reFetchUnBuiltVersion = true,
    preferDependencyGraph = false,
    visited: string[] = [],
    existingCache = new ComponentIdList()
  ): Promise<void> {
    if (!compDefs.length) return;
    const idsStr = compDefs.map((c) => c.id.toString()).join(', ');
    logger.debug(`findMissingExternalsRecursively, components ${idsStr}`);
    const compDefsForNextIteration: ComponentDef[] = [];
    await mapSeries(compDefs, async ({ component, id }) => {
      const idStr = id.toString();
      if (visited.includes(idStr)) return;
      visited.push(idStr);
      if (!component) {
        if (!this.scope.isExported(id)) return;
        if (this.scope.isLocal(id)) throw new ComponentNotFound(idStr);
        externalsToFetch.push(id);
        return;
      }
      let version: Version | null | undefined;
      try {
        version = await this.getVersionFromComponentDef(component, id);
      } catch (err) {
        if (err instanceof NoHeadNoVersion && ignoreMissingHead) {
          logger.debug(
            `findMissingExternalsRecursively, ignoring ${idStr} because it has no head and no version and "ignoreMissingHead" was set to true`
          );
          return;
        }
        throw err;
      }
      if (!version) {
        // it must be external. otherwise, getVersionFromComponentDef would throw
        externalsToFetch.push(id);
        return;
      }
      const flattenedEdges = await version.getFlattenedEdges(this.repo);
      if (preferDependencyGraph && flattenedEdges.length) {
        return;
      }
      const flattenedDepsToLocate = version.flattenedDependencies.filter((dep) => !existingCache.has(dep));
      const flattenedDepsDefs = await this.sources.getMany(flattenedDepsToLocate, reFetchUnBuiltVersion);
      const allFlattenedExist = flattenedDepsDefs.every((def) => {
        if (!def.component) return false;
        existingCache.push(def.id);
        return true;
      });
      if (allFlattenedExist) {
        return;
      }
      // some flattened are missing
      if (!this.scope.isLocal(id)) {
        externalsToFetch.push(id);
        return;
      }
      // it's local and some flattened are missing, check the direct dependencies
      const directDepsDefs = await this.sources.getMany(version.getAllDependenciesIds(), reFetchUnBuiltVersion);
      compDefsForNextIteration.push(...directDepsDefs);
    });

    await this.findMissingExternalsRecursively(
      compDefsForNextIteration,
      externalsToFetch,
      ignoreMissingHead,
      reFetchUnBuiltVersion,
      preferDependencyGraph,
      visited,
      existingCache
    );
  }

  /**
   * convert ids to VersionDependencies with performance in mind.
   * it doesn't go to any remote and it fetches each component only once.
   */
  private async bitIdsToVersionDeps(
    ids: ComponentID[],
    throwForSeederNotFound = true,
    preferDependencyGraph = false
  ): Promise<VersionDependencies[]> {
    logger.debug(`bitIdsToVersionDeps, ${ids.length} ids`);
    const compDefs = await this.sources.getMany(ids);
    const versionDepsWithNulls = await mapSeries(compDefs, async ({ component, id }) => {
      if (!component) {
        if (throwForSeederNotFound) throw new ComponentNotFound(id.toString());
        logger.warn(`bitIdsToVersionDeps failed finding a component ${id.toString()}`);
        return null;
      }
      if (component.isEmpty() && !id.hasVersion() && !component.laneHeadLocal) {
        // this happens for example when importing a remote lane and then running "bit fetch --components"
        // the head is empty because it exists on the lane only, it was never tagged and
        // laneHeadLocal was never set as it originated from the scope, not the consumer.
        return null;
      }
      const versionComp: ComponentVersion = component.toComponentVersion(id.version);
      const version = await this.getVersionFromComponentDef(component, id);
      if (!version) {
        // should have been fetched before by getExternalMany(). probably doesn't exist on the remote.
        throw new BitError(`Version ${versionComp.version} of ${component.id().toString()} was not found`);
      }
      return new VersionDependencies(versionComp, [], version);
    });
    const versionDeps = compact(versionDepsWithNulls);
    const allFlattened = await Promise.all(
      versionDeps.map(async (v) => {
        const flattenedEdges = await v.version.getFlattenedEdges(this.repo);
        if (preferDependencyGraph && flattenedEdges.length) return [];
        return v.version.getAllFlattenedDependencies();
      })
    );
    const allFlattenedUniq = ComponentIdList.uniqFromArray(flatten(allFlattened));
    const allFlattenedDefs = await this.sources.getMany(allFlattenedUniq);
    const flattenedComponentVersions = compact(
      allFlattenedDefs.map(({ id, component }) => {
        if (!component) {
          logger.warn(`bitIdsToVersionDeps failed finding a local component ${id.toString()}`);
          return null;
        }
        return component.toComponentVersion(id.version);
      })
    );
    versionDeps.forEach((versionDep) => {
      const deps = versionDep.version.flattenedDependencies.map((dep) =>
        flattenedComponentVersions.find((c) => c.toComponentId().isEqual(dep))
      );
      versionDep.dependencies = compact(deps);
    });

    return versionDeps;
  }

  private throwIfExternalFound(ids: ComponentIdList) {
    const externals = ids.filter((id) => !this.scope.isLocal(id));
    if (externals.length) {
      const externalStr = externals.map((id) => id.toString()).join(', ');
      // we can't support fetching-with-dependencies of external components as we risk going into an infinite loop
      throw new Error(`fatal API does not support fetching components from different scopes.
current scope: "${this.scope.name}", externals: "${externalStr}"
please make sure that the scope-resolver points to the right scope.`);
    }
  }
}

export function groupByScopeName(ids: Array<ComponentID | LaneId>): { [scopeName: string]: string[] } {
  const grouped = groupArray(ids, 'scope');
  Object.keys(grouped).forEach((scopeName) => {
    grouped[scopeName] = grouped[scopeName].map((id) => id.toString());
  });
  return grouped;
}

export function errorIsTypeOfMissingObject(err: Error) {
  return err instanceof ParentNotFound || err instanceof VersionNotFound || err instanceof HeadNotFound;
}
