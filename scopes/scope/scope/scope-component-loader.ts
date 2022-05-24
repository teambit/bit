import { Component, ComponentFS, ComponentID, Config, Snap, State, Tag, TagMap } from '@teambit/component';
import pMapSeries from 'p-map-series';
import { Logger } from '@teambit/logger';
import { SemVer } from 'semver';
import ConsumerComponent from '@teambit/legacy/dist/consumer/component';
import ScopeComponentsImporter from '@teambit/legacy/dist/scope/component-ops/scope-components-importer';
import { ModelComponent, Version } from '@teambit/legacy/dist/scope/models';
import { BitIds } from '@teambit/legacy/dist/bit-id';
import { Ref } from '@teambit/legacy/dist/scope/objects';
import { getMaxSizeForComponents, InMemoryCache } from '@teambit/legacy/dist/cache/in-memory-cache';
import { createInMemoryCache } from '@teambit/legacy/dist/cache/cache-factory';
import type { ScopeMain } from './scope.main.runtime';

export class ScopeComponentLoader {
  private componentsCache: InMemoryCache<Component>; // cache loaded components
  private importedComponentsCache: InMemoryCache<boolean>;
  constructor(private scope: ScopeMain, private logger: Logger) {
    this.componentsCache = createInMemoryCache({ maxSize: getMaxSizeForComponents() });
    this.importedComponentsCache = createInMemoryCache({ maxAge: 1000 * 60 * 30 }); // 30 min
  }

  async get(id: ComponentID, importIfMissing = true): Promise<Component | undefined> {
    const fromCache = this.getFromCache(id);
    if (fromCache) {
      return fromCache;
    }
    const idStr = id.toString();
    this.logger.debug(`ScopeComponentLoader.get, loading ${idStr}`);
    const legacyId = id._legacy;
    let modelComponent = await this.scope.legacyScope.getModelComponentIfExist(id._legacy);
    // import if missing
    if (
      !modelComponent &&
      importIfMissing &&
      id._legacy.hasScope() &&
      !this.importedComponentsCache.get(id.toString())
    ) {
      await this.scope.legacyScope.import(BitIds.fromArray([id._legacy]));
      this.importedComponentsCache.set(id.toString(), true);
      modelComponent = await this.scope.legacyScope.getModelComponentIfExist(id._legacy);
    }
    // Search with scope name for bare scopes
    if (!modelComponent && !legacyId.scope) {
      id = id.changeScope(this.scope.name);
      modelComponent = await this.scope.legacyScope.getModelComponentIfExist(id._legacy);
    }
    if (!modelComponent) return undefined;

    const versionStr = id.version && id.version !== 'latest' ? id.version : modelComponent.latest();
    const newId = id.changeVersion(versionStr);
    const version = await modelComponent.loadVersion(versionStr, this.scope.legacyScope.objects);
    const snap = await this.getHeadSnap(modelComponent);
    const state = await this.createStateFromVersion(id, version);
    const tagMap = this.getTagMap(modelComponent);

    const component = new Component(newId, snap, state, tagMap, this.scope);
    this.componentsCache.set(idStr, component);
    return component;
  }

  async getFromConsumerComponent(consumerComponent: ConsumerComponent): Promise<Component> {
    const legacyId = consumerComponent.id;
    const modelComponent = await this.scope.legacyScope.getModelComponent(legacyId);
    // :TODO move to head snap once we have it merged, for now using `latest`.
    const id = await this.scope.resolveComponentId(legacyId);
    const version =
      consumerComponent.pendingVersion ||
      (await modelComponent.loadVersion(legacyId.version as string, this.scope.legacyScope.objects));
    const snap = await this.getHeadSnap(modelComponent);
    const state = await this.createStateFromVersion(id, version);
    const tagMap = this.getTagMap(modelComponent);

    return new Component(id, snap, state, tagMap, this.scope);
  }

  /**
   * get a component from a remote without importing it
   */
  async getRemoteComponent(id: ComponentID): Promise<Component> {
    const compImport = new ScopeComponentsImporter(this.scope.legacyScope);
    const objectList = await compImport.getRemoteComponent(id._legacy);
    // it's crucial to add all objects to the Repository cache. otherwise, later, when it asks
    // for the consumerComponent from the legacyScope, it won't work.
    objectList?.getAll().forEach((obj) => this.scope.legacyScope.objects.setCache(obj));
    const consumerComponent = await this.scope.legacyScope.getConsumerComponent(id._legacy);
    return this.getFromConsumerComponent(consumerComponent);
  }

