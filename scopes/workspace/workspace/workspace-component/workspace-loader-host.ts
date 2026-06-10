import path from 'path';
import fs from 'fs-extra';
import { compact, uniq } from 'lodash';
import mapSeries from 'p-map-series';
import { pMapPool } from '@teambit/toolbox.promise.map-pool';
import { concurrentComponentsLimit } from '@teambit/harmony.modules.concurrency';
import type { Component, InvalidComponent } from '@teambit/component';
import { ComponentFS, Config, State, TagMap } from '@teambit/component';
import type { ComponentID } from '@teambit/component-id';
import { ComponentIdList } from '@teambit/component-id';
import { getLatestVersionNumber } from '@teambit/legacy.utils';
import type { ConsumerComponent as ConsumerComponentType } from '@teambit/legacy.consumer-component';
import { ConsumerComponent, ComponentNotFoundInPath, Dependencies } from '@teambit/legacy.consumer-component';
import { MissingBitMapComponent } from '@teambit/legacy.bit-map';
import { ComponentNotFound as LegacyComponentNotFound } from '@teambit/legacy.scope';
import { ExtensionDataEntry, ExtensionDataList } from '@teambit/legacy.extension-data';
import { IssuesClasses } from '@teambit/component-issues';
import type { LoaderHost, Phase, UnifiedComponentLoader } from '../component-loader';
import type { DependencyResolverMain } from '@teambit/dependency-resolver';
import { DependencyResolverAspect } from '@teambit/dependency-resolver';
import type { EnvsMain } from '@teambit/envs';
import { EnvsAspect } from '@teambit/envs';
import type { AspectLoaderMain } from '@teambit/aspect-loader';
import type { Logger } from '@teambit/logger';
import type { Workspace } from '../workspace';
import { WorkspaceComponent } from './workspace-component';
import { MergeConfigConflict } from '../exceptions/merge-config-conflict';

/**
 * Stage-2 consolidated host. Replaces the per-group state machine in
 * `WorkspaceComponentLoader.getAndLoadSlotOrdered` with a two-pass design:
 *
 *   Pass 1 — build all Components with extensions config, NO slots fired.
 *            Parallel-safe; uses the legacy consumer.loadComponents batch
 *            (which preserves the cold-cache sequential dep-resolution gate
 *            via shouldRunInParallel).
 *
 *   Pass 2 — identify env/aspect/app subset, SCC-order them by env-of-env,
 *            fire slots and register aspects in order. SCC handling supports
 *            cycles between aspects (which Bit allows, though discouraged).
 *
 *   Pass 3 — fire slots on the remaining components in parallel. By this
 *            point all envs/aspects are registered, so slot firing is safe
 *            and order-independent for the non-aspect components.
 *
 * Design: openspec/changes/rewrite-component-loading/spike/01-consolidated-host-sketch.md
 */
export class WorkspaceLoaderHost implements LoaderHost {
  private bitmapVersion = 0;
  private workspaceConfigVersion = 0;
  private aspectStateVersion = 0;

  /**
   * Back-reference to the unified loader. Wired in by `Workspace` constructor
   * via `attachUnifiedLoader`. Currently unused but kept for future use
   * (e.g. publishing partial components to the cache to short-circuit
   * recursive lookups, if we later need that).
   */
  private unifiedLoader?: UnifiedComponentLoader;

  /**
   * Recursion depth of nested `loadMany` calls. The new host's pass 1 chains
   * through `loadComponentsExtensions` → `workspace.importAndGetMany` →
   * `workspace.getMany` → back into this host. Pass 1 of the inner call must
   * skip the `loadComponentsExtensions` step to avoid infinite recursion;
   * the outer call's call to that method handles the full merged extension
   * set anyway.
   */
  private loadingDepth = 0;

  /**
   * Invalid components detected by the most recent OUTER `loadMany` call.
   * Populated in `pass1` (the legacy `consumer.loadComponents` call surfaces
   * components whose source files are missing, manifests are malformed, etc.).
   * Exposed via `getLastInvalid()` so `workspace.listWithInvalidAtPhase` can
   * report them with their actual errors instead of a generic "not found".
   */
  private lastInvalid: InvalidComponent[] = [];

  /**
   * Set once `clearDepsCacheIfEnvJsoncModified` has run in this process.
   * The check walks the workspace's env.jsonc files and clears the disk-level
   * dep-cache if any was modified more recently than the oldest cache entry.
   * Each `bit X` is a fresh process, so once is sufficient.
   */
  private envJsoncCheckDone = false;

