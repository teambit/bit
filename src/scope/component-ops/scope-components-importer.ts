import { filter } from 'bluebird';
import { Mutex } from 'async-mutex';
import pMap from 'p-map';
import mapSeries from 'p-map-series';
import groupArray from 'group-array';
import R from 'ramda';
import { compact, flatten } from 'lodash';
import loader from '../../cli/loader';
import { Scope } from '..';
import { Analytics } from '../../analytics/analytics';
import { BitId, BitIds } from '../../bit-id';
import ConsumerComponent from '../../consumer/component';
import GeneralError from '../../error/general-error';
import ShowDoctorError from '../../error/show-doctor-error';
import enrichContextFromGlobal from '../../hooks/utils/enrich-context-from-global';
import { RemoteLaneId } from '../../lane-id/lane-id';
import logger from '../../logger/logger';
import { Remotes } from '../../remotes';
import { splitBy } from '../../utils';
import ComponentVersion from '../component-version';
import { ComponentNotFound } from '../exceptions';
import { Lane, ModelComponent, Version } from '../models';
import { Ref, Repository } from '../objects';
import { ObjectItemsStream, ObjectList } from '../objects/object-list';
import SourcesRepository, { ComponentDef } from '../repositories/sources';
import { getScopeRemotes } from '../scope-remotes';
import VersionDependencies from '../version-dependencies';
import { DEFAULT_LANE } from '../../constants';
import { BitObjectList } from '../objects/bit-object-list';
import { ObjectFetcher } from '../objects-fetcher/objects-fetcher';
import { concurrentComponentsLimit } from '../../utils/concurrency';

const removeNils = R.reject(R.isNil);

export default class ScopeComponentsImporter {
  scope: Scope;
  sources: SourcesRepository;
  repo: Repository;
  fetchWithDepsMutex = new Mutex();
  constructor(scope: Scope) {
    if (!scope) throw new Error('unable to instantiate ScopeComponentsImporter without Scope');
    this.scope = scope;
    this.sources = scope.sources;
    this.repo = scope.objects;
  }