  /**
   * get components from a remote without importing it
   */
  async getManyRemoteComponents(ids: ComponentID[]): Promise<Component[]> {
    const compImport = new ScopeComponentsImporter(this.scope.legacyScope);
    const legacyIds = ids.map((id) => id._legacy);
    const objectList = await compImport.getManyRemoteComponents(legacyIds);
    // it's crucial to add all objects to the Repository cache. otherwise, later, when it asks
    // for the consumerComponent from the legacyScope, it won't work.
    objectList?.getAll().forEach((obj) => this.scope.legacyScope.objects.setCache(obj));
    return pMapSeries(legacyIds, async (legacyId) => {
      const consumerComponent = await this.scope.legacyScope.getConsumerComponent(legacyId);
      return this.getFromConsumerComponent(consumerComponent);
    });
  }

  async getState(id: ComponentID, hash: string): Promise<State> {
    const version = (await this.scope.legacyScope.objects.load(new Ref(hash))) as Version;
    return this.createStateFromVersion(id, version);
  }

  async getSnap(id: ComponentID, hash: string): Promise<Snap> {
    const getVersionObject = async (): Promise<Version> => {
      try {
        const snap = await this.scope.legacyScope.objects.load(new Ref(hash), true);
        return snap as Version;
      } catch (err: any) {
        if (err.code === 'ENOENT') {
          const errMsg = `fatal: snap "${hash}" file for component "${id.toString()}" was not found in the filesystem`;
          this.logger.error(errMsg, err);
          throw new Error(errMsg);
        } else {
          throw err;
        }
      }
    };
    const version = await getVersionObject();
    return this.createSnapFromVersion(version);
  }

  clearCache() {
    this.componentsCache.deleteAll();
  }

  /**
   * make sure that not only the id-str match, but also the legacy-id.
   * this is needed because the ComponentID.toString() is the same whether or not the legacy-id has
   * scope-name, as it includes the defaultScope if the scope is empty.
   * as a result, when out-of-sync is happening and the id is changed to include scope-name in the
   * legacy-id, the component is the cache has the old id.
   */
  private getFromCache(id: ComponentID): Component | undefined {
    const idStr = id.toString();
    const fromCache = this.componentsCache.get(idStr);
    if (fromCache && fromCache.id._legacy.isEqual(id._legacy)) {
      return fromCache;
    }
    return undefined;
  }

  private getTagMap(modelComponent: ModelComponent): TagMap {
    const tagMap = new TagMap();
    const allVersions = modelComponent.versionsIncludeOrphaned;
    Object.keys(allVersions).forEach((versionStr: string) => {
      const tag = new Tag(allVersions[versionStr].toString(), new SemVer(versionStr));
      tagMap.set(tag.version, tag);
    });
    return tagMap;
  }

  private async getHeadSnap(modelComponent: ModelComponent): Promise<Snap | null> {
    const head = modelComponent.getHeadRegardlessOfLane();
    if (!head) {
      // happens for example when on main and merging a lane.
      return null;
    }
    const version = await modelComponent.loadVersion(head.toString(), this.scope.legacyScope.objects, false);
    if (!version) {
      // might happen when the component is just a dependency and a previous version was needed.
      return null;
    }
    return this.createSnapFromVersion(version);
  }

  private createSnapFromVersion(version: Version): Snap {
    return new Snap(
      version.hash().toString(),
      new Date(parseInt(version.log.date)),
      version.parents.map((p) => p.toString()),
      {
        displayName: version.log.username || 'unknown',
        email: version.log.email || 'unknown@anywhere',
      },
      version.log.message
    );
  }

  private async createStateFromVersion(id: ComponentID, version: Version): Promise<State> {
    const consumerComponent = await this.scope.legacyScope.getConsumerComponent(id._legacy);
    const state = new State(
      // We use here the consumerComponent.extensions instead of version.extensions
      // because as part of the conversion to consumer component the artifacts are initialized as Artifact instances
      new Config(version.mainFile, consumerComponent.extensions),
      // todo: see the comment of this "createAspectListFromLegacy" method. the aspect ids may be incorrect.
      // find a better way to get the ids correctly.
      this.scope.componentExtension.createAspectListFromLegacy(consumerComponent.extensions, this.scope.name),
      ComponentFS.fromVinyls(consumerComponent.files),
      version.dependencies,
      consumerComponent
    );
    return state;
  }
}
