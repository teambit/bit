import type { CLIMain } from '@teambit/cli';
import { CLIAspect, MainRuntime } from '@teambit/cli';
import { compact } from 'lodash';
import { BitError } from '@teambit/bit-error';
import type { Workspace } from '@teambit/workspace';
import { WorkspaceAspect, OutsideWorkspaceError } from '@teambit/workspace';
import { ComponentID, ComponentIdList } from '@teambit/component-id';
import type { ScopeMain } from '@teambit/scope';
import { ScopeAspect } from '@teambit/scope';
import type { GraphqlMain } from '@teambit/graphql';
import { GraphqlAspect } from '@teambit/graphql';
import { BuilderAspect } from '@teambit/builder';
import type { ModelComponent, Version } from '@teambit/objects';
import type { ConsumerComponent } from '@teambit/legacy.consumer-component';
import type { DependencyList, DependencyResolverMain, SerializedDependency } from '@teambit/dependency-resolver';
import { DependencyResolverAspect } from '@teambit/dependency-resolver';
import type { LoggerMain, Logger } from '@teambit/logger';
import { LoggerAspect } from '@teambit/logger';
import type { DiffOptions, DiffResults, FieldsDiff, FileDiff } from '@teambit/legacy.component-diff';
import { getFilesDiff, diffBetweenComponentsObjects } from '@teambit/legacy.component-diff';
import type { TesterMain } from '@teambit/tester';
import { TesterAspect } from '@teambit/tester';
import type { Component, ComponentMain } from '@teambit/component';
import { ComponentAspect } from '@teambit/component';
import type { SchemaMain } from '@teambit/schema';
import { SchemaAspect } from '@teambit/schema';
import type { CacheMain } from '@teambit/cache';
import { CacheAspect } from '@teambit/cache';

import { componentCompareSchema } from './component-compare.graphql';
import { ComponentCompareAspect } from './component-compare.aspect';
import { DiffCmd } from './diff-cmd';
import type { ImporterMain } from '@teambit/importer';
import { ImporterAspect } from '@teambit/importer';
import { concurrentComponentsLimit } from '@teambit/harmony.modules.concurrency';
import { compareComponentPairs } from './compare-component-pairs';
import type { ComponentComparePair } from './compare-component-pairs';

export type ComponentCompareResult = {
  id: string;
  baseId: string;
  compareId: string;
  code: FileDiff[];
  fields: FieldsDiff[];
  tests: FileDiff[];
  /**
   * true when the compare side is the live workspace (on-disk files, incl. uncommitted changes).
   * such a result is inherently mutable, so it must never be persisted to the cross-run cache —
   * only the in-flight single-flight dedupe applies. not exposed via graphql.
   */
  isLiveWorkspace?: boolean;
};

type ConfigDiff = {
  version?: string;
  dependencies?: string[];
  aspects?: Record<string, any>;
};

export class ComponentCompareMain {
  constructor(
    private componentAspect: ComponentMain,
    private scope: ScopeMain,
    private logger: Logger,
    private tester: TesterMain,
    private depResolver: DependencyResolverMain,
    private importer: ImporterMain,
    private schema: SchemaMain,
    private cache: CacheMain,
    private workspace?: Workspace
  ) {}

  // in-flight `compute` promises, so concurrent callers for the same pair share one computation
  // instead of recomputing (the lane compare UI and lane-diff status hit the same pairs in parallel
  // on a cold load). Persisted results survive restarts via the global `@teambit/cache` aspect.
  private compareInflight = new Map<string, Promise<ComponentCompareResult>>();
  private apiDiffInflight = new Map<string, Promise<Record<string, any> | null>>();

