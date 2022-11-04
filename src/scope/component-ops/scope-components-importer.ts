import { filter } from 'bluebird';
import { Mutex } from 'async-mutex';
import pMap from 'p-map';
import mapSeries from 'p-map-series';
import { LaneId, DEFAULT_LANE } from '@teambit/lane-id';
import groupArray from 'group-array';
import R from 'ramda';
import { compact, flatten, uniq } from 'lodash';
import loader from '../../cli/loader';
import { Scope } from '..';
import { BitId, BitIds } from '../../bit-id';
import ConsumerComponent from '../../consumer/component';
import GeneralError from '../../error/general-error';
import ShowDoctorError from '../../error/show-doctor-error';
import enrichContextFromGlobal from '../../hooks/utils/enrich-context-from-global';
import logger from '../../logger/logger';
import { Remotes } from '../../remotes';
import { splitBy } from '../../utils';
import ComponentVersion from '../component-version';
import { ComponentNotFound, ParentNotFound, VersionNotFound } from '../exceptions';
import { Lane, ModelComponent, Version } from '../models';
import { BitObject, Ref, Repository } from '../objects';
import { ObjectItemsStream, ObjectList } from '../objects/object-list';
import SourcesRepository, { ComponentDef } from '../repositories/sources';
import { getScopeRemotes } from '../scope-remotes';
import VersionDependencies from '../version-dependencies';
import { BitObjectList } from '../objects/bit-object-list';
import { ObjectFetcher } from '../objects-fetcher/objects-fetcher';
import { concurrentComponentsLimit } from '../../utils/concurrency';
import { BuildStatus } from '../../constants';
import { NoHeadNoVersion } from '../exceptions/no-head-no-version';
import { HashesPerRemotes, MissingObjects } from '../exceptions/missing-objects';
import { getAllVersionHashes } from './traverse-versions';

const removeNils = R.reject(R.isNil);

type HashesPerRemote = { [remoteName: string]: string[] };

/**
 * Helper to import objects/components from remotes.
 * this class is singleton because it uses Mutex to ensure that the same objects are not fetched and written at the same time.
 * (if this won't be a singleton, then the mutex will be created for each instance, hence, one instance won't lock the other one).
 */
