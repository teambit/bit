import type { ComponentID } from '@teambit/component';
import { Component, ComponentFS, Config, Snap, State, Tag, TagMap } from '@teambit/component';
import pMapSeries from 'p-map-series';
import type { Logger } from '@teambit/logger';
import { SemVer } from 'semver';
import type { ConsumerComponent } from '@teambit/legacy.consumer-component';
import type { Lane, ModelComponent, Version } from '@teambit/objects';
import { VERSION_ZERO, Ref } from '@teambit/objects';
import { BitError } from '@teambit/bit-error';
import { isTag } from '@teambit/component-version';
import { VersionNotFoundOnFS } from '@teambit/legacy.scope';
import type { InMemoryCache } from '@teambit/harmony.modules.in-memory-cache';
import { getMaxSizeForComponents, createInMemoryCache } from '@teambit/harmony.modules.in-memory-cache';
import type { LoadSpan } from '@teambit/harmony.modules.load-trace';
import { startOrJoinLoadTrace, loadSpan } from '@teambit/harmony.modules.load-trace';
import type { ScopeMain } from './scope.main.runtime';

export class ScopeComponentLoader {
  private componentsCache: InMemoryCache<Component>; // cache loaded components
  private importedComponentsCache: InMemoryCache<boolean>;
  // fetches of a missing Version object in flight, so concurrent loads of the same version share one
  private missingVersionFetches = new Map<string, Promise<void>>();
  // a missing Version object the remote could not provide. remembered briefly, so a long-running
  // process (watch, server) does not hit the remote on every load while it lacks the version
  private failedVersionFetches: InMemoryCache<boolean>;
  constructor(
    private scope: ScopeMain,
    private logger: Logger
  ) {
    this.componentsCache = createInMemoryCache({ maxSize: getMaxSizeForComponents() });
    this.importedComponentsCache = createInMemoryCache({ maxAge: 1000 * 60 * 30 }); // 30 min
    this.failedVersionFetches = createInMemoryCache({ maxAge: 1000 * 60 }); // 1 min
  }

  async get(id: ComponentID, importIfMissing = true, useCache = true): Promise<Component | undefined> {
    return startOrJoinLoadTrace('scope.get', { id: id.toString() }, (span) =>
      this.getWithSpan(id, span, importIfMissing, useCache)
    );
  }

  private async getWithSpan(
    id: ComponentID,
    span: LoadSpan,
    importIfMissing = true,
    useCache = true
  ): Promise<Component | undefined> {
    const fromCache = this.getFromCache(id);
    if (fromCache && useCache) {
      span.setAttribute('componentsCache', 'hit');
      return fromCache;
    }
    span.setAttribute('componentsCache', 'miss');
    const idStr = id.toString();
    this.logger.trace(`ScopeComponentLoader.get, loading ${idStr}`);
    const legacyId = id;
    let modelComponent = await this.scope.legacyScope.getModelComponentIfExist(id);
    // import if missing
    if (
      !modelComponent &&
      importIfMissing &&
      this.scope.isExported(id) &&
      !this.importedComponentsCache.get(id.toString())
    ) {
      await loadSpan('scope-import', { id: id.toString() }, () =>
        this.scope.import([id], { reason: `${id.toString()} because it's missing from the local scope` })
      );
      this.importedComponentsCache.set(id.toString(), true);
      modelComponent = await this.scope.legacyScope.getModelComponentIfExist(id);
    }
    // Search with scope name for bare scopes
    if (!modelComponent && !legacyId.scope) {
      id = id.changeScope(this.scope.name);
      modelComponent = await this.scope.legacyScope.getModelComponentIfExist(id);
    }

    if (!modelComponent) {
      if (this.scope.legacyScope.isLocal(id) && id.hasVersion()) {
        const existsWithoutVersion = await this.scope.legacyScope.getModelComponentIfExist(id.changeVersion(undefined));
        const errMsg = existsWithoutVersion
          ? `failed loading ${id.toString()}: the component exists but version ${id.version} is missing.`
          : `failed loading ${id.toString()}: the component does not exist in the local scope.`;
        this.logger.error(errMsg);
      }
      return undefined;
    }

    const versionStr = id.hasVersion()
      ? (id.version as string)
      : modelComponent.getHeadRegardlessOfLaneAsTagOrHash(true);

    if (versionStr === VERSION_ZERO) return undefined;
    const newId = id.changeVersion(versionStr);
    const version = await this.loadVersionOrFetch(modelComponent, newId, versionStr, span, importIfMissing);
    const versionOriginId = version.originId;
    if (versionOriginId && !versionOriginId.isEqualWithoutVersion(id)) {
      throw new BitError(
        `version "${versionStr}" seems to have originated from "${versionOriginId.toString()}", not from "${id.toStringWithoutVersion()}"`
      );
    }
    const snap = await this.getHeadSnap(modelComponent);
    const state = await loadSpan('state-from-version', { id: idStr }, () => this.createStateFromVersion(id, version));
    const tagMap = this.getTagMap(modelComponent);

    const component = new Component(newId, snap, state, tagMap, this.scope);
    this.componentsCache.set(idStr, component);
    return component;
  }