  /**
   * Read-through cache with single-flight dedupe: serve a persisted result, else share an in-flight
   * computation, else compute once and persist. Most `(baseId, compareId)` pairs are immutable (keyed
   * on snap hashes), so a cached result never goes stale. `cacheable` gates which results are persisted.
   *
   * `skipPersistentCache` bypasses the persistent cache entirely (neither read nor write) while still
   * sharing the in-flight computation. Callers must set it whenever the result depends on mutable state
   * the key does not capture — e.g. a live-workspace diff against on-disk files — so a previously
   * persisted snap-to-snap result for the same key is never served in its place.
   */
  private async getOrCompute<T>(
    inflight: Map<string, Promise<T>>,
    cacheKey: string,
    compute: () => Promise<T>,
    cacheable: (value: T) => boolean = () => true,
    skipPersistentCache = false
  ): Promise<T> {
    const pending = inflight.get(cacheKey);
    if (pending) return pending;
    if (!skipPersistentCache) {
      const cached = await this.cache.get<T>(cacheKey);
      if (cached !== undefined) return cached;
      // a concurrent caller may have started computing while we awaited the cache read.
      const started = inflight.get(cacheKey);
      if (started) return started;
    }
    const promise = compute()
      .then((result) => {
        if (!skipPersistentCache && cacheable(result)) void this.cache.set(cacheKey, result);
        return result;
      })
      .finally(() => inflight.delete(cacheKey));
    inflight.set(cacheKey, promise);
    return promise;
  }

  async compare(baseIdStr: string, compareIdStr: string): Promise<ComponentCompareResult> {
    return this.getOrCompute(
      this.compareInflight,
      `component-compare:result:${baseIdStr}|${compareIdStr}`,
      () => this.computeCompare(baseIdStr, compareIdStr),
      // never persist a live-workspace diff: it reflects on-disk files (incl. uncommitted changes),
      // so a cached copy would go stale the moment the user edits a file. the (baseId, compareId)
      // pair is otherwise immutable (keyed on snap hashes), so those stay cacheable.
      (result) => !result.isLiveWorkspace,
      // whether this call *reads* the persistent cache is decided up front from the same signal:
      // a live-workspace compare must skip the cache entirely, otherwise a snap-to-snap result
      // persisted for this key in a prior run (or a non-live context) would mask on-disk changes.
      this.comparesLiveWorkspace(baseIdStr, compareIdStr)
    );
  }

  /**
   * cheap, synchronous pre-check mirroring the `comparingWithLocalChanges` / `compareIsLiveWorkspace`
   * logic in `computeCompare`: will this compare diff against live on-disk workspace files rather than
   * two immutable snaps? errs toward `true` (skip the persistent cache) whenever the id cannot be
   * classified, so a stale snap-to-snap result is never served in place of a live one.
   */
  private comparesLiveWorkspace(baseIdStr: string, compareIdStr: string): boolean {
    if (!this.workspace) return false; // scope/remote host: every compare is an immutable snap-to-snap pair
    if (baseIdStr === compareIdStr) return true; // the "local changes" view: checked-out snap vs on-disk files
    let compareId: ComponentID;
    try {
      compareId = ComponentID.fromString(compareIdStr);
    } catch {
      return true; // unclassifiable id → assume live so a stale cached diff is never returned
    }
    const checkedOut = this.workspace.getIdIfExist(compareId);
    if (!checkedOut) return false; // compare side isn't checked out → two stored snaps, safe to cache
    // live only when the compare side is the exact version currently checked out on disk.
    return !compareId.hasVersion() || checkedOut.version === compareId.version;
  }