export default class ScopeComponentsImporter {
  private static instancePerScope: { [scopeName: string]: ScopeComponentsImporter } = {};
  private sources: SourcesRepository;
  private repo: Repository;
  private fetchWithDepsMutex = new Mutex();
  private importManyObjectsMutex = new Mutex();
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
    lanes = [],
    ignoreMissingHead = false,
  }: {
    ids: BitIds;
    cache?: boolean;
    throwForDependencyNotFound?: boolean;
    throwForSeederNotFound?: boolean; // in some cases, the "ids" params are not seeders but deps, e.g. in buildGraphFromFS.
    reFetchUnBuiltVersion?: boolean;
    lanes?: Lane[]; // if ids coming from a lane, add the lane object so we could fetch these ids from the lane's remote
    ignoreMissingHead?: boolean; // needed when fetching "main" objects when on a lane
  }): Promise<VersionDependencies[]> {
    logger.debugAndAddBreadCrumb(
      'importMany',
      `cache ${cache}, reFetchUnBuiltVersion: ${reFetchUnBuiltVersion}, throwForDependencyNotFound: ${throwForDependencyNotFound}. ids: {ids}, lanes: {lanes}`,
      {
        ids: ids.toString(),
        lanes: lanes ? lanes.map((lane) => lane.id()).join(', ') : undefined,
      }
    );
    const idsToImport = compact(ids.filter((id) => id.hasScope()));
    if (R.isEmpty(idsToImport)) {
      logger.debug(`importMany, nothing to import`);
      return [];
    }

    const externalsToFetch: BitId[] = [];

    const compDefs = await this.sources.getMany(idsToImport, reFetchUnBuiltVersion);
    const existingDefs = compDefs.filter(({ id, component }) => {
      if (id.isLocal(this.scope.name)) {
        if (!component) throw new ComponentNotFound(id.toString());
        return true;
      }
      if (cache && component) return true;
      externalsToFetch.push(id);
      return false;
    });
    await this.findMissingExternalsRecursively(
      existingDefs,
      externalsToFetch,
      ignoreMissingHead,
      reFetchUnBuiltVersion
    );
    const uniqExternals = BitIds.uniqFromArray(externalsToFetch);
    logger.debug('importMany', `total missing externals: ${uniqExternals.length}`);
    const remotes = await getScopeRemotes(this.scope);
    // we don't care about the VersionDeps returned here as it may belong to the dependencies
    await this.getExternalMany(uniqExternals, remotes, throwForDependencyNotFound, lanes, throwForSeederNotFound);
    const versionDeps = await this.bitIdsToVersionDeps(idsToImport, throwForSeederNotFound);
    logger.debug('importMany, completed!');
    return versionDeps;
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
  async importManyFromOriginalScopes(ids: BitIds) {
    logger.debugAndAddBreadCrumb('importManyFromOriginalScopes', `ids: {ids}`, { ids: ids.toString() });
    const idsToImport = compact(ids);
    if (R.isEmpty(idsToImport)) return [];

    const externalsToFetch: BitId[] = [];
    const defs = await this.sources.getMany(idsToImport);
    const existingDefs = defs.filter(({ id, component }) => {
      if (component) return true;
      if (id.isLocal(this.scope.name)) throw new ComponentNotFound(id.toString());
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
  async importMissingHistory(bitIds: BitIds) {
    const externals = bitIds.filter((bitId) => !bitId.isLocal(this.scope.name));
    if (!externals.length) {
      return;
    }
    const missingHistoryWithNulls = await mapSeries(externals, async (id) => {
      const modelComponent = await this.scope.getModelComponent(id);
      if (!modelComponent.head) return null; // doesn't exist on the remote.
      try {
        await getAllVersionHashes({ modelComponent, repo: this.repo });
      } catch (err: any) {
        if (err instanceof ParentNotFound || err instanceof VersionNotFound) {
          return id;
        }
        // we don't care much about other errors here. but it's good to know about them.
        logger.warn(`importMissingHistory, failed traversing ${id.toString()}, err: ${err.message}`, err);
        return null;
      }
      return null;
    });
    const missingHistory = compact(missingHistoryWithNulls);
    if (!missingHistory.length) return;
    logger.debug(`importMissingHistory, total ${missingHistory.length} component has history missing`);
    await this.importManyDeltaWithoutDeps(BitIds.fromArray(missingHistory), true);
  }

  async importWithoutDeps(ids: BitIds, cache = true, lanes: Lane[] = []): Promise<ComponentVersion[]> {
    if (!ids.length) return [];
    logger.debugAndAddBreadCrumb('importWithoutDeps', `total ids: {ids}`, {
      ids: ids.length,
    });

    const idsWithoutNils = removeNils(ids);
    if (R.isEmpty(idsWithoutNils)) return Promise.resolve([]);

    const [externals, locals] = splitBy(idsWithoutNils, (id) => id.isLocal(this.scope.name));

    const localDefs: ComponentDef[] = await this.sources.getMany(locals);
    const componentVersionArr = localDefs.map((def) => {
      if (!def.component) {
        logger.warn(
          `importWithoutDeps failed to find a local component ${def.id.toString()}. continuing without this component`
        );
        return null;
      }
      return def.component.toComponentVersion(def.id.version as string);
    });
    const remotes = await getScopeRemotes(this.scope);
    const externalDeps = await this.getExternalManyWithoutDeps(externals, remotes, cache, undefined, lanes);
    return [...compact(componentVersionArr), ...externalDeps];
  }

  /**
   * delta between the local head and the remote head. mainly to improve performance
   */
  async importManyDeltaWithoutDeps(
    ids: BitIds,
    allHistory = false,
    lane?: Lane,
    ignoreMissingHead = false
  ): Promise<void> {
    logger.debugAndAddBreadCrumb('importManyDeltaWithoutDeps', `Ids: {ids}`, { ids: ids.toString() });
    const idsWithoutNils = BitIds.uniqFromArray(compact(ids));
    if (R.isEmpty(idsWithoutNils)) return;

    const compDef = await this.sources.getMany(idsWithoutNils.toVersionLatest(), true);
    const idsToFetch = await mapSeries(compDef, async ({ id, component }) => {
      if (!component || allHistory) {
        // remove the version to fetch it with all versions.
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
    const groupedIds = lane ? groupByLanes(idsToFetch, [lane]) : groupByScopeName(idsToFetch);
    const idsOnlyDelta = idsToFetch.filter((id) => id.hasVersion());
    const idsAllHistory = idsToFetch.filter((id) => !id.hasVersion());
    const remotesCount = Object.keys(groupedIds).length;
    const statusMsg = `fetching ${idsToFetch.length} components from ${remotesCount} remotes. delta-only: ${idsOnlyDelta.length}, all-history: ${idsAllHistory.length}.`;
    loader.start(statusMsg);
    logger.debugAndAddBreadCrumb('importManyDeltaWithoutDeps', statusMsg);
    const remotes = await getScopeRemotes(this.scope);
    await new ObjectFetcher(
      this.repo,
      this.scope,
      remotes,
      {
        type: 'component-delta',
        withoutDependencies: true,
        laneId: lane ? lane.id() : undefined,
        ignoreMissingHead,
        preferVersionHistory: true,
      },
      idsToFetch,
      lane ? [lane] : undefined
    ).fetchFromRemoteAndWrite();
  }

  async importLanes(remoteLaneIds: LaneId[]): Promise<Lane[]> {
    const remotes = await getScopeRemotes(this.scope);
    const objectsStreamPerRemote = await remotes.fetch(groupByScopeName(remoteLaneIds), this.scope, { type: 'lane' });
    const bitObjects = await this.multipleStreamsToBitObjects(objectsStreamPerRemote);
    const lanes = bitObjects.getLanes();
    await Promise.all(lanes.map((lane) => this.repo.remoteLanes.syncWithLaneObject(lane.scope as string, lane)));
    return lanes;
  }

  /**
   * currently used for import artifacts, but can be used to import any arbitrary array of hashes.
   * it takes care to remove any duplications and check whether the object exists locally before
   * going to the remote.
   * just make sure not to use it for components/lanes, as they require a proper "merge" before
   * persisting them to the filesystem. this method is good for immutable objects.
   */
  async importManyObjects(groupedHashes: HashesPerRemote): Promise<void> {
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
      const multipleStreams = await remotes.fetch(groupedHashedMissing, this.scope, { type: 'object' });
      const bitObjectsList = await this.multipleStreamsToBitObjects(multipleStreams);
      const allObjects = bitObjectsList.getAll();
      await this.repo.writeObjectsToTheFS(allObjects);
      this.throwForMissingObjects(groupedHashedMissing, allObjects);
    });
  }

  private throwForMissingObjects(groupedHashes: HashesPerRemote, receivedObjects: BitObject[]) {
    const allRequestedHashes = uniq(Object.values(groupedHashes).flat());
    const allReceivedHashes = uniq(receivedObjects.map((o) => o.hash().toString()));
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

  async fetchWithoutDeps(ids: BitIds, allowExternal: boolean, ignoreMissingHead = false): Promise<ComponentVersion[]> {
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

  async fetchWithDeps(ids: BitIds, allowExternal: boolean, onlyIfBuild = false): Promise<VersionDependencies[]> {
    logger.debugAndAddBreadCrumb('fetchWithDeps', `ids: {ids}`, { ids: ids.toString() });
    if (!allowExternal) this.throwIfExternalFound(ids);
    logger.debug(`fetchWithDeps, is locked? ${this.fetchWithDepsMutex.isLocked()}`);
    // avoid race condition of getting multiple "fetch" requests, which later translates into
    // multiple getExternalMany calls, which saves objects and write refs files at the same time
    return this.fetchWithDepsMutex.runExclusive(async () => {
      logger.debug('fetchWithDeps, acquiring a lock');
      const localDefs: ComponentDef[] = await this.sources.getMany(ids);
      const versionDeps = await this.multipleCompsDefsToVersionDeps(localDefs, undefined, onlyIfBuild);
      logger.debug('fetchWithDeps, releasing the lock');
      return versionDeps;
    });
  }

  /**
   * get ConsumerComponent by bitId. if the component was not found locally, import it from a remote scope
   */
  async loadRemoteComponent(id: BitId): Promise<ConsumerComponent> {
    const component = await this._getComponentVersion(id);
    if (!component) throw new ComponentNotFound(id.toString());
    return component.toConsumer(this.scope.objects);
  }

  async loadComponent(id: BitId, localOnly = true): Promise<ConsumerComponent> {
    logger.debugAndAddBreadCrumb('ScopeComponentsImporter', 'loadComponent {id}', { id: id.toString() });

    if (localOnly && !id.isLocal(this.scope.name)) {
      throw new GeneralError('cannot load a component from remote scope, please import first');
    }
    return this.loadRemoteComponent(id);
  }

  /**
   * get a single component from a remote without saving it locally
   */
  async getRemoteComponent(id: BitId): Promise<BitObjectList | null | undefined> {
    if (!id.scope) {
      throw new Error(`unable to get remote component "${id.toString()}", the scope is empty`);
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
  async getManyRemoteComponents(ids: BitId[]): Promise<BitObjectList> {
    logger.debug(`getManyRemoteComponents, ids: ${ids.map((id) => id.toString()).join(', ')}`);
    ids.forEach((id) => {
      if (!id.scope) {
        throw new Error(`unable to get remote component "${id.toString()}", the scope is empty`);
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

  private async getVersionFromComponentDef(component: ModelComponent, id: BitId): Promise<Version | null> {
    const versionComp: ComponentVersion = component.toComponentVersion(id.version);
    const version = await versionComp.getVersion(this.scope.objects, false);
    if (version) return version;
    if (id.isLocal(this.scope.name)) {
      // it should have been fetched locally, since it wasn't found, this is an error
      throw new ShowDoctorError(
        `Version ${versionComp.version} of ${id.toString()} was not found in scope ${this.scope.name}`
      );
    }
    return null;
  }

  private async multipleCompsDefsToVersionDeps(
    compsDefs: ComponentDef[],
    lanes: Lane[] = [],
    onlyIfBuilt = false
  ): Promise<VersionDependencies[]> {
    const concurrency = concurrentComponentsLimit();
    const componentsWithVersionsWithNulls = await pMap(
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
        if (onlyIfBuilt && version.buildStatus !== BuildStatus.Succeed) {
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

    const idsToFetch = new BitIds();
    componentsWithVersion.forEach((compWithVer) => {
      idsToFetch.add(compWithVer.versionObj.flattenedDependencies);
    });

    const compVersionsOfDeps = await this.importWithoutDeps(idsToFetch, undefined, lanes);

    const versionDeps = componentsWithVersion.map(({ componentVersion, versionObj }) => {
      const dependencies = versionObj.flattenedDependencies.map((dep) =>
        compVersionsOfDeps.find((c) => c.id.isEqual(dep))
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
    ids: BitId[],
    remotes: Remotes,
    throwForDependencyNotFound = false,
    lanes: Lane[] = [],
    throwOnUnavailableScope = true
  ): Promise<VersionDependencies[]> {
    if (!ids.length) return [];
    if (lanes.length > 1) throw new Error(`getExternalMany support only one lane`);
    logger.debugAndAddBreadCrumb(
      'ScopeComponentsImporter.getExternalMany',
      `fetching from remote scope. Ids: {ids}, Lanes: {lanes}`,
      {
        ids: ids.join(', '),
        lanes: lanes.map((lane) => lane.id()).join(', '),
      }
    );
    const context = {};
    ids.forEach((id) => {
      if (id.isLocal(this.scope.name))
        throw new Error(`getExternalMany expects to get external ids only, got ${id.toString()}`);
    });
    enrichContextFromGlobal(Object.assign({}, { requestedBitIds: ids.map((id) => id.toString()) }));
    // avoid re-fetching the components with all deps if they're still un-built
    const onlyIfBuilt = ids.every((id) => this.sources.isUnBuiltInCache(id));
    await new ObjectFetcher(
      this.repo,
      this.scope,
      remotes,
      {
        withoutDependencies: false,
        onlyIfBuilt,
        laneId: lanes.length ? lanes[0].id() : undefined,
      },
      ids,
      lanes,
      context,
      throwOnUnavailableScope
    ).fetchFromRemoteAndWrite();
    const componentDefs = await this.sources.getMany(ids);
    const versionDeps = await this.multipleCompsDefsToVersionDeps(componentDefs, lanes);
    if (throwForDependencyNotFound) {
      versionDeps.forEach((verDep) => verDep.throwForMissingDependencies());
    }
    return versionDeps;
  }

  private async getExternalManyWithoutDeps(
    ids: BitId[],
    remotes: Remotes,
    localFetch = false,
    context: Record<string, any> = {},
    lanes: Lane[] = []
  ): Promise<ComponentVersion[]> {
    if (!ids.length) return [];
    logger.debugAndAddBreadCrumb(
      'getExternalManyWithoutDeps',
      `total ids: {ids}, localFetch: ${localFetch.toString()}`,
      {
        ids: ids.length,
      }
    );
    const defs: ComponentDef[] = await this.sources.getMany(ids, true);
    const left = defs.filter((def) => !localFetch || !def.component);
    if (left.length === 0) {
      logger.debugAndAddBreadCrumb('getExternalManyWithoutDeps', 'no more ids left, all found locally');
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      return defs.map((def) => def.component!.toComponentVersion(def.id.version));
    }
    logger.debugAndAddBreadCrumb(
      'getExternalManyWithoutDeps',
      `${left.length} left. Fetching them from a remote. ids: {ids}`,
      {
        ids: ids.join(', '),
      }
    );
    enrichContextFromGlobal(Object.assign(context, { requestedBitIds: ids.map((id) => id.toString()) }));
    await new ObjectFetcher(
      this.repo,
      this.scope,
      remotes,
      {
        withoutDependencies: true,
      },
      left.map((def) => def.id),
      lanes,
      context
    ).fetchFromRemoteAndWrite();

    const finalDefs: ComponentDef[] = await this.sources.getMany(ids);

    // @todo: should we warn about the non-missing?
    return compact(finalDefs.map((def) => def.component?.toComponentVersion(def.id.version)));
  }

  private async _getComponentVersion(id: BitId): Promise<ComponentVersion> {
    if (!id.isLocal(this.scope.name)) {
      const remotes = await getScopeRemotes(this.scope);
      const componentVersions = await this.getExternalManyWithoutDeps([id], remotes, true);
      if (!componentVersions.length) throw new GeneralError(`unable to find ${id.toString()} in its remote`);
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
    externalsToFetch: BitId[],
    ignoreMissingHead: boolean,
    reFetchUnBuiltVersion = true,
    visited: string[] = [],
    existingCache = new BitIds()
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
        if (id.isLocal(this.scope.name)) throw new ComponentNotFound(idStr);
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
      if (!id.isLocal(this.scope.name)) {
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
      visited,
      existingCache
    );
  }

  /**
   * convert ids to VersionDependencies with performance in mind.
   * it doesn't go to any remote and it fetches each component only once.
   */
  private async bitIdsToVersionDeps(ids: BitId[], throwForSeederNotFound = true): Promise<VersionDependencies[]> {
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
        throw new ShowDoctorError(`Version ${versionComp.version} of ${component.id().toString()} was not found`);
      }
      return new VersionDependencies(versionComp, [], version);
    });
    const versionDeps = compact(versionDepsWithNulls);
    const allFlattened = versionDeps.map((v) => v.version.getAllFlattenedDependencies());
    const allFlattenedUniq = BitIds.uniqFromArray(flatten(allFlattened));
    const allFlattenedDefs = await this.sources.getMany(allFlattenedUniq);
    const flattenedComponentVersions = compact(
      allFlattenedDefs.map(({ id, component }) => {
        if (!component) {
          logger.warn(`fetchWithoutDeps failed finding a local component ${id.toString()}`);
          return null;
        }
        return component.toComponentVersion(id.version);
      })
    );
    versionDeps.forEach((versionDep) => {
      const deps = versionDep.version.flattenedDependencies.map((dep) =>
        flattenedComponentVersions.find((c) => c.id.isEqual(dep))
      );
      versionDep.dependencies = compact(deps);
    });

    return versionDeps;
  }

  private throwIfExternalFound(ids: BitIds) {
    const [externals] = splitBy(ids, (id) => id.isLocal(this.scope.name));
    if (externals.length) {
      const externalStr = externals.map((id) => id.toString()).join(', ');
      // we can't support fetching-with-dependencies of external components as we risk going into an infinite loop
      throw new Error(`fatal API does not support fetching components from different scopes.
current scope: "${this.scope.name}", externals: "${externalStr}"
please make sure that the scope-resolver points to the right scope.`);
    }
  }
}

export function groupByScopeName(ids: Array<BitId | LaneId>): { [scopeName: string]: string[] } {
  const grouped = groupArray(ids, 'scope');
  Object.keys(grouped).forEach((scopeName) => {
    grouped[scopeName] = grouped[scopeName].map((id) => id.toString());
  });
  return grouped;
}

export function groupByLanes(ids: BitId[], lanes: Lane[]): { [scopeName: string]: string[] } {
  const lane = lanes[0];
  if (!lane.scope) {
    throw new Error(`can't group by Lane object, the scope is undefined for ${lane.id()}`);
  }
  const laneIds = lane.toBitIds();
  if (lanes.length > 1) {
    throw new Error(`groupByLanes does not support more than one lane`);
  }
  const grouped: { [scopeName: string]: string[] } = {};

  const isLaneIncludeId = (id: BitId, laneBitIds: BitIds) => {
    if (laneBitIds.has(id)) return true;
    const foundWithoutVersion = laneBitIds.searchWithoutVersion(id);
    return foundWithoutVersion;
  };

  ids.forEach((id) => {
    if (isLaneIncludeId(id, laneIds)) {
      (grouped[lane.scope] ||= []).push(id.toString());
    } else {
      // if not found on a lane, fetch from main.
      (grouped[id.scope as string] ||= []).push(id.toString());
    }
  });

  return grouped;
}