  static getInstance(scope: Scope): ScopeComponentsImporter {
    return new ScopeComponentsImporter(scope);
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
  async importMany(ids: BitIds, cache = true, throwForDependencyNotFound = false): Promise<VersionDependencies[]> {
    logger.debugAndAddBreadCrumb(
      'importMany',
      `cache ${cache}, throwForDependencyNotFound: ${throwForDependencyNotFound}. ids: {ids}`,
      {
        ids: ids.toString(),
      }
    );
    const idsToImport = compact(ids);
    if (R.isEmpty(idsToImport)) return [];

    const externalsToFetch: BitId[] = [];

    const compDefs = await this.sources.getMany(idsToImport, true);
    const existingDefs = compDefs.filter(({ id, component }) => {
      if (id.isLocal(this.scope.name)) {
        if (!component) throw new ComponentNotFound(id.toString());
        return true;
      }
      if (cache && component) return true;
      externalsToFetch.push(id);
      return false;
    });
    await this.findMissingExternalsRecursively(existingDefs, externalsToFetch);
    const uniqExternals = BitIds.uniqFromArray(externalsToFetch);
    logger.debug('importMany', `total missing externals: ${uniqExternals.length}`);
    const remotes = await getScopeRemotes(this.scope);
    // we don't care about the VersionDeps returned here as it may belong to the dependencies
    await this.getExternalMany(uniqExternals, remotes, throwForDependencyNotFound);
    const versionDeps = await this.bitIdsToVersionDeps(idsToImport);
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

  async importWithoutDeps(ids: BitIds, cache = true): Promise<ComponentVersion[]> {
    if (!ids.length) return [];
    logger.debugAndAddBreadCrumb('importWithoutDeps', `ids: {ids}`, {
      ids: ids.toString(),
    });

    const idsWithoutNils = removeNils(ids);
    if (R.isEmpty(idsWithoutNils)) return Promise.resolve([]);

    const [externals, locals] = splitBy(idsWithoutNils, (id) => id.isLocal(this.scope.name));

    const localDefs: ComponentDef[] = await this.sources.getMany(locals);
    const componentVersionArr = await Promise.all(
      localDefs.map((def) => {
        if (!def.component) {
          logger.warn(
            `importWithoutDeps failed to find a local component ${def.id.toString()}. continuing without this component`
          );
          return null;
        }
        return def.component.toComponentVersion(def.id.version as string);
      })
    );
    const remotes = await getScopeRemotes(this.scope);
    const externalDeps = await this.getExternalManyWithoutDeps(externals, remotes, cache);
    return [...compact(componentVersionArr), ...externalDeps];
  }

  async importManyWithAllVersions(
    ids: BitIds,
    cache = true,
    allDepsVersions = false // by default, only dependencies of the latest version are imported
  ): Promise<VersionDependencies[]> {
    logger.debug(`scope.getManyWithAllVersions, Ids: ${ids.join(', ')}`);
    Analytics.addBreadCrumb('getManyWithAllVersions', `scope.getManyWithAllVersions, Ids: ${Analytics.hashData(ids)}`);
    const idsWithoutNils = removeNils(ids);
    if (R.isEmpty(idsWithoutNils)) return Promise.resolve([]);
    const versionDependenciesArr: VersionDependencies[] = await this.importMany(idsWithoutNils, cache);

    const allIdsWithAllVersions = new BitIds();
    versionDependenciesArr.forEach((versionDependencies) => {
      const versions = versionDependencies.component.component.listVersions();
      const versionId = versionDependencies.component.id;
      const idsWithAllVersions = versions.map((version) => {
        if (version === versionDependencies.component.version) return null; // imported already
        return versionId.changeVersion(version);
      });
      allIdsWithAllVersions.push(...removeNils(idsWithAllVersions));
      const head = versionDependencies.component.component.getHead();
      if (head) {
        allIdsWithAllVersions.push(versionId.changeVersion(head.toString()));
      }
    });
    if (allDepsVersions) {
      const verDepsOfOlderVersions = await this.importMany(allIdsWithAllVersions, cache);
      versionDependenciesArr.push(...verDepsOfOlderVersions);
      const allFlattenDepsIds = versionDependenciesArr.map((v) => v.allDependencies.map((d) => d.id));
      const dependenciesOnly = R.flatten(allFlattenDepsIds).filter((id: BitId) => !ids.hasWithoutVersion(id));
      const verDepsOfAllFlattenDeps = await this.importManyWithAllVersions(BitIds.uniqFromArray(dependenciesOnly));
      versionDependenciesArr.push(...verDepsOfAllFlattenDeps);
    } else {
      await this.importWithoutDeps(allIdsWithAllVersions);
    }

    return versionDependenciesArr;
  }

  /**
   * delta between the local head and the remote head. mainly to improve performance
   * not applicable and won't work for legacy. for legacy, refer to importManyWithAllVersions
   */
  async importManyDeltaWithoutDeps(ids: BitIds): Promise<void> {
    logger.debugAndAddBreadCrumb('importManyDeltaWithoutDeps', `Ids: {ids}`, { ids: ids.toString() });
    const idsWithoutNils = BitIds.uniqFromArray(compact(ids));
    if (R.isEmpty(idsWithoutNils)) return;

    const compDef = await this.sources.getMany(idsWithoutNils.toVersionLatest(), true);
    const idsToFetch = await mapSeries(compDef, async ({ id, component }) => {
      if (!component) {
        // remove the version to fetch it with all versions.
        return id.changeVersion(undefined);
      }
      // @todo: fix to consider local lane
      const remoteLaneId = RemoteLaneId.from(DEFAULT_LANE, id.scope as string);
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
    const groupedIds = groupByScopeName(idsToFetch);
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
      },
      idsToFetch
    ).fetchFromRemoteAndWrite();
  }

  async importFromLanes(remoteLaneIds: RemoteLaneId[]): Promise<Lane[]> {
    const lanes = await this.importLanes(remoteLaneIds);
    const ids = lanes.map((lane) => lane.toBitIds());
    const bitIds = BitIds.uniqFromArray(R.flatten(ids));
    await this.importManyWithAllVersions(bitIds, false);
    return lanes;
  }

  async importLanes(remoteLaneIds: RemoteLaneId[]): Promise<Lane[]> {
    const remotes = await getScopeRemotes(this.scope);
    const objectsStreamPerRemote = await remotes.fetch(groupByScopeName(remoteLaneIds), this.scope, { type: 'lane' });
    const multipleStreams = Object.values(objectsStreamPerRemote);
    const bitObjects = await this.multipleStreamsToBitObjects(multipleStreams);
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
  async importManyObjects(groupedHashes: { [scopeName: string]: string[] }) {
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

    const bitObjectsList = await this.multipleStreamsToBitObjects(Object.values(multipleStreams));
    await this.repo.writeObjectsToTheFS(bitObjectsList.getAll());
  }

  async fetchWithoutDeps(ids: BitIds): Promise<ComponentVersion[]> {
    logger.debugAndAddBreadCrumb('fetchWithoutDeps', `ids: {ids}`, { ids: ids.toString() });
    this.throwIfExternalFound(ids);
    const localDefs: ComponentDef[] = await this.sources.getMany(ids);
    const componentVersionArr = await Promise.all(
      localDefs.map(({ id, component }) => {
        if (!component) {
          logger.warn(`fetchWithoutDeps failed finding a local component ${id.toString()}`);
          return null;
        }
        return component.toComponentVersion(id.version as string);
      })
    );
    return compact(componentVersionArr);
  }

  async fetchWithDeps(ids: BitIds): Promise<VersionDependencies[]> {
    logger.debugAndAddBreadCrumb('fetchWithDeps', `ids: {ids}`, { ids: ids.toString() });
    this.throwIfExternalFound(ids);
    // avoid race condition of getting multiple "fetch" requests, which later translates into
    // multiple getExternalMany calls, which saves objects and write refs files at the same time
    return this.fetchWithDepsMutex.runExclusive(async () => {
      logger.debug('fetchWithDeps, acquiring a lock');
      const localDefs: ComponentDef[] = await this.sources.getMany(ids);
      const versionDeps = await this.multipleCompsDefsToVersionDeps(localDefs);
      logger.debug('fetchWithDeps, releasing the lock');
      return versionDeps;
    });
  }

  async componentToVersionDependencies(component: ModelComponent, id: BitId): Promise<VersionDependencies | null> {
    const versionComp: ComponentVersion = component.toComponentVersion(id.version);

    const version = await this.getVersionFromComponentDef(component, id);
    if (!version) {
      // must be external, otherwise, it'd be thrown at getVersionFromComponentDef
      logger.debug(
        `toVersionDependencies, component ${component.id().toString()}, version ${
          versionComp.version
        } not found, going to fetch from a remote`
      );
      const remotes = await getScopeRemotes(this.scope);
      const versionDeps = await this.getExternalMany([id], remotes);
      return versionDeps.length ? versionDeps[0] : null;
    }

    logger.debug(
      `toVersionDependencies, component ${component.id().toString()}, version ${
        versionComp.version
      } found, going to collect its dependencies`
    );
    const dependencies = await this.importWithoutDeps(version.flattenedDependencies);
    return new VersionDependencies(versionComp, dependencies, version);
  }

  /**
   * get ConsumerComponent by bitId. if the component was not found locally, import it from a remote scope
   */
  async loadRemoteComponent(id: BitId): Promise<ConsumerComponent> {
    const component = await this._getComponentVersion(id);
    if (!component) throw new ComponentNotFound(id.toString());
    return component.toConsumer(this.scope.objects, null);
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
    const remotes = await getScopeRemotes(this.scope);
    let bitObjectsList: BitObjectList;
    try {
      const streams = await remotes.fetch({ [id.scope as string]: [id.toString()] }, this.scope);
      bitObjectsList = await this.multipleStreamsToBitObjects(Object.values(streams));
    } catch (err) {
      return null; // probably doesn't exist
    }

    return bitObjectsList;
  }

  private async multipleStreamsToBitObjects(streams: ObjectItemsStream[]): Promise<BitObjectList> {
    const objectListPerRemote = await Promise.all(streams.map((stream) => ObjectList.fromReadableStream(stream)));
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

  private async multipleCompsDefsToVersionDeps(compsDefs: ComponentDef[]): Promise<VersionDependencies[]> {
    const concurrency = concurrentComponentsLimit();
    const componentsWithVersionsWithNulls = await pMap(
      compsDefs,
      async ({ component, id }) => {
        if (!component) return null;
        if (component.isEmpty() && !id.hasVersion() && !component.laneHeadLocal) {
          // this happens for example when importing a remote lane and then running "bit fetch --components"
          // the head is empty because it exists on the lane only, it was never tagged and
          // laneHeadLocal was never set as it originated from the scope, not the consumer.
          return null;
        }
        const versionComp: ComponentVersion = component.toComponentVersion(id.version);
        const version = await this.getVersionFromComponentDef(component, id);
        if (!version) {
          throw new Error(`ScopeComponentImporter, expect ${id.toString()} to have a Version object`);
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

    const compVersionsOfDeps = await this.importWithoutDeps(idsToFetch);

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
    throwForDependencyNotFound = false
  ): Promise<VersionDependencies[]> {
    if (!ids.length) return [];
    logger.debugAndAddBreadCrumb('ScopeComponentsImporter.getExternalMany', `fetching from remote scope. Ids: {ids}`, {
      ids: ids.join(', '),
    });
    const context = {};
    ids.forEach((id) => {
      if (id.isLocal(this.scope.name))
        throw new Error(`getExternalMany expects to get external ids only, got ${id.toString()}`);
    });
    enrichContextFromGlobal(Object.assign({}, { requestedBitIds: ids.map((id) => id.toString()) }));
    await new ObjectFetcher(
      this.repo,
      this.scope,
      remotes,
      {
        withoutDependencies: false,
      },
      ids,
      context
    ).fetchFromRemoteAndWrite();
    const componentDefs = await this.sources.getMany(ids);
    const versionDeps = await this.multipleCompsDefsToVersionDeps(componentDefs);
    if (throwForDependencyNotFound) {
      versionDeps.forEach((verDep) => verDep.throwForMissingDependencies());
    }
    return versionDeps;
  }

  private async getExternalManyWithoutDeps(
    ids: BitId[],
    remotes: Remotes,
    localFetch = false,
    context: Record<string, any> = {}
  ): Promise<ComponentVersion[]> {
    if (!ids.length) return [];
    logger.debugAndAddBreadCrumb('getExternalManyWithoutDeps', `ids: {ids}, localFetch: ${localFetch.toString()}`, {
      ids: ids.join(', '),
    });
    const defs: ComponentDef[] = await this.sources.getMany(ids, true);
    const left = defs.filter((def) => !localFetch || !def.component);
    if (left.length === 0) {
      logger.debugAndAddBreadCrumb('getExternalManyWithoutDeps', 'no more ids left, all found locally');
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      return Promise.all(defs.map((def) => def.component.toComponentVersion(def.id.version)));
    }
    logger.debugAndAddBreadCrumb('getExternalManyWithoutDeps', `${left.length} left. Fetching them from a remote`);
    enrichContextFromGlobal(Object.assign(context, { requestedBitIds: ids.map((id) => id.toString()) }));
    await new ObjectFetcher(
      this.repo,
      this.scope,
      remotes,
      {
        withoutDependencies: true,
      },
      left.map((def) => def.id),
      context
    ).fetchFromRemoteAndWrite();

    const finalDefs: ComponentDef[] = await this.sources.getMany(ids);

    return Promise.all(
      finalDefs
        .filter((def) => def.component) // @todo: should we warn about the non-missing?
        // @ts-ignore
        .map((def) => def.component.toComponentVersion(def.id.version))
    );
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
      // $FlowFixMe version is set
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
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
      const version = await this.getVersionFromComponentDef(component, id);
      if (!version) {
        // it must be external. otherwise, getVersionFromComponentDef would throw
        externalsToFetch.push(id);
        return;
      }
      const flattenedDepsToLocate = version.flattenedDependencies.filter((dep) => !existingCache.has(dep));
      const flattenedDepsDefs = await this.sources.getMany(flattenedDepsToLocate, true);
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
      const directDepsDefs = await this.sources.getMany(version.getAllDependenciesIds(), true);
      compDefsForNextIteration.push(...directDepsDefs);
    });

    await this.findMissingExternalsRecursively(compDefsForNextIteration, externalsToFetch, visited, existingCache);
  }

  /**
   * convert ids to VersionDependencies with performance in mind.
   * it doesn't go to any remote and it fetches each component only once.
   */
  private async bitIdsToVersionDeps(ids: BitId[]): Promise<VersionDependencies[]> {
    logger.debug(`bitIdsToVersionDeps, ${ids.length} ids`);
    const compDefs = await this.sources.getMany(ids);
    const versionDepsWithNulls = await mapSeries(compDefs, async ({ component, id }) => {
      if (!component) throw new ComponentNotFound(id.toString());
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

export function groupByScopeName(ids: Array<BitId | RemoteLaneId>): { [scopeName: string]: string[] } {
  const grouped = groupArray(ids, 'scope');
  Object.keys(grouped).forEach((scopeName) => {
    grouped[scopeName] = grouped[scopeName].map((id) => id.toString());
  });
  return grouped;
}
