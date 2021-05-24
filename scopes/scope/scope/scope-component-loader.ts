import { Component, ComponentFS, ComponentID, Config, Snap, State, Tag, TagMap } from '@teambit/component';
import { Logger } from '@teambit/logger';
import { SemVer } from 'semver';
import ConsumerComponent from '@teambit/legacy/dist/consumer/component';
import ScopeComponentsImporter from '@teambit/legacy/dist/scope/component-ops/scope-components-importer';
import { ModelComponent, Version } from '@teambit/legacy/dist/scope/models';
import { Ref } from '@teambit/legacy/dist/scope/objects';
import { getMaxSizeForComponents, InMemoryCache } from '@teambit/legacy/dist/cache/in-memory-cache';
import { createInMemoryCache } from '@teambit/legacy/dist/cache/cache-factory';
import type { ScopeMain } from './scope.main.runtime';

export class ScopeComponentLoader {
  private componentsCache: InMemoryCache<Component>; // cache loaded components
  constructor(private scope: ScopeMain, private logger: Logger) {
    this.componentsCache = createInMemoryCache({ maxSize: getMaxSizeForComponents() });
  }

  async get(id: ComponentID): Promise<Component | undefined> {
    const idStr = id.toString();
    const fromCache = this.componentsCache.get(idStr);
    if (fromCache) {
      return fromCache;
    }
    this.logger.debug(`ScopeComponentLoader.get, loading ${idStr}`);
    const legacyId = id._legacy;
    let modelComponent = await this.scope.legacyScope.getModelComponentIfExist(id._legacy);
    // Search with scope name for bare scopes
    if (!modelComponent && !legacyId.scope) {
      id = id.changeScope(this.scope.name);
      modelComponent = await this.scope.legacyScope.getModelComponentIfExist(id._legacy);
    }
    if (!modelComponent) return undefined;

    // :TODO move to head snap once we have it merged, for now using `latest`.
    const versionStr = id.version && id.version !== 'latest' ? id.version : modelComponent.latest();
    const newId = id.changeVersion(versionStr);
    const version = await modelComponent.loadVersion(versionStr, this.scope.legacyScope.objects);
    const snap = this.createSnapFromVersion(version);
    const state = await this.createStateFromVersion(id, version);
    const tagMap = await this.getTagMap(modelComponent);

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
    const snap = this.createSnapFromVersion(version);
    const state = await this.createStateFromVersion(id, version);
    const tagMap = await this.getTagMap(modelComponent);

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

  async getState(id: ComponentID, hash: string): Promise<State> {
    const version = (await this.scope.legacyScope.objects.load(new Ref(hash))) as Version;
    return this.createStateFromVersion(id, version);
  }

  async getSnap(id: ComponentID, hash: string): Promise<Snap> {
    const version = (await this.scope.legacyScope.objects.load(new Ref(hash), true)) as Version;
    return this.createSnapFromVersion(version);
  }

  clearCache() {
    this.componentsCache.deleteAll();
  }

  private async getTagMap(modelComponent: ModelComponent): Promise<TagMap> {
    const tagMap = new TagMap();
    Object.keys(modelComponent.versions).forEach((versionStr: string) => {
      const tag = new Tag(modelComponent.versions[versionStr].toString(), new SemVer(versionStr));
      tagMap.set(tag.version, tag);
    });
    return tagMap;
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
      this.scope.componentExtension.createAspectList(consumerComponent.extensions, this.scope.name),
      ComponentFS.fromVinyls(consumerComponent.files),
      version.dependencies,
      consumerComponent
    );
    return state;
  }
}