  /** The original `compare()` body — moved here so the public method can wrap with memo + single-flight. */
  private async computeCompare(baseIdStr: string, compareIdStr: string): Promise<ComponentCompareResult> {
    const host = this.componentAspect.getHost();
    const [baseCompId, compareCompId] = await host.resolveMultipleComponentIds([baseIdStr, compareIdStr]);
    const modelComponent = await this.scope.legacyScope.getModelComponentIfExist(compareCompId);
    const comparingWithLocalChanges = this.workspace && baseIdStr === compareIdStr;

    if (!modelComponent) {
      throw new BitError(`component ${compareCompId.toString()} doesn't have any version yet`);
    }

    // import missing components that might be on main
    await this.importer.importObjectsFromMainIfExist([baseCompId, compareCompId], {
      cache: true,
    });

    const baseVersion = baseCompId.version as string;
    const compareVersion = compareCompId.version as string;

    const components = await host.getMany([baseCompId, compareCompId]);
    const baseComponent = components?.[0];
    const compareComponent = components?.[1];
    const componentWithoutVersion = await host.get((baseCompId || compareCompId).changeVersion(undefined));

    // When the compare side is the component currently checked out in the workspace, diff against the
    // on-disk files rather than a stored snap: passing `undefined` as the compare version makes
    // `computeDiff` fall back to `consumerComponent.files`, so uncommitted local changes are included.
    // This covers two cases with one code path:
    //   - base === compare (the classic "local changes" view): checked-out model → workspace files.
    //   - base = an earlier version: that version's committed changes + any uncommitted changes on top.
    // Without this, the default workspace compare resolves base and compare to the same checked-out
    // snap and reports no changes, collapsing the compare view to only its always-on sections.
    const checkedOutVersion = componentWithoutVersion?.id.version;
    const compareIsLiveWorkspace = Boolean(this.workspace && checkedOutVersion && compareVersion === checkedOutVersion);
    const effectiveBaseVersion = comparingWithLocalChanges ? undefined : baseVersion;
    const effectiveCompareVersion = comparingWithLocalChanges || compareIsLiveWorkspace ? undefined : compareVersion;

    const diff = componentWithoutVersion
      ? await this.computeDiff(componentWithoutVersion, effectiveBaseVersion, effectiveCompareVersion, {})
      : {
          filesDiff: [],
          fieldsDiff: [],
        };

    const baseTestFiles =
      (baseComponent && (await this.tester.getTestFiles(baseComponent).map((file) => file.relative))) || [];
    const compareTestFiles =
      (compareComponent && (await this.tester.getTestFiles(compareComponent).map((file) => file.relative))) || [];

    const allTestFiles = [...baseTestFiles, ...compareTestFiles];

    const testFilesDiff = (diff.filesDiff || []).filter(
      (fileDiff: FileDiff) => allTestFiles.includes(fileDiff.filePath) && fileDiff.status !== 'UNCHANGED'
    );

    return {
      id: `${baseCompId}-${compareCompId}`,
      baseId: baseIdStr,
      compareId: compareIdStr,
      code: diff.filesDiff || [],
      fields: diff.fieldsDiff || [],
      tests: testFilesDiff,
      isLiveWorkspace: compareIsLiveWorkspace,
    };
  }

  /**
   * compare a paginated slice of component pairs in one call.
   * a pair that fails to compare (e.g. a component without versions) becomes `null` in the
   * returned array rather than failing the whole batch. the array is aligned to the requested
   * slice (`pairs[offset .. offset + limit]`).
   */
  async compareComponents(
    pairs: ComponentComparePair[],
    options?: { offset?: number; limit?: number }
  ): Promise<Array<ComponentCompareResult | null>> {
    return compareComponentPairs(pairs, (baseId, compareId) => this.compare(baseId, compareId), {
      offset: options?.offset,
      limit: options?.limit,
      concurrency: concurrentComponentsLimit(),
      onError: (pair, err) => {
        this.logger.warn(`compareComponents: failed to compare ${pair.baseId} <> ${pair.compareId}`, err);
      },
    });
  }

  /**
   * api-diff a paginated slice of component pairs in one call — the bulk counterpart of the single
   * `getAPIDiff`, mirroring `compareComponents`. reuses `getAPIDiff` per pair (so its disk memo +
   * single-flight dedupe still apply), turning a pair whose diff throws into `null` rather than
   * failing the whole batch. the returned array is aligned to the requested slice.
   */
  async apiDiffs(
    pairs: ComponentComparePair[],
    options?: { offset?: number; limit?: number }
  ): Promise<Array<Record<string, any> | null>> {
    return compareComponentPairs(pairs, (baseId, compareId) => this.getAPIDiff(baseId, compareId), {
      offset: options?.offset,
      limit: options?.limit,
      concurrency: concurrentComponentsLimit(),
      onError: (pair, err) => {
        this.logger.warn(`apiDiffs: failed to compute api diff ${pair.baseId} <> ${pair.compareId}`, err);
      },
    });
  }