  constructor(
    private readonly workspace: Workspace,
    private readonly logger: Logger,
    private readonly dependencyResolver: DependencyResolverMain,
    private readonly envs: EnvsMain,
    private readonly aspectLoader: AspectLoaderMain
  ) {
    workspace.registerOnBitmapChange(async () => {
      this.bitmapVersion += 1;
    });
    workspace.registerOnWorkspaceConfigChange(async () => {
      this.workspaceConfigVersion += 1;
    });
  }

  attachUnifiedLoader(loader: UnifiedComponentLoader): void {
    this.unifiedLoader = loader;
  }

  /**
   * Invalid components detected by the most recent OUTER `loadMany` call.
   * Read this directly after a `workspace.list*` call to report invalid
   * components with their actual error messages (e.g. "main-file was removed",
   * "component files were deleted") instead of a generic "not found".
   *
   * Race note: if another `loadMany` is in-flight concurrently the array can
   * be reset mid-read. All current callers (`bit status`, `bit diff`) run
   * synchronously after their own load, so this is fine in practice.
   */
  getLastInvalid(): InvalidComponent[] {
    return this.lastInvalid;
  }

  // === LoaderHost contract: hash inputs ============================

  listBitmapIds(): ComponentID[] {
    return this.workspace.consumer.bitMap.getAllIdsAvailableOnLane();
  }

  bitmapHash(): string {
    return `bm-${this.bitmapVersion}`;
  }

  workspaceConfigHash(): string {
    return `wc-${this.workspaceConfigVersion}`;
  }

  aspectStateHash(): string {
    return `as-${this.aspectStateVersion}`;
  }

  fileSignature(id: ComponentID): string {
    return `${id.toString()}@${this.bitmapVersion}`;
  }

  componentConfigHash(id: ComponentID): string {
    return `${id.toString()}@${this.bitmapVersion}-${this.workspaceConfigVersion}`;
  }

  // === LoaderHost contract: load ===================================

  async loadAtPhase(id: ComponentID, _phase: Phase): Promise<Component | undefined> {
    try {
      const results = await this.loadMany([id]);
      return results.get(id.toString());
    } catch (err) {
      if (this.isNotFoundError(err)) return undefined;
      throw err;
    }
  }

  async loadManyAtPhase(ids: ComponentID[], _phase: Phase): Promise<Map<string, Component>> {
    return this.loadMany(ids);
  }

  /**
   * Build a harmony Component around a pre-loaded legacy `ConsumerComponent`
   * and fire its onLoad slots. Used by the `consumer.loadComponents` →
   * `onComponentLoadSubscriber` bridge (workspace.main.runtime.ts) and by
   * `getDevFilesForConsumerComp` (dev-files), both of which already hold a
   * mid-load legacy and need the harmony view + slot data without paying for
   * a full unified load (which would re-trigger `consumer.loadComponents` for
   * the same id and recurse).
   *
   * Publishes the built component to the unified cache so that subsequent
   * `workspace.get(id)` calls (e.g. for core aspects whose legacy form is
   * loaded during bootstrap by the subscriber) hit the cache. Without this,
   * core aspects appear as ComponentNotFound when callers like
   * `Workspace.setEnvToComponents` later ask for them — they're not in the
   * workspace bitmap and not in scope.
   */
  async buildAndLoadFromLegacy(legacy: ConsumerComponentType): Promise<Component> {
    const id = legacy.id;
    const fromScope = await this.workspace.scope.get(id);
    const { extensions, errors } = await this.workspace.componentExtensions(id, fromScope);
    if (errors?.some((e) => e instanceof MergeConfigConflict)) {
      legacy.issues.getOrCreate(IssuesClasses.MergeConfigHasConflict).data = true;
    }
    legacy.extensions = extensions;
    const state = new State(
      new Config(legacy),
      await this.workspace.createAspectList(extensions),
      ComponentFS.fromVinyls(legacy.files),
      legacy.dependencies,
      legacy
    );
    const component = fromScope
      ? new WorkspaceComponent(fromScope.id, fromScope.head, state, fromScope.tags, this.workspace)
      : new WorkspaceComponent(id, null, state, new TagMap(), this.workspace);
    await this.executeLoadSlot(component);
    if (this.unifiedLoader) {
      this.unifiedLoader.publish(component.id, 'aspects', component);
    }
    return component;
  }

  // === Two-pass load orchestration =================================

