import R from 'ramda';
import pMapSeries from 'p-map-series';
import { Scope } from '..';
import { Remotes } from '../../remotes';
import enrichContextFromGlobal from '../../hooks/utils/enrich-context-from-global';
import { BitId, BitIds } from '../../bit-id';
import VersionDependencies from '../version-dependencies';
import logger from '../../logger/logger';
import { RemoteScopeNotFound, PermissionDenied } from '../network/exceptions';
import { ComponentNotFound, DependencyNotFound } from '../exceptions';
import { Analytics } from '../../analytics/analytics';
import SourcesRepository, { ComponentDef } from '../repositories/sources';
import ComponentVersion from '../component-version';
import ComponentObjects from '../component-objects';
import GeneralError from '../../error/general-error';
import { getScopeRemotes } from '../scope-remotes';
import ConsumerComponent from '../../consumer/component';
import { splitBy } from '../../utils';
import { ModelComponent, Version } from '../models';
import ShowDoctorError from '../../error/show-doctor-error';

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
   * 3. External objects, fetch from a remote and save locally. (done by this.getExternalOnes method).
   */
  async importMany(ids: BitIds, cache = true, persist = true): Promise<VersionDependencies[]> {
    logger.debugAndAddBreadCrumb('ScopeComponentsImporter', 'importMany: {ids}', { ids: ids.toString() });
    const idsWithoutNils = removeNils(ids);
    if (R.isEmpty(idsWithoutNils)) return Promise.resolve([]);

    const [locals, externals] = R.partition(id => id.isLocal(this.scope.name), idsWithoutNils);

    const localDefs = await this.sources.getMany(locals);
    const versionDeps = await pMapSeries(localDefs, def => {
      if (!def.component) throw new ComponentNotFound(def.id.toString());
      return this.componentToVersionDependencies(def.component, def.id);
    });
    logger.debugAndAddBreadCrumb(
      'ScopeComponentsImporter',
      'importMany: successfully fetched local components and their dependencies. Going to fetch externals'
    );
    const remotes = await getScopeRemotes(this.scope);
    const externalDeps = await this._getExternalMany(externals, remotes, cache, persist);
    return versionDeps.concat(externalDeps);
  }

  async importManyWithoutDependencies(ids: BitIds, cache = true): Promise<ComponentVersion[]> {
    if (!ids.length) return [];
    logger.debug(`importManyWithoutDependencies. Ids: ${ids.join(', ')}, cache: ${cache.toString()}`);
    Analytics.addBreadCrumb('importManyWithoutDependencies', `Ids: ${Analytics.hashData(ids)}`);

    const idsWithoutNils = removeNils(ids);
    if (R.isEmpty(idsWithoutNils)) return Promise.resolve([]);

    const [externals, locals] = splitBy(idsWithoutNils, id => id.isLocal(this.scope.name));

    const localDefs: ComponentDef[] = await this.sources.getMany(locals);
    const componentVersionArr = await Promise.all(
      localDefs.map(def => {
        if (!def.component) throw new ComponentNotFound(def.id.toString());
        // $FlowFixMe it must have a version
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        return def.component.toComponentVersion(def.id.version);
      })
    );
    const remotes = await getScopeRemotes(this.scope);
    const externalDeps = await this._getExternalManyWithoutDependencies(externals, remotes, cache);
    return componentVersionArr.concat(externalDeps);
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
    versionDependenciesArr.forEach(versionDependencies => {
      const versions = versionDependencies.component.component.listVersions();
      const idsWithAllVersions = versions.map(version => {
        if (version === versionDependencies.component.version) return null; // imported already
        const versionId = versionDependencies.component.id;
        return versionId.changeVersion(version);
      });
      allIdsWithAllVersions.push(...removeNils(idsWithAllVersions));
    });
    if (allDepsVersions) {
      const verDepsOfOlderVersions = await this.importMany(allIdsWithAllVersions, cache);
      versionDependenciesArr.push(...verDepsOfOlderVersions);
      const allFlattenDepsIds = versionDependenciesArr.map(v => v.allDependencies.map(d => d.id));
      const dependenciesOnly = R.flatten(allFlattenDepsIds).filter((id: BitId) => !ids.hasWithoutVersion(id));
      const verDepsOfAllFlattenDeps = await this.importManyWithAllVersions(BitIds.uniqFromArray(dependenciesOnly));
      versionDependenciesArr.push(...verDepsOfAllFlattenDeps);
    } else {
      await this.importManyWithoutDependencies(allIdsWithAllVersions);
    }

    return versionDependenciesArr;
  }

  importDependencies(dependencies: BitIds): Promise<VersionDependencies[]> {
    return new Promise((resolve, reject) => {
      return this.importMany(dependencies)
        .then(resolve)
        .catch(e => {
          logger.error(`importDependencies got an error: ${JSON.stringify(e)}`);
          if (e instanceof RemoteScopeNotFound || e instanceof PermissionDenied) return reject(e);
          return reject(new DependencyNotFound(e.id));
        });
    });
  }

  async componentToVersionDependencies(component: ModelComponent, id: BitId): Promise<VersionDependencies> {
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
      return getScopeRemotes(this.scope).then(remotes => {
        return this._getExternal({ id, remotes, localFetch: false });
      });
    }

    logger.debug(
      `toVersionDependencies, component ${component.id().toString()}, version ${
        versionComp.version
      } found, going to collect its dependencies`
    );
    const dependencies = await this.importManyWithoutDependencies(version.flattenedDependencies);
    const devDependencies = await this.importManyWithoutDependencies(version.flattenedDevDependencies);
    const compilerDependencies = await this.importManyWithoutDependencies(version.flattenedCompilerDependencies);
    const testerDependencies = await this.importManyWithoutDependencies(version.flattenedTesterDependencies);
    const extensionsDependencies = await this.importManyWithoutDependencies(version.extensions.extensionsBitIds);

    return new VersionDependencies(
      versionComp,
      dependencies,
      devDependencies,
      compilerDependencies,
      testerDependencies,
      extensionsDependencies,
      source
    );
  }

  componentsToComponentsObjects(
    components: Array<VersionDependencies | ComponentVersion>,
    clientVersion: string | null | undefined
  ): Promise<ComponentObjects[]> {
    return pMapSeries(components, component => component.toObjects(this.scope.objects, clientVersion));
  }

  /**
   * get ConsumerComponent by bitId. if the component was not found locally, import it from a remote scope
   */
  loadRemoteComponent(id: BitId): Promise<ConsumerComponent> {
    return this._getComponentVersion(id).then(component => {
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
  _getExternalMany(
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
    enrichContextFromGlobal(Object.assign(context, { requestedBitIds: ids.map(id => id.toString()) }));
    return this.sources.getMany(ids).then(defs => {
      const left = defs.filter(def => {
        if (!localFetch) return true;
        if (!def.component) return true;
        return false;
      });

      if (left.length === 0) {
        logger.debugAndAddBreadCrumb(
          'scope.getExternalMany',
          'no more ids left, all found locally, exiting the method'
        );

        return pMapSeries(defs, def => this.componentToVersionDependencies(def.component, def.id));
      }

      logger.debugAndAddBreadCrumb('scope.getExternalMany', `${left.length} left. Fetching them from a remote`);
      return remotes
        .fetch(
          left.map(def => def.id),
          this.scope,
          undefined,
          context
        )
        .then(componentObjects => {
          logger.debugAndAddBreadCrumb('scope.getExternalMany', 'writing them to the model');
          return this.scope.writeManyComponentsToModel(componentObjects, persist);
        })
        .then(() => this._getExternalMany(ids, remotes));
    });
  }

  /**
   * If the component is not in the local scope, fetch it from a remote and save into the local
   * scope. (objects directory).
   */
  _getExternal({
    id,
    remotes,
    localFetch = true,
    context = {}
  }: {
    id: BitId;
    remotes: Remotes;
    localFetch: boolean;
    context?: Record<string, any>;
  }): Promise<VersionDependencies> {
    enrichContextFromGlobal(context);
    return this.sources.get(id).then(component => {
      if (component && localFetch) {
        return this.componentToVersionDependencies(component, id);
      }

      return remotes
        .fetch([id], this.scope, undefined, context)
        .then(([componentObjects]) => {
          return this.scope.writeComponentToModel(componentObjects);
        })
        .then(() => this._getExternal({ id, remotes, localFetch: true }));
    });
  }

  _getExternalWithoutDependencies({
    id,
    remotes,
    localFetch = true,
    context = {}
  }: {
    id: BitId;
    remotes: Remotes;
    localFetch: boolean;
    context?: Record<string, any>;
  }): Promise<ComponentVersion> {
    return this.sources.get(id).then(component => {
      if (component && localFetch) {
        // $FlowFixMe scope component must have a version
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        return component.toComponentVersion(id.version);
      }
      return remotes
        .fetch([id], this.scope, true, context)
        .then(([componentObjects]) => this.scope.writeComponentToModel(componentObjects))
        .then(() => this._getExternal({ id, remotes, localFetch: true }))
        .then((versionDependencies: VersionDependencies) => versionDependencies.component);
    });
  }

  _getExternalManyWithoutDependencies(
    ids: BitId[],
    remotes: Remotes,
    localFetch = false,
    context: Record<string, any> = {}
  ): Promise<ComponentVersion[]> {
    if (!ids.length) return Promise.resolve([]);
    logger.debugAndAddBreadCrumb(
      'getExternalOnes',
      `getExternalOnes, ids: {ids}, localFetch: ${localFetch.toString()}`,
      { ids: ids.join(', ') }
    );
    enrichContextFromGlobal(Object.assign(context, { requestedBitIds: ids.map(id => id.toString()) }));
    return this.sources.getMany(ids).then((defs: ComponentDef[]) => {
      const left = defs.filter(def => {
        if (!localFetch) return true;
        if (!def.component) return true;
        return false;
      });

      if (left.length === 0) {
        logger.debugAndAddBreadCrumb(
          'scope.getExternalOnes',
          'no more ids left, all found locally, exiting the method'
        );
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        return Promise.all(defs.map(def => def.component.toComponentVersion(def.id.version)));
      }

      logger.debugAndAddBreadCrumb(
        'getExternalOnes',
        `getExternalOnes: ${left.length} left. Fetching them from a remote`
      );
      return remotes
        .fetch(
          left.map(def => def.id),
          this.scope,
          true,
          context
        )
        .then(componentObjects => {
          return this.scope.writeManyComponentsToModel(componentObjects);
        })
        .then(() => this._getExternalManyWithoutDependencies(ids, remotes, true));
    });
  }

  async _getComponentVersion(id: BitId): Promise<ComponentVersion> {
    if (!id.isLocal(this.scope.name)) {
      const remotes = await getScopeRemotes(this.scope);
      return this._getExternalWithoutDependencies({ id, remotes, localFetch: true });
    }

    return this.sources.get(id).then(component => {
      if (!component) throw new ComponentNotFound(id.toString());
      // $FlowFixMe version is set
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      return component.toComponentVersion(id.version);
    });
  }
}
