// @flow
import R from 'ramda';
import pMapSeries from 'p-map-series';
import type { Scope } from '..';
import { Remotes } from '../../remotes';
import enrichContextFromGlobal from '../../hooks/utils/enrich-context-from-global';
import { BitId, BitIds } from '../../bit-id';
import VersionDependencies from '../version-dependencies';
import logger from '../../logger/logger';
import { RemoteScopeNotFound, PermissionDenied } from '../network/exceptions';
import { ComponentNotFound, DependencyNotFound } from '../exceptions';
import { Analytics } from '../../analytics/analytics';
import SourcesRepository, { type ComponentDef } from '../repositories/sources';
import type ComponentVersion from '../component-version';
import type ComponentObjects from '../component-objects';
import GeneralError from '../../error/general-error';
import { getScopeRemotes } from '../scope-remotes';
import type ConsumerComponent from '../../consumer/component';
import { splitBy } from '../../utils';

const removeNils = R.reject(R.isNil);

export default class ScopeComponentsImporter {
  scope: Scope;
  sources: SourcesRepository;
  constructor(scope: Scope) {
    this.scope = scope;
    this.sources = scope.sources;
  }

  importDependencies(dependencies: BitIds): Promise<VersionDependencies[]> {
    return new Promise((resolve, reject) => {
      return this.importMany(dependencies)
        .then(resolve)
        .catch((e) => {
          logger.error(`importDependencies got an error: ${JSON.stringify(e)}`);
          if (e instanceof RemoteScopeNotFound || e instanceof PermissionDenied) return reject(e);
          return reject(new DependencyNotFound(e.id));
        });
    });
  }

  /**
   * 1. Local objects, fetch from local. (done by this.sources.getMany method)
   * 2. Fetch flattened dependencies (done by toVersionDependencies method). If they're not locally, fetch from remote
   * and save them locally.
   * 3. External objects, fetch from a remote and save locally. (done by this.getExternalOnes method).
   */
  async importMany(ids: BitIds, cache: boolean = true, persist: boolean = true): Promise<VersionDependencies[]> {
    logger.debugAndAddBreadCrumb('ScopeComponentsImporter', 'importMany: {ids}', { ids: ids.toString() });
    const idsWithoutNils = removeNils(ids);
    if (R.isEmpty(idsWithoutNils)) return Promise.resolve([]);

    const [externals, locals] = R.splitWhen(id => id.isLocal(this.scope.name), idsWithoutNils);

    const localDefs = await this.sources.getMany(locals);
    const versionDeps = await pMapSeries(localDefs, (def) => {
      if (!def.component) throw new ComponentNotFound(def.id.toString());
      return def.component.toVersionDependencies(def.id.version, this.scope, def.id.scope);
    });
    logger.debugAndAddBreadCrumb(
      'ScopeComponentsImporter',
      'importMany: successfully fetched local components and their dependencies. Going to fetch externals'
    );
    const remotes = await getScopeRemotes(this.scope);
    const externalDeps = await this._getExternalMany(externals, remotes, cache, persist);
    return versionDeps.concat(externalDeps);
  }

