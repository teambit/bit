import { filter } from 'bluebird';
import mapSeries from 'p-map-series';
import groupArray from 'group-array';
import R from 'ramda';
import { compact } from 'lodash';
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
import { Ref } from '../objects';
import { ObjectItem } from '../objects/object-list';
import SourcesRepository, { ComponentDef } from '../repositories/sources';
import { getScopeRemotes } from '../scope-remotes';
import VersionDependencies from '../version-dependencies';

const removeNils = R.reject(R.isNil);

export default class ScopeComponentsImporter {
  scope: Scope;
  sources: SourcesRepository;
  constructor(scope: Scope) {
    if (!scope) throw new Error('unable to instantiate ScopeComponentsImporter without Scope');
    this.scope = scope;
    this.sources = scope.sources;
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
   *
   *
   */
  async importMany(
    ids: BitIds,
    cache = true,
    persist = true,
    throwForDependencyNotFound = false
  ): Promise<VersionDependencies[]> {
    logger.debugAndAddBreadCrumb(
      'ScopeComponentsImporter.importMany',
      `cache ${cache}, throwForDependencyNotFound: ${throwForDependencyNotFound}. ids: {ids}`,
      {
        ids: ids.toString(),
      }
    );
    const idsToImport = compact(ids);
    if (R.isEmpty(idsToImport)) return [];

    const externalsToFetch: BitId[] = [];

    const compDefs = await this.sources.getMany(idsToImport);
    const existingDefs = compDefs.filter(({ id, component }) => {
      if (id.isLocal(this.scope.name)) {
        if (!component) throw new ComponentNotFound(id.toString());
        return true;
      }
      if (cache && component) return true;
      externalsToFetch.push(id);
      return false;
    });

    const visited: string[] = [];
    const existingCache = new BitIds();
    await mapSeries(existingDefs, async (compDef) =>
      this.findMissingExternalsRecursively(compDef, externalsToFetch, visited, existingCache)
    );

    logger.debugAndAddBreadCrumb(
      'ScopeComponentsImporter.importMany',
      `fetched local components and their dependencies. Going to fetch externals`
    );
    const remotes = await getScopeRemotes(this.scope);
    // we don't care about the VersionDeps returned here as it may belong to the dependencies
    await this.getExternalMany(BitIds.uniqFromArray(externalsToFetch), remotes, persist, throwForDependencyNotFound);

    const compDefsFinal = await this.sources.getMany(idsToImport);
    const versionDeps = await mapSeries(compDefsFinal, (compDef) => {
      if (!compDef.component) throw new ComponentNotFound(compDef.id.toString());
      return this.componentToVersionDependencies(compDef.component, compDef.id);
    });
    return compact(versionDeps);
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
    compDef: ComponentDef,
    externalsToFetch: BitId[],
    visited: string[],
    existingCache: BitIds
  ): Promise<void> {
    const idStr = compDef.id.toString();
    if (visited.includes(idStr)) return;
    logger.debug(`findMissingExternalsRecursively, component ${compDef.id.toString()}`);
    visited.push(idStr);
    const version = await this.getVersionFromComponentDef(compDef.component as ModelComponent, compDef.id);
    if (!version) {
      // it must be external. otherwise, getVersionFromComponentDef would throw
      externalsToFetch.push(compDef.id);
      return;
    }
    const flattenedDepsToLocate = version.flattenedDependencies.filter((id) => !existingCache.has(id));
    const flattenedDepsDefs = await this.sources.getMany(flattenedDepsToLocate);
    const existingFlattened = BitIds.fromArray(flattenedDepsDefs.filter((def) => def.component).map((def) => def.id));
    const allFlattenedExist = flattenedDepsDefs.every((def) => {
      if (!def.component) return false;
      existingCache.push(def.id);
      return true;
    });
    if (allFlattenedExist) {
      return;
    }
    // some flattened are missing
    if (!compDef.id.isLocal(this.scope.name)) {
      externalsToFetch.push(compDef.id);
      return;
    }
    const directDepsDefs = await this.sources.getMany(version.getAllDependenciesIds());
    const localMissingDepDefs: ComponentDef[] = [];
    await Promise.all(
      directDepsDefs.map(async (depDef) => {
        if (!depDef.component) {
          if (depDef.id.isLocal(this.scope.name)) throw new ComponentNotFound(depDef.id.toString());
          externalsToFetch.push(depDef.id);
          return;
        }
        const versionDep = await this.getVersionFromComponentDef(depDef.component as ModelComponent, depDef.id);
        if (!versionDep) {
          // it must be external. otherwise, getVersionFromComponentDef would throw
          externalsToFetch.push(compDef.id);
          return;
        }
        const hasMissingFlattened = versionDep.flattenedDependencies.some((d) => !existingFlattened.has(d));
        if (!hasMissingFlattened) return; // all exist
        if (depDef.id.isLocal(this.scope.name)) {
          localMissingDepDefs.push(depDef);
        } else {
          externalsToFetch.push(compDef.id);
        }
      })
    );
    await mapSeries(localMissingDepDefs, (depDef) =>
      this.findMissingExternalsRecursively(depDef, externalsToFetch, visited, existingCache)
    );
  }

  async fetchWithDeps(ids: BitIds): Promise<VersionDependencies[]> {
    if (!ids.length) return [];
    logger.debugAndAddBreadCrumb('ScopeComponentsImporter.fetchWithDependencies', `ids: {ids}`, {
      ids: ids.toString(),
    });

    const idsWithoutNils = compact(ids);
    if (!idsWithoutNils.length) return [];

    const [externals, locals] = splitBy(idsWithoutNils, (id) => id.isLocal(this.scope.name));

    if (externals.length) {
      const externalStr = externals.map((id) => id.toString()).join(', ');
      // we can't support fetching-with-dependencies of external components as we risk going into an infinite loop
      throw new Error(`fatal: fetch-with-dependencies API does not support fetching components from different scopes.
current scope: "${this.scope.name}", externals: "${externalStr}"
please make sure that the scope-resolver points to the right scope.`);
    }

    const localDefs: ComponentDef[] = await this.sources.getMany(locals);
    const versionDeps = await mapSeries(localDefs, async (compDef) => {
      if (!compDef.component) return null;
      return this.componentToVersionDependencies(compDef.component as ModelComponent, compDef.id);
    });
    return compact(versionDeps);
  }

  async fetchWithoutDeps(ids: BitIds, cache = true): Promise<ComponentVersion[]> {
    if (!ids.length) return [];
    logger.debugAndAddBreadCrumb('ScopeComponentsImporter.fetchWithoutDependencies', `ids: {ids}`, {
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
            `fetchWithoutDeps failed to find a local component ${def.id.toString()}. continuing without this component`
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

  /**
   * todo: improve performance by finding all versions needed and fetching them in one request from the server
   * currently it goes to the server twice. First, it asks for the last version of each id, and then it goes again to
   * ask for the older versions.
   */
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
      await this.fetchWithoutDeps(allIdsWithAllVersions);
    }

    return versionDependenciesArr;
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
    const { objectList } = await remotes.fetch(groupByScopeName(remoteLaneIds), this.scope, { type: 'lane' });
    const bitObjects = await objectList.toBitObjects();
    const lanes = bitObjects.getLanes();
    await Promise.all(
      lanes.map((lane) => this.scope.objects.remoteLanes.syncWithLaneObject(lane.scope as string, lane))
    );
    return lanes;
  }

  async getVersionFromComponentDef(component: ModelComponent, id: BitId): Promise<Version | null> {
    const versionComp: ComponentVersion = component.toComponentVersion(id.version);
    const version = await versionComp.getVersion(this.scope.objects, false);
    if (version) return version;
    if (component.scope === this.scope.name) {
      // it should have been fetched locally, since it wasn't found, this is an error
      throw new ShowDoctorError(
        `Version ${versionComp.version} of ${component.id().toString()} was not found in scope ${this.scope.name}`
      );
    }
    return null;
  }

  async componentToVersionDependencies(
    component: ModelComponent,
    id: BitId,
    throwForNoVersion = false
  ): Promise<VersionDependencies | null> {
    if (!throwForNoVersion) {
      if (component.isEmpty() && !id.hasVersion() && !component.laneHeadLocal) {
        // this happens for example when importing a remote lane and then running "bit fetch --components"
        // the head is empty because it exists on the lane only, it was never tagged and
        // laneHeadLocal was never set as it originated from the scope, not the consumer.
        return null;
      }
    }
    const versionComp: ComponentVersion = component.toComponentVersion(id.version as string);

    const version = await this.getVersionFromComponentDef(component, id);
    if (!version) {
      logger.debug(
        `toVersionDependencies, component ${component.id().toString()}, version ${
          versionComp.version
        } not found, going to fetch from a remote`
      );
      const remotes = await getScopeRemotes(this.scope);
      return this.getExternal({ id, remotes, localFetch: false });
    }

    logger.debug(
      `toVersionDependencies, component ${component.id().toString()}, version ${
        versionComp.version
      } found, going to collect its dependencies`
    );
    const dependencies = await this.fetchWithoutDeps(version.flattenedDependencies);
    const source = id.scope as string;
    return new VersionDependencies(versionComp, dependencies, source, version);
  }

  async componentsToComponentsObjects(
    components: Array<VersionDependencies | ComponentVersion>,
    clientVersion: string | null | undefined,
    collectParents: boolean,
    collectArtifacts: boolean
  ): Promise<ObjectItem[]> {
    const allObject = await mapSeries(components, (component) =>
      component.toObjects(this.scope.objects, clientVersion, collectParents, collectArtifacts)
    );
    return R.flatten(allObject);
  }

  /**
   * get ConsumerComponent by bitId. if the component was not found locally, import it from a remote scope
   */
  loadRemoteComponent(id: BitId): Promise<ConsumerComponent> {
    return this._getComponentVersion(id).then((component) => {
      if (!component) throw new ComponentNotFound(id.toString());
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      return component.toConsumer(this.scope.objects);
    });
  }

  loadComponent(id: BitId, localOnly = true): Promise<ConsumerComponent> {
    logger.debugAndAddBreadCrumb('ScopeComponentsImporter', 'loadComponent {id}', { id: id.toString() });

    if (localOnly && !id.isLocal(this.scope.name)) {
      throw new GeneralError('cannot load a component from remote scope, please import first');
    }
    return this.loadRemoteComponent(id);
  }

  /**
   * never checks if exist locally. always fetches from remote and then, save into the model.
   */
  private async getExternalMany(
    ids: BitId[],
    remotes: Remotes,
    persist = true,
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
    const { objectListPerRemote } = await remotes.fetch(groupByScopeName(ids), this.scope, undefined, context);
    logger.debugAndAddBreadCrumb('ScopeComponentsImporter.getExternalMany', 'writing them to the model');
    const nonLaneIds = await this.scope.writeManyObjectListToModel(objectListPerRemote, persist, ids);
    const componentDefs = await this.sources.getMany(nonLaneIds);
    const componentDefsExisting = componentDefs.filter((componentDef) => componentDef.component);
    const versionDeps = await mapSeries(componentDefsExisting, (compDef) =>
      this.componentToVersionDependencies(compDef.component as ModelComponent, compDef.id)
    );
    const versionDepsNoNull = compact(versionDeps);
    if (throwForDependencyNotFound) {
      versionDepsNoNull.forEach((verDep) => verDep.throwForMissingDependencies());
    }
    return versionDepsNoNull;
  }

  /**
   * fetch from external with dependencies.
   * if the component is not in the local scope, fetch it from a remote and save into the local
   * scope. (objects directory).
   */
  private async getExternal({
    id,
    remotes,
    localFetch = true,
    context = {},
  }: {
    id: BitId;
    remotes: Remotes;
    localFetch: boolean;
    context?: Record<string, any>;
  }): Promise<VersionDependencies> {
    enrichContextFromGlobal(context);
    const component = await this.sources.get(id);
    if (component && localFetch) {
      const versionDeps = await this.componentToVersionDependencies(component, id, true);
      return versionDeps as VersionDependencies;
    }
    const { objectList } = await remotes.fetch(groupByScopeName([id]), this.scope, undefined, context);
    await this.scope.writeObjectListToModel(objectList, id.scope as string, true, [id]);
    return this.getExternal({ id, remotes, localFetch: true });
  }

  private async getExternalWithoutDependencies({
    id,
    remotes,
    localFetch = true,
    context = {},
  }: {
    id: BitId;
    remotes: Remotes;
    localFetch: boolean;
    context?: Record<string, any>;
  }): Promise<ComponentVersion> {
    const component = await this.sources.get(id);
    if (component && localFetch) {
      return component.toComponentVersion(id.version as string);
    }
    const { objectList } = await remotes.fetch(
      groupByScopeName([id]),
      this.scope,
      { withoutDependencies: true },
      context
    );
    await this.scope.writeObjectListToModel(objectList, id.scope as string, true, [id]);
    const versionDependencies = await this.getExternal({ id, remotes, localFetch: true });
    return versionDependencies.component;
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
    const defs: ComponentDef[] = await this.sources.getMany(ids);
    const left = defs.filter((def) => !localFetch || !def.component);
    if (left.length === 0) {
      logger.debugAndAddBreadCrumb('getExternalManyWithoutDeps', 'no more ids left, all found locally');
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      return Promise.all(defs.map((def) => def.component.toComponentVersion(def.id.version)));
    }
    logger.debugAndAddBreadCrumb('getExternalManyWithoutDeps', `${left.length} left. Fetching them from a remote`);
    enrichContextFromGlobal(Object.assign(context, { requestedBitIds: ids.map((id) => id.toString()) }));
    const { objectListPerRemote } = await remotes.fetch(
      groupByScopeName(left.map((def) => def.id)),
      this.scope,
      { withoutDependencies: true },
      context
    );
    const nonLaneIds = await this.scope.writeManyObjectListToModel(objectListPerRemote, true, ids);

    const finalDefs: ComponentDef[] = await this.sources.getMany(nonLaneIds);

    return Promise.all(
      finalDefs
        .filter((def) => def.component) // @todo: should we warn about the non-missing?
        // @ts-ignore
        .map((def) => def.component.toComponentVersion(def.id.version))
    );
  }

  async _getComponentVersion(id: BitId): Promise<ComponentVersion> {
    if (!id.isLocal(this.scope.name)) {
      const remotes = await getScopeRemotes(this.scope);
      return this.getExternalWithoutDependencies({ id, remotes, localFetch: true });
    }

    return this.sources.get(id).then((component) => {
      if (!component) throw new ComponentNotFound(id.toString());
      // $FlowFixMe version is set
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      return component.toComponentVersion(id.version);
    });
  }

  /**
   * currently used for import artifacts, but can be used to import any arbitrary array of hashes.
   * it takes care to remove any duplications and check whether the object exists locally before
   * going to the remote
   */
  async importManyObjects(groupedHashes: { [scopeName: string]: string[] }) {
    const groupedHashedMissing = {};
    await Promise.all(
      Object.keys(groupedHashes).map(async (scopeName) => {
        const uniqueHashes: string[] = R.uniq(groupedHashes[scopeName]);
        const missing = await filter(uniqueHashes, async (hash) => !(await this.scope.objects.has(new Ref(hash))));
        if (missing.length) {
          groupedHashedMissing[scopeName] = missing;
        }
      })
    );
    if (R.isEmpty(groupedHashedMissing)) return;
    const remotes = await getScopeRemotes(this.scope);
    const { objectList } = await remotes.fetch(groupedHashedMissing, this.scope, { type: 'object' });
    const bitObjectsList = await objectList.toBitObjects();
    this.scope.objects.addMany(bitObjectsList.getAll());
    await this.scope.objects.persist();
  }
}

function groupByScopeName(ids: Array<BitId | RemoteLaneId>): { [scopeName: string]: string[] } {
  const grouped = groupArray(ids, 'scope');
  Object.keys(grouped).forEach((scopeName) => {
    grouped[scopeName] = grouped[scopeName].map((id) => id.toString());
  });
  return grouped;
}