  private async loadMany(ids: ComponentID[]): Promise<Map<string, Component>> {
    if (!ids.length) return new Map();

    this.loadingDepth += 1;
    if (this.loadingDepth === 1) {
      this.lastInvalid = [];
      await this.clearDepsCacheIfEnvJsoncModified();
    }
    try {
      const { workspaceIds, scopeIds, inputKeyByResolvedKey } = await this.partitionIds(ids);
      const pass1 = await this.pass1BuildComponentsNoSlots(workspaceIds, scopeIds);
      if (pass1.invalid.length) this.lastInvalid.push(...pass1.invalid);

      // Always fire slots so the returned components have env/dep data
      // populated. Pre-rewrite WCL did this unconditionally, even for
      // recursive calls, because the slot-fired data is what downstream
      // consumers (`workspaceAspectResolver` -> `getEnvId`) rely on.
      await this.pass2FireSlots(pass1.workspaceComponents, pass1.envIdByCompKey);

      // Only the OUTERMOST call registers components as aspects, computes
      // post-load issues, and runs other one-shot work. Doing this on
      // recursive calls would re-enter `workspace.loadAspects` -> back into
      // this host indefinitely.
      if (this.loadingDepth === 1) {
        await this.pass2RegisterAspects(pass1.workspaceComponents, pass1.scopeComponents);
        await this.applyPostLoadIssuesAndWarnings(pass1.workspaceComponents);
      }
      for (const c of pass1.workspaceComponents) c.loadedPhase = 'aspects';
      for (const c of pass1.scopeComponents) c.loadedPhase = 'aspects';

      // Key the result Map under every plausible string form the caller might
      // look up:
      //   1. the resolved id (`c.id.toString()`) — canonical
      //   2. the original input id from `partitionIds` — workspace ids get
      //      resolved to their bitmap version, so callers using versionless
      //      input still find a match
      //   3. the versionless form of the resolved id — scope-only ids are
      //      input versionless but `scope.get` returns a versioned component;
      //      callers (e.g. `Workspace.resolveEnvIdWithPotentialVersionForConfig`)
      //      look up by the input (versionless) id
      //   4. any input id whose VERSIONLESS form matches this component — covers
      //      out-of-sync flows where `consumer.loadComponents`'s
      //      `_handleOutOfSyncScenarios` strips the version mid-load (bitmap
      //      had `X@0.0.1` but scope is empty → component ends up as plain `X`).
      //      Without this the caller asks for `X@0.0.1` but the Map only has `X`.
      const result = new Map<string, Component>();
      const setAllKeys = (c: Component) => {
        const resolvedKey = c.id.toString();
        const versionlessKey = c.id.toStringWithoutVersion();
        result.set(resolvedKey, c);
        const inputKey = inputKeyByResolvedKey.get(resolvedKey);
        if (inputKey && inputKey !== resolvedKey) result.set(inputKey, c);
        if (!result.has(versionlessKey)) result.set(versionlessKey, c);
        for (const [resKey, mappedInputKey] of inputKeyByResolvedKey) {
          const inputVersionless = mappedInputKey.split('@')[0];
          const resVersionless = resKey.split('@')[0];
          if (inputVersionless === versionlessKey || resVersionless === versionlessKey) {
            result.set(mappedInputKey, c);
            result.set(resKey, c);
          }
        }
      };
      for (const c of pass1.workspaceComponents) setAllKeys(c);
      for (const c of pass1.scopeComponents) setAllKeys(c);
      return result;
    } finally {
      this.loadingDepth -= 1;
    }
  }

  // === env.jsonc invalidation =====================================

