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
   * 1. Local objects, fetch from local. (done by this.sources.getMany method)
   * 2. Fetch flattened dependencies (done by toVersionDependencies method). If they're not locally, fetch from remote
   * and save them locally.
   * 3. External objects, fetch from a remote and save locally. (done by this._getExternalMany method).
   */
  async importMany(ids: BitIds, cache = true, persist = true): Promise<VersionDependencies[]> {
    logger.debugAndAddBreadCrumb('ScopeComponentsImporter', `importMany: cache ${cache}, ids: {ids}`, {
      ids: ids.toString(),
    });
    const idsWithoutNils = removeNils(ids);
    if (R.isEmpty(idsWithoutNils)) return Promise.resolve([]);

    const [locals, externals] = R.partition((id: BitId) => id.isLocal(this.scope.name), idsWithoutNils);

    const localDefs = await this.sources.getMany(locals);
    const versionDeps = await mapSeries(localDefs, async (def) => {
      if (!def.component) throw new ComponentNotFound(def.id.toString());
      const results = await this.componentToVersionDependencies(def.component, def.id);
      return results;
    });
    const versionDepsWithoutNull = removeNils(versionDeps);
    logger.debugAndAddBreadCrumb(
      'ScopeComponentsImporter',
      'importMany: successfully fetched local components and their dependencies. Going to fetch externals'
    );
    const remotes = await getScopeRemotes(this.scope);

    if (cache) {
      const componentDefs = await this.sources.getMany(externals);
      const found = componentDefs.filter((componentDef) => componentDef.component);
      let externalsVersionDeps;
      if (found.length) {
        try {
          externalsVersionDeps = await mapSeries(componentDefs, (compDef) =>
            this.componentToVersionDependencies(compDef.component as ModelComponent, compDef.id)
          );
        } catch (err) {
          const externalDeps = await this._getExternalMany(externals, remotes, false, persist);
          return versionDepsWithoutNull.concat(externalDeps);
        }
        const externalsVersionDepsWithoutNull = removeNils(externalsVersionDeps);
        versionDepsWithoutNull.push(...externalsVersionDepsWithoutNull);
        const notFound = componentDefs
          .filter((componentDef) => !componentDef.component)
          .map((componentDef) => componentDef.id);
        const externalDeps = await this._getExternalMany(notFound, remotes, false, persist);
        return versionDepsWithoutNull.concat(externalDeps);
      }
    }

    const externalDeps = await this._getExternalMany(externals, remotes, cache, persist);
    return versionDepsWithoutNull.concat(externalDeps);
  }

  async importManyWithoutDependencies(ids: BitIds, cache = true): Promise<ComponentVersion[]> {
    if (!ids.length) return [];
    logger.debug(`importManyWithoutDependencies. Ids: ${ids.join(', ')}, cache: ${cache.toString()}`);
    Analytics.addBreadCrumb('importManyWithoutDependencies', `Ids: ${Analytics.hashData(ids)}`);

    const idsWithoutNils = removeNils(ids);
    if (R.isEmpty(idsWithoutNils)) return Promise.resolve([]);

    const [externals, locals] = splitBy(idsWithoutNils, (id) => id.isLocal(this.scope.name));

    const localDefs: ComponentDef[] = await this.sources.getMany(locals);
    const componentVersionArr = await Promise.all(
      localDefs.map((def) => {
        // if (!def.component) throw new ComponentNotFound(def.id.toString());
        if (!def.component) return null;
        return def.component.toComponentVersion(def.id.version as string);
      })
    );
    const remotes = await getScopeRemotes(this.scope);
    const externalDeps = await this._getExternalManyWithoutDeps(externals, remotes, cache);
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
      await this.importManyWithoutDependencies(allIdsWithAllVersions);
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
    const objectList = await remotes.fetch(groupByScopeName(remoteLaneIds), this.scope, { type: 'lane' });
    const bitObjects = await objectList.toBitObjects();
    const lanes = bitObjects.getLanes();
    await Promise.all(
      lanes.map((lane) => this.scope.objects.remoteLanes.syncWithLaneObject(lane.scope as string, lane))
    );
    return lanes;
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
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    const versionComp: ComponentVersion = component.toComponentVersion(id.version);
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    const source: string = id.scope;
    const version: Version = await versionComp.getVersion(this.scope.objects);
    if (!version) {
      logger.debug(
        `toVersionDependencies, component ${component.id().toString()}, version ${
          versionComp.version
        } not found, going to fetch from a remote`
      );
      if (component.scope === this.scope.name) {
        // it should have been fetched locally, since it wasn't found, this is an error
        throw new ShowDoctorError(
          `Version ${versionComp.version} of ${component.id().toString()} was not found in scope ${this.scope.name}`
        );
      }
      return getScopeRemotes(this.scope).then((remotes) => {
        return this._getExternal({ id, remotes, localFetch: false });
      });
    }

    logger.debug(
      `toVersionDependencies, component ${component.id().toString()}, version ${
        versionComp.version
      } found, going to collect its dependencies`
    );
    const dependencies = await this.importManyWithoutDependencies(version.flattenedDependencies);

    return new VersionDependencies(versionComp, dependencies, [], [], source);
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
   * recursive function.
   * if found locally, use them. Otherwise, fetch from remote and then, save into the model.
   */
  async _getExternalMany(
    ids: BitId[],
    remotes: Remotes,
    localFetch = true,
    persist = true,
    context: Record<string, any> = {}
  ): Promise<VersionDependencies[]> {
    if (!ids.length) return Promise.resolve([]);
    logger.debugAndAddBreadCrumb(
      'scope.getExternalMan',
      `planning on fetching from ${localFetch ? 'local' : 'remote'} scope. Ids: {ids}`,
      { ids: ids.join(', ') }
    );
    enrichContextFromGlobal(Object.assign(context, { requestedBitIds: ids.map((id) => id.toString()) }));
    const componentDefs = await this.sources.getMany(ids);
    const left = componentDefs.filter((componentDef) => !localFetch || !componentDef.component);
    if (left.length === 0) {
      logger.debugAndAddBreadCrumb('scope.getExternalMany', 'no more ids left, all found locally, exiting the method');
      const versionDeps = await mapSeries(componentDefs, (compDef) =>
        this.componentToVersionDependencies(compDef.component as ModelComponent, compDef.id)
      );
      return removeNils(versionDeps);
    }
    logger.debugAndAddBreadCrumb('scope.getExternalMany', `${left.length} left. Fetching them from a remote`);
    const objectList = await remotes.fetch(
      groupByScopeName(left.map((defLeft) => defLeft.id)),
      this.scope,
      undefined,
      context
    );
    logger.debugAndAddBreadCrumb('scope.getExternalMany', 'writing them to the model');
    const nonLaneIds = await this.scope.writeManyComponentsToModel(objectList, persist, ids);

    const componentDefsFinal = await this.sources.getMany(nonLaneIds);
    const componentDefsFinalExisting = componentDefsFinal.filter((componentDef) => componentDef.component);
    logger.debugAndAddBreadCrumb('scope.getExternalMany', 'no more ids left, all found locally, exiting the method');
    const versionDeps = await mapSeries(componentDefsFinalExisting, (compDef) =>
      this.componentToVersionDependencies(compDef.component as ModelComponent, compDef.id)
    );
    return removeNils(versionDeps);
  }

  /**
   * If the component is not in the local scope, fetch it from a remote and save into the local
   * scope. (objects directory).
   */
  async _getExternal({
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
    const objectList = await remotes.fetch(groupByScopeName([id]), this.scope, undefined, context);
    await this.scope.writeManyComponentsToModel(objectList, true, [id]);
    return this._getExternal({ id, remotes, localFetch: true });
  }

  async _getExternalWithoutDependencies({
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
    const objectList = await remotes.fetch(groupByScopeName([id]), this.scope, { withoutDependencies: true }, context);
    await this.scope.writeManyComponentsToModel(objectList, true, [id]);
    const versionDependencies = await this._getExternal({ id, remotes, localFetch: true });
    return versionDependencies.component;
  }

  async _getExternalManyWithoutDeps(
    ids: BitId[],
    remotes: Remotes,
    localFetch = false,
    context: Record<string, any> = {}
  ): Promise<ComponentVersion[]> {
    if (!ids.length) return Promise.resolve([]);
    logger.debugAndAddBreadCrumb('_getExternalManyWithoutDeps', `ids: {ids}, localFetch: ${localFetch.toString()}`, {
      ids: ids.join(', '),
    });
    const defs: ComponentDef[] = await this.sources.getMany(ids);
    const left = defs.filter((def) => !localFetch || !def.component);
    if (left.length === 0) {
      logger.debugAndAddBreadCrumb('_getExternalManyWithoutDeps', 'no more ids left, all found locally');
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      return Promise.all(defs.map((def) => def.component.toComponentVersion(def.id.version)));
    }
    logger.debugAndAddBreadCrumb('_getExternalManyWithoutDeps', `${left.length} left. Fetching them from a remote`);
    enrichContextFromGlobal(Object.assign(context, { requestedBitIds: ids.map((id) => id.toString()) }));
    const objectList = await remotes.fetch(
      groupByScopeName(left.map((def) => def.id)),
      this.scope,
      { withoutDependencies: true },
      context
    );
    const nonLaneIds = await this.scope.writeManyComponentsToModel(objectList, undefined, ids);

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
      return this._getExternalWithoutDependencies({ id, remotes, localFetch: true });
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
    const objectList = await remotes.fetch(groupedHashedMissing, this.scope, { type: 'object' });
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