  /**
   * a component object may point at a Version object the local scope does not have. a fetch that ran
   * while the remote was mid-export gets the component with its new head but no Version for it, and
   * every load from then on fails on the missing object, although the remote has it by now. fetch
   * it once and retry, rather than fail until the user runs "bit import --objects" by hand.
   */
  private async loadVersionOrFetch(
    modelComponent: ModelComponent,
    id: ComponentID,
    versionStr: string,
    span: LoadSpan,
    importIfMissing: boolean
  ): Promise<Version> {
    const repo = this.scope.legacyScope.objects;
    try {
      return await modelComponent.loadVersion(versionStr, repo);
    } catch (err: any) {
      if (!isVersionMissingFromFs(err) || !importIfMissing || !this.scope.isExported(id)) throw err;
      // read once: the lane decides where the version is looked for, and the outcome is remembered per lane
      const lane = await this.scope.legacyScope.getCurrentLaneObject();
      const contextKey = lane ? `${id.toString()} (lane ${lane.id().toString()})` : id.toString();
      if (this.failedVersionFetches.get(contextKey)) throw err;
      for (const source of sourcesOfMissingVersion(id, versionStr, lane)) {
        try {
          await this.fetchMissingVersion(id, source, span);
        } catch (fetchErr: any) {
          this.logger.error(
            `ScopeComponentLoader, failed fetching ${id.toString()} from ${describeSource(source)}`,
            fetchErr
          );
          continue;
        }
        try {
          return await modelComponent.loadVersion(versionStr, repo);
        } catch (retryErr: any) {
          // still missing after this source: try the next. any other failure of the fetched object is its own.
          if (!isVersionMissingFromFs(retryErr)) throw retryErr;
        }
      }
      // no source had it. remembered briefly, so a long-running process (watch, server) does not hit the
      // remotes on every load while they still lack the version, and the next load after that tries again.
      this.failedVersionFetches.set(contextKey, true);
      throw err;
    }
  }

  private fetchMissingVersion(id: ComponentID, source: Lane | undefined, span: LoadSpan): Promise<void> {
    const fetchKey = source ? `${id.toString()} (lane ${source.id().toString()})` : id.toString();
    const inFlight = this.missingVersionFetches.get(fetchKey);
    if (inFlight) return inFlight;
    const fetching = (async () => {
      this.logger.warn(
        `ScopeComponentLoader, the Version object of ${id.toString()} is missing locally, fetching it from ${describeSource(source)}`
      );
      span.setAttribute('missingVersionFetched', 'true');
      // useCache false: the component object is present locally, so the importer would otherwise skip the fetch.
      await loadSpan('scope-import-missing-version', { id: fetchKey }, () =>
        this.scope.import([id], {
          useCache: false,
          lane: source,
          reason: `${id.toString()} because its Version object is missing from the local scope`,
        })
      );
    })().finally(() => this.missingVersionFetches.delete(fetchKey));
    this.missingVersionFetches.set(fetchKey, fetching);
    return fetching;
  }