  /**
   * Clears the disk-level dep cache if any env.jsonc in the workspace was
   * modified more recently than the oldest dep-cache entry.
   *
   * Why: dependencies-loader has a per-component check that only fires when
   * the env-owning component itself is loaded through `consumer.loadComponents`.
   * The new loader's pass1 uses `loadExtensions: false`, which suppresses the
   * `onComponentConfigLoading` → `warnAboutMisconfiguredEnv` recursion that
   * pre-rewrite WCL.get used to fire and which, as a side effect, loaded the
   * env-owning component first and triggered its per-component env.jsonc check.
   * Without that side-channel, comp1 loads from the stale cache (`lodash:
   * runtime`) even though the env's env.jsonc has been edited to mark
   * `*.content.tsx` as dev-files.
   *
   * Runs once per process — each `bit X` invocation is a fresh process.
   */
  private async clearDepsCacheIfEnvJsoncModified(): Promise<void> {
    if (this.envJsoncCheckDone) return;
    this.envJsoncCheckDone = true;
    try {
      const fsCache = this.workspace.consumer.componentFsCache;
      const cacheList = await fsCache.listDependenciesDataCache();
      const timestamps = Object.values(cacheList).map((entry: any) => entry.time as number);
      if (!timestamps.length) return;
      const oldestCache = Math.min(...timestamps);
      const wsPath = this.workspace.path;
      const componentMaps = this.workspace.consumer.bitMap.getAllComponents();
      for (const cm of componentMaps) {
        if (!cm.rootDir) continue;
        const envJsoncPath = path.join(wsPath, cm.rootDir, 'env.jsonc');
        const stat = await fs.stat(envJsoncPath).catch(() => undefined);
        if (!stat) continue;
        if (stat.mtimeMs > oldestCache) {
          this.logger.debug(`env.jsonc at ${cm.rootDir} modified after dep-cache; clearing all dep caches`);
          await fsCache.deleteAllDependenciesDataCache();
          return;
        }
      }
    } catch (err: any) {
      this.logger.debug(`clearDepsCacheIfEnvJsoncModified failed: ${err?.message}`);
    }
  }

  // === Pass 0: partition workspace vs scope ids ====================

  private async partitionIds(ids: ComponentID[]) {
    const nonDeleted = this.workspace.listIds();
    const deleted = await this.workspace.locallyDeletedIds();
    const all = nonDeleted.concat(deleted);
    const workspaceIds: ComponentID[] = [];
    const scopeIds: ComponentID[] = [];
    // Resolved-key → input-key mapping. Workspace ids get resolved to their
    // bitmap version before loading; loadMany uses this to also key the result
    // Map by the caller's original id string so lookup-by-input-id works for
    // both versionless and versioned input.
    const inputKeyByResolvedKey = new Map<string, string>();
    for (const id of ids) {
      const inWs = all.find((wid) => wid.isEqual(id, { ignoreVersion: !id.hasVersion() }));
      const resolved = inWs ? this.resolveVersion(id) : id;
      inputKeyByResolvedKey.set(resolved.toString(), id.toString());
      if (inWs) workspaceIds.push(resolved);
      else scopeIds.push(resolved);
    }
    return { workspaceIds, scopeIds, inputKeyByResolvedKey };
  }

  private resolveVersion(id: ComponentID): ComponentID {
    const bitIds = this.workspace.consumer.bitmapIdsFromCurrentLaneIncludeRemoved;
    const withVer = getLatestVersionNumber(bitIds, id);
    return withVer.version ? id.changeVersion(withVer.version) : id;
  }

  // === Pass 1: build all Components with config, NO slots ==========