  /**
   * recursive function.
   * if found locally, use them. Otherwise, fetch from remote and then, save into the model.
   */
  _getExternalMany(
    ids: BitId[],
    remotes: Remotes,
    localFetch: boolean = true,
    persist: boolean = true,
    context: Object = {}
  ): Promise<VersionDependencies[]> {
    if (!ids.length) return Promise.resolve([]);
    logger.debugAndAddBreadCrumb(
      'scope.getExternalMan',
      `planning on fetching from ${localFetch ? 'local' : 'remote'} scope. Ids: {ids}`,
      { ids: ids.join(', ') }
    );
    enrichContextFromGlobal(Object.assign(context, { requestedBitIds: ids.map(id => id.toString()) }));
    return this.sources.getMany(ids).then((defs) => {
      const left = defs.filter((def) => {
        if (!localFetch) return true;
        if (!def.component) return true;
        return false;
      });

      if (left.length === 0) {
        logger.debugAndAddBreadCrumb(
          'scope.getExternalMany',
          'no more ids left, all found locally, exiting the method'
        );
        // $FlowFixMe - there should be a component because there no defs without components left.
        return Promise.all(
          defs.map(def => def.component.toVersionDependencies(def.id.version, this.scope, def.id.scope))
        );
      }

      logger.debugAndAddBreadCrumb('scope.getExternalMany', `${left.length} left. Fetching them from a remote`);
      return remotes
        .fetch(left.map(def => def.id), this.scope, undefined, context)
        .then((componentObjects) => {
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
  getExternal({
    id,
    remotes,
    localFetch = true,
    context = {}
  }: {
    id: BitId,
    remotes: Remotes,
    localFetch: boolean,
    context?: Object
  }): Promise<VersionDependencies> {
    // if (!id) return Promise.resolve();
    enrichContextFromGlobal(context);
    return this.sources.get(id).then((component) => {
      if (component && localFetch) {
        // $FlowFixMe id from remote must have scope and version
        return component.toVersionDependencies(id.version, this.scope, id.scope);
      }

      return remotes
        .fetch([id], this.scope, undefined, context)
        .then(([componentObjects]) => {
          return this.scope.writeComponentToModel(componentObjects);
        })
        .then(() => this.getExternal({ id, remotes, localFetch: true }));
    });
  }

  _getExternalOne({
    id,
    remotes,
    localFetch = true,
    context = {}
  }: {
    id: BitId,
    remotes: Remotes,
    localFetch: boolean,
    context?: Object
  }): Promise<ComponentVersion> {
    return this.sources.get(id).then((component) => {
      if (component && localFetch) {
        // $FlowFixMe scope component must have a version
        return component.toComponentVersion(id.version);
      }
      return remotes
        .fetch([id], this.scope, true, context)
        .then(([componentObjects]) => this.scope.writeComponentToModel(componentObjects))
        .then(() => this.getExternal({ id, remotes, localFetch: true }))
        .then((versionDependencies: VersionDependencies) => versionDependencies.component);
    });
  }

  /**
   * get multiple components from a scope, if not found in the local scope, fetch from a remote
   * scope. Then, write them to the local scope.
   */
  getMany(ids: BitId[], cache?: boolean = true): Promise<VersionDependencies[]> {
    logger.debug(`scope.getMany, Ids: ${ids.join(', ')}`);
    Analytics.addBreadCrumb('getMany', `scope.getMany, Ids: ${Analytics.hashData(ids)}`);

    const idsWithoutNils = removeNils(ids);
    if (R.isEmpty(idsWithoutNils)) return Promise.resolve([]);
    return this.importMany(idsWithoutNils, cache);
  }

  // todo: improve performance by finding all versions needed and fetching them in one request from the server
  // currently it goes to the server twice. First, it asks for the last version of each id, and then it goes again to
  // ask for the older versions.
  async getManyWithAllVersions(ids: BitId[], cache?: boolean = true): Promise<VersionDependencies[]> {
    logger.debug(`scope.getManyWithAllVersions, Ids: ${ids.join(', ')}`);
    Analytics.addBreadCrumb('getManyWithAllVersions', `scope.getManyWithAllVersions, Ids: ${Analytics.hashData(ids)}`);
    const idsWithoutNils = removeNils(ids);
    if (R.isEmpty(idsWithoutNils)) return Promise.resolve([]);
    const versionDependenciesArr: VersionDependencies[] = await this.importMany(idsWithoutNils, cache);

    const allVersionsP = versionDependenciesArr.map((versionDependencies) => {
      const versions = versionDependencies.component.component.listVersions();
      const idsWithAllVersions = versions.map((version) => {
        if (version === versionDependencies.component.version) return null; // imported already
        const versionId = versionDependencies.component.id;
        return versionId.changeVersion(version);
      });
      // $FlowFixMe
      const bitIdsWithAllVersions = BitIds.fromArray(idsWithAllVersions.filter(x => x));
      return this.importManyOnes(bitIdsWithAllVersions);
    });
    await Promise.all(allVersionsP);
    return versionDependenciesArr;
  }

  async importManyOnes(ids: BitIds, cache: boolean = true): Promise<ComponentVersion[]> {
    if (!ids.length) return [];
    logger.debug(`scope.importManyOnes. Ids: ${ids.join(', ')}, cache: ${cache.toString()}`);
    Analytics.addBreadCrumb('importManyOnes', `scope.importManyOnes. Ids: ${Analytics.hashData(ids)}`);

    const idsWithoutNils = removeNils(ids);
    if (R.isEmpty(idsWithoutNils)) return Promise.resolve([]);

    const [externals, locals] = splitBy(idsWithoutNils, id => id.isLocal(this.scope.name));

    const localDefs: ComponentDef[] = await this.sources.getMany(locals);
    const componentVersionArr = await Promise.all(
      localDefs.map((def) => {
        if (!def.component) throw new ComponentNotFound(def.id.toString());
        // $FlowFixMe it must have a version
        return def.component.toComponentVersion(def.id.version);
      })
    );
    const remotes = await getScopeRemotes(this.scope);
    const externalDeps = await this._getExternalOnes(externals, remotes, cache);
    return componentVersionArr.concat(externalDeps);
  }

  _getExternalOnes(
    ids: BitId[],
    remotes: Remotes,
    localFetch: boolean = false,
    context: Object = {}
  ): Promise<ComponentVersion[]> {
    if (!ids.length) return Promise.resolve([]);
    logger.debugAndAddBreadCrumb(
      'getExternalOnes',
      `getExternalOnes, ids: {ids}, localFetch: ${localFetch.toString()}`,
      { ids: ids.join(', ') }
    );
    enrichContextFromGlobal(Object.assign(context, { requestedBitIds: ids.map(id => id.toString()) }));
    return this.sources.getMany(ids).then((defs: ComponentDef[]) => {
      const left = defs.filter((def) => {
        if (!localFetch) return true;
        if (!def.component) return true;
        return false;
      });

      if (left.length === 0) {
        logger.debugAndAddBreadCrumb(
          'scope.getExternalOnes',
          'no more ids left, all found locally, exiting the method'
        );
        // $FlowFixMe
        return Promise.all(defs.map(def => def.component.toComponentVersion(def.id.version)));
      }

      logger.debugAndAddBreadCrumb(
        'getExternalOnes',
        `getExternalOnes: ${left.length} left. Fetching them from a remote`
      );
      return remotes
        .fetch(left.map(def => def.id), this.scope, true, context)
        .then((componentObjects) => {
          return this.scope.writeManyComponentsToModel(componentObjects);
        })
        .then(() => this._getExternalOnes(ids, remotes, true));
    });
  }

  manyOneObjects(ids: BitIds): Promise<ComponentObjects[]> {
    return this.importManyOnes(ids, false).then(componentVersions =>
      Promise.all(
        componentVersions.map((version) => {
          return version.toObjects(this.scope.objects);
        })
      )
    );
  }

  async getObjects(ids: BitIds): Promise<ComponentObjects[]> {
    const versions = await this.importMany(ids);
    return Promise.all(versions.map(version => version.toObjects(this.scope.objects)));
  }

  /**
   * get ConsumerComponent by bitId. if the component was not found locally, import it from a remote scope
   */
  loadRemoteComponent(id: BitId): Promise<ConsumerComponent> {
    return this._getComponentVersion(id).then((component) => {
      if (!component) throw new ComponentNotFound(id.toString());
      return component.toConsumer(this.scope.objects);
    });
  }

  loadComponent(id: BitId, localOnly: boolean = true): Promise<ConsumerComponent> {
    logger.debugAndAddBreadCrumb('ScopeComponentsImporter', 'loadComponent {id}', { id: id.toString() });

    if (localOnly && !id.isLocal(this.scope.name)) {
      throw new GeneralError('cannot load bit from remote scope, please import first');
    }
    return this.loadRemoteComponent(id);
  }

  async _getComponentVersion(id: BitId): Promise<ComponentVersion> {
    if (!id.isLocal(this.scope.name)) {
      const remotes = await getScopeRemotes(this.scope);
      return this._getExternalOne({ id, remotes, localFetch: true });
    }

    return this.sources.get(id).then((component) => {
      if (!component) throw new ComponentNotFound(id.toString());
      // $FlowFixMe version is set
      return component.toComponentVersion(id.version);
    });
  }

  static getInstance(scope: Scope): ScopeComponentsImporter {
    return new ScopeComponentsImporter(scope);
  }
}