  async getFromConsumerComponent(consumerComponent: ConsumerComponent): Promise<Component> {
    const id = consumerComponent.id;
    const modelComponent = await this.scope.legacyScope.getModelComponent(id);
    // :TODO move to head snap once we have it merged, for now using `latest`.
    const version =
      consumerComponent.pendingVersion ||
      (await modelComponent.loadVersion(id.version as string, this.scope.legacyScope.objects));
    const snap = await this.getHeadSnap(modelComponent);
    const state = await this.createStateFromVersion(id, version, consumerComponent);
    const tagMap = this.getTagMap(modelComponent);

    return new Component(id, snap, state, tagMap, this.scope);
  }

  /**
   * get a component from a remote without importing it
   */
  async getRemoteComponent(id: ComponentID, fromMain = false): Promise<Component> {
    const compImport = this.scope.legacyScope.scopeImporter;
    const objectList = await compImport.getRemoteComponent(id);
    // it's crucial to add all objects to the Repository cache. otherwise, later, when it asks
    // for the consumerComponent from the legacyScope, it won't work.
    objectList?.getAll().forEach((obj) => this.scope.legacyScope.objects.setCache(obj));
    const modelComponent = await this.scope.legacyScope.getModelComponent(id);
    const headAsTag = modelComponent.getHeadAsTagIfExist();
    const idToLoad = fromMain && headAsTag ? id.changeVersion(headAsTag) : id;
    const consumerComponent = await this.scope.legacyScope.getConsumerComponent(idToLoad);
    return this.getFromConsumerComponent(consumerComponent);
  }

  /**
   * get components from a remote without importing it
   */
  async getManyRemoteComponents(ids: ComponentID[]): Promise<Component[]> {
    const compImport = this.scope.legacyScope.scopeImporter;
    const legacyIds = ids.map((id) => id);
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
    if (fromCache && fromCache.id.isEqual(id)) {
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

  private async createStateFromVersion(
    id: ComponentID,
    version: Version,
    consumerComponentOptional?: ConsumerComponent
  ): Promise<State> {
    const consumerComponent = consumerComponentOptional || (await this.scope.legacyScope.getConsumerComponent(id));
    const state = new State(
      // We use here the consumerComponent.extensions instead of version.extensions
      // because as part of the conversion to consumer component the artifacts are initialized as Artifact instances
      new Config(consumerComponent),
      // todo: see the comment of this "createAspectListFromLegacy" method. the aspect ids may be incorrect.
      // find a better way to get the ids correctly.
      this.scope.componentExtension.createAspectListFromLegacy(consumerComponent.extensions),
      ComponentFS.fromVinyls(consumerComponent.files),
      version.dependencies,
      consumerComponent
    );
    return state;
  }
}

function isVersionMissingFromFs(err: any): boolean {
  return err instanceof VersionNotFoundOnFS || err?.name === 'VersionNotFoundOnFS';
}

/**
 * where a missing version is looked for, in order. off a lane, only the component's own scope. on a lane, a
 * snap of a component on that lane lives on the lane's scope and a tag on the component's own scope, but a
 * lean lane scope may lack main history and a merged lane snap may have reached the component's scope, so
 * the other one is tried as well.
 */
function sourcesOfMissingVersion(id: ComponentID, versionStr: string, lane: Lane | undefined): Array<Lane | undefined> {
  if (!lane) return [undefined];
  const laneFirst = Boolean(lane.getComponent(id)) && !isTag(versionStr);
  return laneFirst ? [lane, undefined] : [undefined, lane];
}

function describeSource(source: Lane | undefined): string {
  return source ? `lane ${source.id().toString()}` : 'its scope';
}