  private async pass1BuildComponentsNoSlots(workspaceIds: ComponentID[], scopeIds: ComponentID[]) {
    const invalid: InvalidComponent[] = [];
    const envIdByCompKey = new Map<string, string | undefined>();

    // -- workspace side: file reads + dep extraction in a single batch --
    let legacyComps: ConsumerComponentType[] = [];
    let removedLegacy: ConsumerComponentType[] = [];
    if (workspaceIds.length) {
      const { components, invalidComponents, removedComponents } = await this.workspace.consumer.loadComponents(
        ComponentIdList.fromArray(workspaceIds),
        false,
        {
          // `loadExtensions: true` because several effects ride on the
          // `onComponentConfigLoading` subscriber chain that fires inside
          // `Component.loadFromFileSystem` only when this flag is true:
          //   - `workspace.componentExtensions` -> `loadComponentsExtensions`
          //     loads each component's env aspect, registering custom
          //     dep-detectors BEFORE the same component's `loadDependencies`
          //     runs (otherwise external envs' custom file-extensions like
          //     `.custom` aren't parsed -> add-missing-deps misses them).
          //   - the same chain calls `warnAboutMisconfiguredEnv`, which
          //     calls `workspace.get(envId)` and re-enters this host for
          //     the env component, firing the env's `dependencies-loader`.
          //     That fires the per-component env.jsonc-mtime check that
          //     clears all dep caches if env.jsonc was edited.
          // The deferred `loadComponentsExtensions` call at the end of
          // pass1 is still useful for extensions that didn't fire via the
          // per-component path (e.g. scope-only components).
          loadExtensions: true,
          executeLoadSlot: false,
          loadDocs: false,
          loadCompositions: false,
          // Suppress the global onComponentLoad subscriber from firing
          // workspace.get for every legacy component we load. The subscriber
          // exists to bridge legacy-only callers back to the harmony side;
          // here we ARE the harmony side, so the bridge would be a redundant
          // round-trip and (once Workspace.get routes through unified) a
          // recursion path.
          originatedFromHarmony: true,
        } as any
      );
      legacyComps = components;
      removedLegacy = removedComponents || [];
      for (const ic of invalidComponents || []) {
        if (ConsumerComponent.isComponentInvalidByErrorType(ic.error)) {
          invalid.push({ id: ic.id, err: ic.error });
        }
      }
    }
    const allLegacy = legacyComps.concat(removedLegacy);

    // -- scope side: fetch scope versions for extension merging --
    // Workspace ids: scope view is only used for extension merging, so a
    // missing scope version is tolerable — degrade silently per-id, no import.
    const scopeForWs = workspaceIds.length ? await this.getScopeComponentsSafe(workspaceIds, false) : [];
    // Scope-only ids: the caller explicitly asked for these as components
    // (typically external envs/aspects). Mirror the pre-rewrite WCL flow that
    // routed through `scope.get(id)` with `importIfMissing=true` so a missing
    // model is fetched from the remote rather than reported as not-found.
    const scopeOnly = scopeIds.length ? await this.getScopeComponentsSafe(scopeIds, true) : [];
    const scopeByKey = new Map(scopeForWs.map((c) => [c.id.toStringWithoutVersion(), c]));

    // -- build harmony Components with merged extensions (no slots fired) --
    const built = await pMapPool(
      allLegacy,
      async (legacy) => {
        const id = legacy.id;
        const fromScope = scopeByKey.get(id.toStringWithoutVersion());
        try {
          const { extensions, errors, envId } = await this.workspace.componentExtensions(id, fromScope, undefined, {
            loadExtensions: false,
          } as any);
          envIdByCompKey.set(id.toStringWithoutVersion(), envId);
          if (errors?.some((e) => e instanceof MergeConfigConflict)) {
            legacy.issues.getOrCreate(IssuesClasses.MergeConfigHasConflict).data = true;
          }
          // Temporary mutation — keeps the legacy view in sync with harmony.
          // Removed when task 8.8 (consumer-component mutation cleanup) lands.
          legacy.extensions = extensions;
          const state = new State(
            new Config(legacy),
            await this.workspace.createAspectList(extensions),
            ComponentFS.fromVinyls(legacy.files),
            legacy.dependencies,
            legacy
          );
          if (fromScope) {
            return new WorkspaceComponent(fromScope.id, fromScope.head, state, fromScope.tags, this.workspace);
          }
          return new WorkspaceComponent(id, null, state, new TagMap(), this.workspace);
        } catch (err: any) {
          if (ConsumerComponent.isComponentInvalidByErrorType(err)) {
            invalid.push({ id, err });
            return undefined;
          }
          if (this.isNotFoundError(err)) return undefined;
          throw err;
        }
      },
      { concurrency: concurrentComponentsLimit() }
    );

    const workspaceComponents = compact(built) as WorkspaceComponent[];

    // Register external aspects (envs like react-env, node-env) referenced by
    // the batch's components. Without this, env-issue checking later finds
    // unregistered envs and falsely flags every dependent component.
    //
    // Skipped on recursive calls — `loadComponentsExtensions` chains to
    // `workspace.importAndGetMany` → `workspace.getMany`, which routes back
    // through this host. If the inner call also tried to load extensions, it
    // would recurse again. The outer call's loadComponentsExtensions handles
    // the full merged set anyway, so inner calls returning config-only
    // components is sufficient for the aspect-resolve work they participate
    // in (which reads `state.aspects` config, not slot-fired data).
    if (workspaceComponents.length && this.loadingDepth === 1) {
      const allExts: ExtensionDataList[] = workspaceComponents.map((c) => c.state._consumer.extensions);
      const merged = ExtensionDataList.mergeConfigs(allExts, false);
      await this.workspace.loadComponentsExtensions(merged);
    }

    return { workspaceComponents, scopeComponents: scopeOnly, invalid, envIdByCompKey };
  }