  private static isApiDiffCacheable(result: Record<string, any>): boolean {
    // a live-extracted side reflects the current working tree, not the snap the cache key names —
    // persisting it would serve a stale (possibly degraded) diff for that pair forever.
    if (result.base?.live || result.compare?.live) return false;
    if (result.status === 'COMPUTED') return true;
    // A non-COMPUTED result is only safe to persist (disk cache, keyed on the immutable snap pair, no
    // TTL) when it can never change for that pair. FAILED is transient. NOT_BUILT is *pending*: the snap
    // simply hasn't been built yet, and once CI builds it (same hash) the schema appears — caching the
    // pre-build "unavailable" answer would keep the API view blank forever. NO_EXTRACTOR/DISABLED are
    // stable properties of the snap's env, so they stay cacheable.
    const pendingOrTransient = (reason?: string) => reason === 'FAILED' || reason === 'NOT_BUILT';
    return !pendingOrTransient(result.base?.reason) && !pendingOrTransient(result.compare?.reason);
  }

  async getAPIDiff(baseIdStr: string, compareIdStr: string): Promise<Record<string, any> | null> {
    // never persist a result that can still change: `null` (snaps couldn't load), FAILED (schema
    // retrieval threw) and NOT_BUILT (snap not yet built) must recompute next call; NO_EXTRACTOR/
    // DISABLED are stable env properties and safe to cache (see `isApiDiffCacheable`).
    // the `:v2` namespace keeps pre-availability-aware results from being served.
    return this.getOrCompute(
      this.apiDiffInflight,
      `component-compare:api-diff:v2:${baseIdStr}|${compareIdStr}`,
      () => this.computeAPIDiff(baseIdStr, compareIdStr),
      (v) => v !== null && ComponentCompareMain.isApiDiffCacheable(v)
    );
  }

  private async computeAPIDiff(baseIdStr: string, compareIdStr: string): Promise<Record<string, any> | null> {
    const host = this.componentAspect.getHost();
    const [baseCompId, compareCompId] = await host.resolveMultipleComponentIds([baseIdStr, compareIdStr]);
    await this.importer.importObjectsFromMainIfExist([baseCompId, compareCompId], { cache: true });
    const components = await host.getMany([baseCompId, compareCompId]);
    const baseComponent = components?.[0];
    const compareComponent = components?.[1];
    if (!baseComponent || !compareComponent) return null;
    return this.schema.computeAPIDiff(baseComponent, compareComponent);
  }

  async diffByCLIValues(
    pattern?: string,
    version?: string,
    toVersion?: string,
    { verbose, table, parent }: { verbose?: boolean; table?: boolean; parent?: boolean } = {}
  ): Promise<any> {
    if (!this.workspace) throw new OutsideWorkspaceError();
    const ids = pattern ? await this.workspace.idsByPattern(pattern) : await this.workspace.listTagPendingIds();
    const consumer = this.workspace.consumer;
    if (!ids.length) {
      return [];
    }
    const diffResults = await this.componentsDiff(ids, version, toVersion, {
      verbose,
      formatDepsAsTable: table,
      compareToParent: parent,
    });
    await consumer.onDestroy('diff');
    return diffResults;
  }

  async getConfigForDiffById(id: string): Promise<ConfigDiff> {
    const workspace = this.workspace;
    if (!workspace) throw new OutsideWorkspaceError();
    const componentId = await workspace.resolveComponentId(id);
    const component = await workspace.scope.get(componentId, false);
    if (!component) throw new Error(`getConfigForDiff: unable to find component ${id} in local scope`);
    return this.getConfigForDiffByCompObject(component);
  }

  async getConfigForDiffByCompObject(component: Component, modifiedIds?: ComponentID[]) {
    const depData = this.depResolver.getDependencies(component);
    const modifiedIdsStr = modifiedIds?.map((id) => id.toStringWithoutVersion());
    const serializedToString = (dep: SerializedDependency) => {
      const idWithoutVersion = dep.__type === 'package' ? dep.id : dep.id.split('@')[0];
      const version = modifiedIdsStr?.includes(idWithoutVersion) ? `<modified>` : dep.version;
      return `${idWithoutVersion}@${version} (${dep.lifecycle}) ${dep.source ? `(${dep.source})` : ''}`;
    };
    const serializeAndSort = (deps: DependencyList) => {
      const serialized = deps.serialize().map(serializedToString);
      return serialized.sort();
    };
    const serializeAspect = (comp: Component) => {
      const aspects = comp.state.aspects.withoutEntries([BuilderAspect.id, DependencyResolverAspect.id]);
      // return aspects.serialize();
      return aspects.toLegacy().sortById().toConfigObject();
    };
    return {
      version: component.id.version,
      dependencies: serializeAndSort(depData),
      aspects: serializeAspect(component),
    };
  }

