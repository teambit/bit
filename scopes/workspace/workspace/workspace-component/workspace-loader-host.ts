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
    try {
      const { workspaceIds, scopeIds, inputKeyByResolvedKey } = await this.partitionIds(ids);
      const pass1 = await this.pass1BuildComponentsNoSlots(workspaceIds, scopeIds);

      // Recursive calls return config-only components without firing slots.
      // The outer call's pass 2/3 handle the full aspect-loading; inner
      // callers (typically aspect-resolve flows) need config-level state
      // but not slot data.
      if (this.loadingDepth === 1) {
        await this.pass2LoadAspectsInOrder(pass1.workspaceComponents, pass1.scopeComponents, pass1.envIdByCompKey);
        await this.applyPostLoadIssuesAndWarnings(pass1.workspaceComponents);
        for (const c of pass1.workspaceComponents) c.loadedPhase = 'aspects';
        for (const c of pass1.scopeComponents) c.loadedPhase = 'aspects';
      }

      // Key by the ORIGINAL input id's `toString()` — partitionIds resolves
      // workspace ids to their bitmap version, but the unified loader looks up
      // results by the input id's `toString()` (which may have no version).
      // Without this mapping, callers like `workspace.getMany(idsWithoutVersions)`
      // (used by snapping) see every id as missing.
      const result = new Map<string, Component>();
      const setBoth = (c: Component) => {
        const resolvedKey = c.id.toString();
        result.set(resolvedKey, c);
        const inputKey = inputKeyByResolvedKey.get(resolvedKey);
        if (inputKey && inputKey !== resolvedKey) result.set(inputKey, c);
      };
      for (const c of pass1.workspaceComponents) setBoth(c);
      for (const c of pass1.scopeComponents) setBoth(c);
      return result;
    } finally {
      this.loadingDepth -= 1;
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
          loadExtensions: false,
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

  // === Pass 2: SCC-ordered slot fire + aspect registration =========
  //
  // Fires `executeLoadSlot` for every workspace component in SCC order
  // (envs-before-consumers). After all slots have fired, identifies which
  // components are aspects/envs (now that `envsData.data.type` is populated
  // by `envs.calcDescriptor`) and registers them via `workspace.loadAspects`.
  //
  // The pre-rewrite WCL used a similar two-step: slot-fire per group, then
  // `loadCompsAsAspects` per group. We collapse to a single `loadAspects`
  // call at the end because the registration is idempotent and a single
  // batch is simpler. The env-first slot ordering is preserved via SCC.

  private async pass2LoadAspectsInOrder(
    workspaceComponents: Component[],
    scopeComponents: Component[],
    envIdByCompKey: Map<string, string | undefined>
  ): Promise<void> {
    if (!workspaceComponents.length && !scopeComponents.length) return;

    const groups = this.sccOrderByEnv(workspaceComponents, envIdByCompKey);

    // Slot-fire in SCC order; within a group, parallel.
    for (const group of groups) {
      await Promise.all(group.map((comp) => this.executeLoadSlot(comp)));
    }

    // Now that envsData.type is populated, identify aspect-typed components
    // (workspace + scope) and register them as aspects.
    const all = workspaceComponents.concat(scopeComponents);
    const aspectIds = all.filter((c) => this.shouldLoadAsAspect(c)).map((c) => c.id.toString());
    if (!aspectIds.length) return;

    try {
      await this.workspace.loadAspects(aspectIds, true, 'self loading aspects', {
        useScopeAspectsCapsule: true,
      } as any);
    } catch (err: any) {
      this.logger.warn(`failed loading components as aspects: ${aspectIds.join(', ')}`, err);
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
    if (envsData?.data?.type === 'aspect') return true;
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