  /**
   * Per-id scope fetch.
   *
   * `importIfMissing=false` is used for workspace ids — the scope view is just
   * for extension merging and a missing version is tolerable (the pre-rewrite
   * WCL took this same shortcut in `populateScopeAndExtensionsCache`).
   *
   * `importIfMissing=true` is used for scope-only ids — these are external
   * aspects/envs the caller explicitly asked for; the pre-rewrite WCL routed
   * them through `scope.get(id)` (default `importIfMissing=true`), so a
   * missing model was fetched from the remote rather than reported as
   * not-found.
   *
   * The `throwWsJsoncAspectNotFoundError` re-throw is the one case we still
   * want to surface — it indicates the workspace.jsonc references an aspect
   * that wasn't fetched.
   */
  private async getScopeComponentsSafe(ids: ComponentID[], importIfMissing: boolean): Promise<Component[]> {
    const results = await Promise.all(
      ids.map(async (id) => {
        try {
          return await this.workspace.scope.get(id, undefined, importIfMissing);
        } catch (err: any) {
          const wsAspectLoader = this.workspace.getWorkspaceAspectsLoader();
          wsAspectLoader.throwWsJsoncAspectNotFoundError(err);
          this.logger.warn(`failed loading component ${id.toString()} from scope`, err);
          return undefined;
        }
      })
    );
    return compact(results);
  }

  // === Pass 2a: fire slots ==========================================
  //
  // Fires `executeLoadSlot` for every workspace component in parallel.
  // Runs on every load call (outer AND recursive) so that components
  // returned to the caller carry env/dep data — the contract that
  // downstream callers like `workspaceAspectResolver` -> `getEnvId`
  // depend on. Pre-rewrite WCL did the same unconditionally.

  private async pass2FireSlots(
    workspaceComponents: Component[],
    envIdByCompKey: Map<string, string | undefined>
  ): Promise<void> {
    if (!workspaceComponents.length) return;

    // SCC order: envs' slots fire before their consumers' slots so that
    // `calcDescriptor`'s env-self-descriptor work sees the env aspect
    // already registered. Components whose env isn't in this batch
    // (e.g. external envs) form their own singleton group and fire freely.
    const groups = this.sccOrderByEnv(workspaceComponents, envIdByCompKey);
    for (const group of groups) {
      await Promise.all(group.map((comp) => this.executeLoadSlot(comp)));
    }
  }

  // === Pass 2b: register aspect-typed components ===================
  //
  // Identifies which components are aspects/envs (envsData.data.type
  // populated by the slot fire above) and registers them via
  // `workspace.loadAspects`. Only runs on the outermost call —
  // recursive calls inherit the outer's registration.

  private async pass2RegisterAspects(workspaceComponents: Component[], scopeComponents: Component[]): Promise<void> {
    const all = workspaceComponents.concat(scopeComponents);
    // Skip aspects already configured in `workspace.jsonc`. Those are loaded
    // by the CLI bootstrap path (`workspace.main.runtime.ts:cli.registerOnStart`)
    // with the correct `neededFor` context ("teambit.workspace/workspace
    // (cli.registerOnStart)"), which surface as user-facing warnings via the
    // status command's loader spinner. If we load them here first, the
    // bootstrap path sees them as already-attempted (aspect-loader's
    // `isAspectLoaded` returns true for failed loads too) and skips —
    // suppressing the warning the user is meant to see.
    const configuredAspectIds = new Set(this.aspectLoader.getConfiguredAspects());
    const aspectIds = all
      .filter((c) => this.shouldLoadAsAspect(c))
      .map((c) => c.id.toString())
      .filter((id) => !configuredAspectIds.has(id) && !configuredAspectIds.has(id.split('@')[0]));
    if (!aspectIds.length) return;

    try {
      await this.workspace.loadAspects(aspectIds, true, 'self loading aspects', {
        useScopeAspectsCapsule: true,
      } as any);
    } catch {
      // Log message only (no error object). The inner aspect-loader's own
      // `consoleWarning` / `logger.error` paths already surface the user-facing
      // diagnostic; passing `err` to `logger.warn` here would dump the entire
      // stack trace (including the require stack) into stdout at the default
      // log level, breaking tests like `aspect.e2e: commands without loaders
      // should not show the entire stacktrace`. Stack is still available at
      // `--log=error`.
      this.logger.warn(`failed loading components as aspects: ${aspectIds.join(', ')}`);
    }
  }