  private async componentsDiff(
    ids: ComponentID[],
    version: string | undefined,
    toVersion: string | undefined,
    diffOpts: DiffOptions
  ): Promise<DiffResults[]> {
    if (!this.workspace) throw new OutsideWorkspaceError();
    const components = await this.workspace.getMany(ids);
    if (!components.length) throw new BitError('failed loading the components');
    if (toVersion && !version)
      throw new BitError('error: componentsDiff expects to get version when toVersion is entered');
    const componentsDiffResults = await Promise.all(
      components.map((component) => this.computeDiff(component, version, toVersion, diffOpts))
    );
    return componentsDiffResults;
  }

  /**
   * this method operates in two modes:
   * 1. workspace mode - the version and toVersion can be undefined.
   * 2. scope mode - the version and toVersion are mandatory.
   */
  private async computeDiff(
    component: Component,
    version: string | undefined,
    toVersion: string | undefined,
    diffOpts: DiffOptions
  ): Promise<DiffResults> {
    const consumerComponent = component.state._consumer as ConsumerComponent;

    const diffResult: DiffResults = { id: component.id, hasDiff: false };
    const modelComponent =
      consumerComponent.modelComponent || (await this.scope.legacyScope.getModelComponentIfExist(component.id));

    if (this.workspace && component.isDeleted()) {
      // component exists in the model but not in the filesystem, show all files as deleted
      const modelFiles = consumerComponent.files;
      diffResult.filesDiff = await getFilesDiff(modelFiles, [], component.id.version, component.id.version);
      if (hasDiff(diffResult)) diffResult.hasDiff = true;
      return diffResult;
    }
    if (!modelComponent) {
      if (version || toVersion) {
        throw new BitError(`component ${component.id.toString()} doesn't have any version yet`);
      }
      // it's a new component. not modified. show all files as new.
      const fsFiles = consumerComponent.files;
      diffResult.filesDiff = await getFilesDiff([], fsFiles, component.id.version, component.id.version);
      if (hasDiff(diffResult)) diffResult.hasDiff = true;
      return diffResult;
    }
    const repository = this.scope.legacyScope.objects;
    const idsToImport = compact([
      version ? component.id.changeVersion(version) : undefined,
      toVersion ? component.id.changeVersion(toVersion) : undefined,
    ]);
    const idList = ComponentIdList.fromArray(idsToImport);
    await this.scope.legacyScope.scopeImporter.importWithoutDeps(idList, { cache: true, reason: 'to show diff' });
    if (diffOpts.compareToParent) {
      if (!version) throw new BitError('--parent flag expects to get version');
      if (toVersion) throw new BitError('--parent flag expects to get only one version');
      const versionObject = await modelComponent.loadVersion(version, repository);
      const parent = versionObject.parents[0];
      toVersion = version;
      version = parent ? modelComponent.getTagOfRefIfExists(parent) : undefined;
    }
    const fromVersionObject = version ? await modelComponent.loadVersion(version, repository) : undefined;
    const toVersionObject = toVersion ? await modelComponent.loadVersion(toVersion, repository) : undefined;
    const fromVersionFiles = await fromVersionObject?.modelFilesToSourceFiles(repository);
    const toVersionFiles = await toVersionObject?.modelFilesToSourceFiles(repository);

    const fromFiles = fromVersionFiles || consumerComponent.componentFromModel?.files;
    if (!fromFiles)
      throw new Error(
        `computeDiff: fromFiles must be defined for ${component.id.toString()}. if on workspace, consumerComponent.componentFromModel must be set. if on scope, fromVersionFiles must be set`
      );
    const toFiles = toVersionFiles || consumerComponent.files;
    const fromVersionLabel = version || component.id.version;
    const toVersionLabel = toVersion || component.id.version;

    diffResult.filesDiff = await getFilesDiff(fromFiles!, toFiles, fromVersionLabel, toVersionLabel);
    const fromVersionComponent = version
      ? await modelComponent.toConsumerComponent(version, this.scope.legacyScope.name, repository)
      : consumerComponent.componentFromModel;

    const toVersionComponent = toVersion
      ? await modelComponent.toConsumerComponent(toVersion, this.scope.legacyScope.name, repository)
      : consumerComponent;

    if (!fromVersionComponent) {
      throw new Error(
        `computeDiff: fromVersionComponent must be defined for ${component.id.toString()}. if on workspace, consumerComponent.componentFromModel must be set. if on scope, "version" must be set`
      );
    }

    await updateFieldsDiff(fromVersionComponent, toVersionComponent, diffResult, diffOpts);

    return diffResult;
  }

