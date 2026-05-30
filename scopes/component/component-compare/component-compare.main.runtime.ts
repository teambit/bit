import type { CLIMain } from '@teambit/cli';
import { CLIAspect, MainRuntime } from '@teambit/cli';
import { compact } from 'lodash';
import { BitError } from '@teambit/bit-error';
import type { Workspace } from '@teambit/workspace';
import { WorkspaceAspect, OutsideWorkspaceError } from '@teambit/workspace';
import type { ComponentID } from '@teambit/component-id';
import { ComponentIdList } from '@teambit/component-id';
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
import { CACHE_ROOT } from '@teambit/legacy.constants';
import fs from 'fs-extra';
import path from 'path';

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
    private workspace?: Workspace
  ) {
    this.loadCompareMemoFromDisk();
    this.loadApiDiffMemoFromDisk();
  }

  /**
   * Memoize `compare()` per immutable `(baseId, compareId)` pair. Each result can be ~220 KB (full
   * file diffs + aspects + tests) but the value is deterministic on the underlying snap hashes, so
   * it's safe to cache for the process lifetime AND across restarts. Bounded LRU + debounced save.
   *
   * Combined with the single-flight map, this collapses the N-parallel-pair cost of
   * `compareComponents` to one compute per unique pair across the whole server lifetime.
   */
  private compareMemo = new Map<string, ComponentCompareResult>();
  private compareInflight = new Map<string, Promise<ComponentCompareResult>>();
  private compareMemoDirty = false;
  private compareMemoSaveTimer: NodeJS.Timeout | undefined;
  private static COMPARE_MEMO_MAX = 200;
  private static COMPARE_MEMO_FILE = path.join(CACHE_ROOT, 'component-compare-results.json');

  /** API-diff memo: full result object so the graphql `apiDiff` resolver hits it too. */
  private apiDiffMemo = new Map<string, Record<string, any> | null>();
  private apiDiffInflight = new Map<string, Promise<Record<string, any> | null>>();
  private apiDiffMemoDirty = false;
  private apiDiffMemoSaveTimer: NodeJS.Timeout | undefined;
  private static API_DIFF_MEMO_MAX = 500;
  private static API_DIFF_MEMO_FILE = path.join(CACHE_ROOT, 'component-compare-api-diff.json');

  private async loadCompareMemoFromDisk() {
    try {
      const raw = await fs.readFile(ComponentCompareMain.COMPARE_MEMO_FILE, 'utf8');
      const parsed = JSON.parse(raw) as Record<string, ComponentCompareResult>;
      for (const [k, v] of Object.entries(parsed)) this.compareMemo.set(k, v);
      this.logger?.debug(`[component-compare memo] loaded ${this.compareMemo.size} compare entries`);
    } catch {
      // first run / corrupted file.
    }
  }

  private scheduleCompareMemoSave() {
    this.compareMemoDirty = true;
    if (this.compareMemoSaveTimer) return;
    this.compareMemoSaveTimer = setTimeout(() => {
      this.compareMemoSaveTimer = undefined;
      if (!this.compareMemoDirty) return;
      this.compareMemoDirty = false;
      const serialized: Record<string, ComponentCompareResult> = {};
      for (const [k, v] of this.compareMemo) serialized[k] = v;
      fs.outputFile(ComponentCompareMain.COMPARE_MEMO_FILE, JSON.stringify(serialized)).catch(() => {});
    }, 1000);
  }

  private memoStoreCompare(key: string, result: ComponentCompareResult) {
    if (this.compareMemo.size >= ComponentCompareMain.COMPARE_MEMO_MAX) {
      const firstKey = this.compareMemo.keys().next().value;
      if (firstKey) this.compareMemo.delete(firstKey);
    }
    this.compareMemo.set(key, result);
    this.scheduleCompareMemoSave();
  }

  private async loadApiDiffMemoFromDisk() {
    try {
      const raw = await fs.readFile(ComponentCompareMain.API_DIFF_MEMO_FILE, 'utf8');
      const parsed = JSON.parse(raw) as Record<string, Record<string, any> | null>;
      for (const [k, v] of Object.entries(parsed)) this.apiDiffMemo.set(k, v);
      this.logger?.debug(`[component-compare memo] loaded ${this.apiDiffMemo.size} api-diff entries`);
    } catch {
      // first run / corrupted file.
    }
  }

  private scheduleApiDiffMemoSave() {
    this.apiDiffMemoDirty = true;
    if (this.apiDiffMemoSaveTimer) return;
    this.apiDiffMemoSaveTimer = setTimeout(() => {
      this.apiDiffMemoSaveTimer = undefined;
      if (!this.apiDiffMemoDirty) return;
      this.apiDiffMemoDirty = false;
      const serialized: Record<string, Record<string, any> | null> = {};
      for (const [k, v] of this.apiDiffMemo) serialized[k] = v;
      fs.outputFile(ComponentCompareMain.API_DIFF_MEMO_FILE, JSON.stringify(serialized)).catch(() => {});
    }, 1000);
  }

  private memoStoreApiDiff(key: string, result: Record<string, any> | null) {
    if (this.apiDiffMemo.size >= ComponentCompareMain.API_DIFF_MEMO_MAX) {
      const firstKey = this.apiDiffMemo.keys().next().value;
      if (firstKey) this.apiDiffMemo.delete(firstKey);
    }
    this.apiDiffMemo.set(key, result);
    this.scheduleApiDiffMemoSave();
  }

  async compare(baseIdStr: string, compareIdStr: string): Promise<ComponentCompareResult> {
    const memoKey = `${baseIdStr}|${compareIdStr}`;
    const cached = this.compareMemo.get(memoKey);
    if (cached) return cached;

    // single-flight: concurrent calls for the same pair share one computation. With the lane
    // compare UI firing CompareComponents (a single op with many pairs) in parallel with the lane
    // diff status (which derives change types through this same `compare()`), without dedupe each
    // pair is computed twice on cold paths.
    const pending = this.compareInflight.get(memoKey);
    if (pending) return pending;
    const promise = this.computeCompare(baseIdStr, compareIdStr)
      .then((result) => {
        this.memoStoreCompare(memoKey, result);
        return result;
      })
      .finally(() => {
        this.compareInflight.delete(memoKey);
      });
    this.compareInflight.set(memoKey, promise);
    return promise;
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

    const diff = componentWithoutVersion
      ? await this.computeDiff(
          componentWithoutVersion,
          comparingWithLocalChanges ? undefined : baseVersion,
          comparingWithLocalChanges ? undefined : compareVersion,
          {}
        )
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

  async getAPIDiff(baseIdStr: string, compareIdStr: string): Promise<Record<string, any> | null> {
    const memoKey = `${baseIdStr}|${compareIdStr}`;
    if (this.apiDiffMemo.has(memoKey)) {
      return this.apiDiffMemo.get(memoKey) ?? null;
    }
    const pending = this.apiDiffInflight.get(memoKey);
    if (pending) return pending;

    const promise = this.computeAPIDiff(baseIdStr, compareIdStr)
      .then((result) => {
        // Avoid poisoning the cache with `null` from a transient failure. `null` here can mean
        // "components couldn't be loaded right now" (e.g. snap not yet imported) — caching it
        // permanently would lock the resolver to a wrong answer for these immutable ids until
        // the disk file is deleted. Re-fetch on the next call instead.
        if (result !== null) this.memoStoreApiDiff(memoKey, result);
        return result;
      })
      .finally(() => {
        this.apiDiffInflight.delete(memoKey);
      });
    this.apiDiffInflight.set(memoKey, promise);
    return promise;
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