  private shouldLoadAsAspect(c: Component): boolean {
    const idStrWithoutVer = c.id.toStringWithoutVersion();
    if (this.aspectLoader.isCoreAspect(idStrWithoutVer)) return false;
    if (this.aspectLoader.isAspectLoaded(c.id.toString())) return false;

    const envsData = c.state.aspects.get(EnvsAspect.id);
    const appData = c.state.aspects.get('teambit.harmony/application');

    if (appData?.data?.appName) return true;
    if (envsData?.data?.services || envsData?.data?.self || envsData?.data?.type === 'env') return true;
    // Components of type='aspect' (e.g. created via `bit create bit-aspect`)
    // are NOT auto-loaded. Pre-rewrite WCL.loadCompsAsAspects gated this on
    // `loadOpts.aspects`, which the default getMany path left undefined, so
    // bit-aspects were only loaded when the user opted in via `bit use` (which
    // adds them to workspace.jsonc → `cli.registerOnStart` loads them). Loading
    // them eagerly here causes the aspect's provider to run during `bit tag`,
    // which fires side effects (e.g. the persist hook in
    // `repository-hooks-aspects.e2e`) and breaks subsequent reads.
    return false;
  }

  /**
   * SCC-order candidate aspects by env-of-env relation.
   *
   * Uses Tarjan's algorithm. Each emitted group is a strongly-connected
   * component: size-1 means a regular node, size-N means a cycle.
   * Tarjan's emits SCCs in reverse-topological order, which gives us
   * "providers (envs) before consumers" — exactly what we want for
   * aspect registration: an env must be registered before its consumers'
   * onLoad slots fire.
   *
   * Cycles between aspects (rare but supported in Bit) are handled by
   * processing all cycle members in parallel within their group, matching
   * today's group-machinery behavior.
   */
  private sccOrderByEnv(components: Component[], envIdByCompKey: Map<string, string | undefined>): Component[][] {
    const candidateKeys = new Set(components.map((c) => c.id.toStringWithoutVersion()));
    const compByKey = new Map(components.map((c) => [c.id.toStringWithoutVersion(), c]));

    // adjacency: for each candidate, list its env IF the env is also a candidate
    const adj = new Map<string, string[]>();
    for (const c of components) {
      const key = c.id.toStringWithoutVersion();
      const envIdStr = envIdByCompKey.get(key);
      if (!envIdStr) {
        adj.set(key, []);
        continue;
      }
      const envKey = envIdStr.split('@')[0];
      if (candidateKeys.has(envKey) && envKey !== key) {
        adj.set(key, [envKey]);
      } else {
        adj.set(key, []);
      }
    }

    // Tarjan's SCC, iterative to avoid stack overflow on pathological inputs
    let index = 0;
    const indexOf = new Map<string, number>();
    const lowlink = new Map<string, number>();
    const onStack = new Set<string>();
    const stack: string[] = [];
    const sccs: Component[][] = [];

    const strongConnect = (root: string) => {
      // simulate recursion with an explicit stack
      const callStack: Array<{ v: string; nbrIdx: number }> = [{ v: root, nbrIdx: 0 }];
      indexOf.set(root, index);
      lowlink.set(root, index);
      index += 1;
      stack.push(root);
      onStack.add(root);

      while (callStack.length) {
        const frame = callStack[callStack.length - 1];
        const neighbors = adj.get(frame.v) || [];
        if (frame.nbrIdx < neighbors.length) {
          const w = neighbors[frame.nbrIdx];
          frame.nbrIdx += 1;
          if (!indexOf.has(w)) {
            indexOf.set(w, index);
            lowlink.set(w, index);
            index += 1;
            stack.push(w);
            onStack.add(w);
            callStack.push({ v: w, nbrIdx: 0 });
          } else if (onStack.has(w)) {
            lowlink.set(frame.v, Math.min(lowlink.get(frame.v)!, indexOf.get(w)!));
          }
        } else {
          // done with frame.v
          if (lowlink.get(frame.v) === indexOf.get(frame.v)) {
            const scc: Component[] = [];
            let w: string;
            do {
              w = stack.pop()!;
              onStack.delete(w);
              const c = compByKey.get(w);
              if (c) scc.push(c);
            } while (w !== frame.v);
            sccs.push(scc);
          }
          callStack.pop();
          if (callStack.length) {
            const parent = callStack[callStack.length - 1];
            lowlink.set(parent.v, Math.min(lowlink.get(parent.v)!, lowlink.get(frame.v)!));
          }
        }
      }
    };

    for (const c of components) {
      const key = c.id.toStringWithoutVersion();
      if (!indexOf.has(key)) strongConnect(key);
    }

    return sccs;
  }