  async diffBetweenVersionsObjects(
    modelComponent: ModelComponent,
    fromVersionObject: Version,
    toVersionObject: Version,
    fromVersion: string,
    toVersion: string,
    diffOpts: DiffOptions
  ) {
    const diffResult: DiffResults = { id: modelComponent.toComponentId(), hasDiff: false };
    const scope = this.scope.legacyScope;
    const repository = scope.objects;
    const fromVersionFiles = await fromVersionObject.modelFilesToSourceFiles(repository);
    const toVersionFiles = await toVersionObject.modelFilesToSourceFiles(repository);
    const color = diffOpts.color ?? true;
    diffResult.filesDiff = await getFilesDiff(
      fromVersionFiles,
      toVersionFiles,
      fromVersion,
      toVersion,
      undefined,
      color
    );
    const fromVersionComponent = await modelComponent.toConsumerComponent(
      fromVersionObject.hash().toString(),
      scope.name,
      repository
    );
    const toVersionComponent = await modelComponent.toConsumerComponent(
      toVersionObject.hash().toString(),
      scope.name,
      repository
    );
    await updateFieldsDiff(fromVersionComponent, toVersionComponent, diffResult, diffOpts);
    return diffResult;
  }

  static slots = [];
  static dependencies = [
    GraphqlAspect,
    ComponentAspect,
    ScopeAspect,
    LoggerAspect,
    CLIAspect,
    WorkspaceAspect,
    TesterAspect,
    DependencyResolverAspect,
    ImporterAspect,
    SchemaAspect,
    CacheAspect,
  ];
  static runtime = MainRuntime;
  static async provider([
    graphql,
    component,
    scope,
    loggerMain,
    cli,
    workspace,
    tester,
    depResolver,
    importer,
    schema,
    cache,
  ]: [
    GraphqlMain,
    ComponentMain,
    ScopeMain,
    LoggerMain,
    CLIMain,
    Workspace,
    TesterMain,
    DependencyResolverMain,
    ImporterMain,
    SchemaMain,
    CacheMain,
  ]) {
    const logger = loggerMain.createLogger(ComponentCompareAspect.id);
    const componentCompareMain = new ComponentCompareMain(
      component,
      scope,
      logger,
      tester,
      depResolver,
      importer,
      schema,
      cache,
      workspace
    );
    cli.register(new DiffCmd(componentCompareMain));
    graphql.register(() => componentCompareSchema(componentCompareMain));
    return componentCompareMain;
  }
}

function hasDiff(diffResult: DiffResults): boolean {
  return !!((diffResult.filesDiff && diffResult.filesDiff.find((file) => file.diffOutput)) || diffResult.fieldsDiff);
}

async function updateFieldsDiff(
  componentA: ConsumerComponent,
  componentB: ConsumerComponent,
  diffResult: DiffResults,
  diffOpts: DiffOptions
) {
  diffResult.fieldsDiff = await diffBetweenComponentsObjects(componentA, componentB, diffOpts);
  diffResult.hasDiff = hasDiff(diffResult);
}

ComponentCompareAspect.addRuntime(ComponentCompareMain);

export default ComponentCompareMain;