  // === executeLoadSlot — lifted from WorkspaceComponentLoader =======
  // Body matches the legacy executeLoadSlot exactly. The only difference is
  // location: it lives here so the host owns its own slot-firing rather
  // than delegating to the WorkspaceComponentLoader (which is being deleted).

  private async executeLoadSlot(component: Component): Promise<void> {
    if (component.state._consumer.removed) {
      component.loadedPhase = 'aspects';
      return;
    }

    const envsData = await this.envs.calcDescriptor(component, {
      skipWarnings: !!this.workspace.inInstallContext,
    });

    const wsDeps = component.state._consumer.dependencies.dependencies || [];
    const modelDeps = component.state._consumer.componentFromModel?.dependencies.dependencies || [];
    const merged = Dependencies.merge([wsDeps, modelDeps]);
    const envExtendsDeps = merged.get();

    const policy = await this.dependencyResolver.mergeVariantPolicies(
      component.config.extensions,
      component.id,
      component.state._consumer.files,
      envExtendsDeps
    );
    const dependenciesList = await this.dependencyResolver.extractDepsFromLegacy(component, policy);
    const resolvedEnvJsonc = await this.envs.calculateEnvManifest(
      component,
      component.state._consumer.files,
      envExtendsDeps
    );
    if (resolvedEnvJsonc) {
      // @ts-ignore — envsData shape varies
      envsData.resolvedEnvJsonc = resolvedEnvJsonc;
    }

    const depResolverData = {
      packageName: this.dependencyResolver.calcPackageName(component),
      dependencies: dependenciesList.serialize(),
      policy: policy.serialize(),
      componentRangePrefix: this.dependencyResolver.calcComponentRangePrefixByConsumerComponent(
        component.state._consumer
      ),
    };

    await Promise.all([
      this.upsertExtensionData(component, EnvsAspect.id, envsData),
      this.upsertExtensionData(component, DependencyResolverAspect.id, depResolverData),
    ]);

    // Refresh aspect list to include the envs/deps data just upserted.
    const refreshedAspects = await this.workspace.createAspectList(component.state.config.extensions);
    component.state.aspects = refreshedAspects;

    const entries = this.workspace.onComponentLoadSlot.toArray();
    await mapSeries(entries, async ([extension, onLoad]) => {
      const data = await onLoad(component);
      await this.upsertExtensionData(component, extension, data);
      component.state.aspects.upsertEntry(await this.workspace.resolveComponentId(extension), data);
    });

    component.loadedPhase = 'aspects';

    // Publish the now-fully-loaded component to the unified cache so that any
    // RECURSIVE `workspace.getMany([id])` later in this same outer load
    // (typically pass 2's `workspace.loadAspects` -> `WorkspaceAspectsLoader.
    // resolveAspects` -> `workspaceAspectResolver` -> `getComponentPackagePath`
    // -> `EnvsMain.getEnvId`) short-circuits on the cache hit instead of
    // re-entering the host. Without this, the recursive build returns a
    // config-only component (pass 1 skipped slot-firing under `loadingDepth>1`)
    // and `getEnvId` throws "no env found for X".
    if (this.unifiedLoader) {
      this.unifiedLoader.publish(component.id, 'aspects', component);
    }
  }

  private async upsertExtensionData(component: Component, extension: string, data: any) {
    if (!data) return;
    const existing = component.state.config.extensions.findExtension(extension);
    if (existing) {
      Object.assign(existing.data, data);
      return;
    }
    component.state.config.extensions.push(new ExtensionDataEntry(undefined, undefined, extension, undefined, data));
  }

  // === Post-load issues and warnings ===============================

  private async applyPostLoadIssuesAndWarnings(components: Component[]) {
    for (const c of components) {
      const envs = this.envs.getAllEnvsConfiguredOnComponent(c);
      const envIds = uniq(envs.map((e) => e.id));
      if (envIds.length >= 2) {
        c.state.issues.getOrCreate(IssuesClasses.MultipleEnvs).data = envIds;
      }
    }
    const allEnvIds = uniq(components.map((c) => this.envs.getEnvId(c)));
    await Promise.all(allEnvIds.map((envId) => this.workspace.warnAboutMisconfiguredEnv(envId)));
  }

  // === Error helpers ================================================

  private isNotFoundError(err: any): boolean {
    return (
      err instanceof MissingBitMapComponent ||
      err instanceof ComponentNotFoundInPath ||
      err instanceof LegacyComponentNotFound
    );
  }
}
