import { join } from 'path';
import { CFG_CAPSULES_BUILD_COMPONENTS_BASE_DIR } from '@teambit/legacy.constants';
import findRoot from 'find-root';
import { resolveFrom } from '@teambit/toolbox.modules.module-resolver';
import type { Graph } from '@teambit/graph.cleargraph';
import type { ExtensionDataList } from '@teambit/legacy.extension-data';
import type { ExtensionManifest, Harmony, Aspect } from '@teambit/harmony';
import type { AspectDefinition, AspectLoaderMain, AspectResolver, ResolvedAspect } from '@teambit/aspect-loader';
import { getAspectDef } from '@teambit/aspect-loader';
import { MainRuntime } from '@teambit/cli';
import fs from 'fs-extra';
import { RequireableComponent } from '@teambit/harmony.modules.requireable-component';
import type { LoadSpan } from '@teambit/harmony.modules.load-trace';
import { startOrJoinLoadTrace, reportLoadFailure } from '@teambit/harmony.modules.load-trace';
import { linkToNodeModulesByIds } from '@teambit/workspace.modules.node-modules-linker';
import { ComponentID } from '@teambit/component-id';
import { ComponentNotFound } from '@teambit/legacy.scope';
import pMapSeries from 'p-map-series';
import { difference, compact, groupBy, partition, uniq } from 'lodash';
import type { Consumer } from '@teambit/legacy.consumer';
import type { Component, LoadAspectsOptions, ResolveAspectsOptions } from '@teambit/component';
import type { ScopeMain } from '@teambit/scope';
import type { Logger } from '@teambit/logger';
import { BitError } from '@teambit/bit-error';
import type { EnvsMain } from '@teambit/envs';
import { resolveLegacyCoreEnvId } from '@teambit/envs';
import type { ConfigMain } from '@teambit/config';
import type { DependencyResolverMain } from '@teambit/dependency-resolver';
import type { ShouldLoadFunc } from './build-graph-from-fs';
import type { Workspace } from './workspace';
import type {
  OnAspectsResolve,
  OnAspectsResolveSlot,
  OnRootAspectAdded,
  OnRootAspectAddedSlot,
} from './workspace.main.runtime';
import type { ComponentLoadOptions } from './workspace-component/workspace-component-loader';
import type { ConfigStoreMain } from '@teambit/config-store';

export type GetConfiguredUserAspectsPackagesOptions = {
  externalsOnly?: boolean;
};

export type WorkspaceLoadAspectsOptions = LoadAspectsOptions & {
  useScopeAspectsCapsule?: boolean;
  runSubscribers?: boolean;
  skipDeps?: boolean;
  resolveEnvsFromRoots?: boolean;
};

export type AspectPackage = { packageName: string; version: string };

export class WorkspaceAspectsLoader {
  private consumer: Consumer;
  private resolvedInstalledAspects: Map<string, string | null>;

  constructor(
    private workspace: Workspace,
    private scope: ScopeMain,
    private aspectLoader: AspectLoaderMain,
    private envs: EnvsMain,
    private dependencyResolver: DependencyResolverMain,
    private logger: Logger,
    private configStore: ConfigStoreMain,
    private harmony: Harmony,
    private onAspectsResolveSlot: OnAspectsResolveSlot,
    private onRootAspectAddedSlot: OnRootAspectAddedSlot,
    private resolveAspectsFromNodeModules = false,
    private resolveEnvsFromRoots = false
  ) {
    this.consumer = this.workspace.consumer;
    this.resolvedInstalledAspects = new Map();
    // Only enable this when root components is enabled as well
    this.resolveEnvsFromRoots = this.resolveEnvsFromRoots && this.dependencyResolver.hasRootComponents();
  }

  /**
   * load aspects from the workspace and if not exists in the workspace, load from the node_modules.
   * keep in mind that the graph may have circles.
   */
  async loadAspects(
    ids: string[] = [],
    throwOnError?: boolean,
    neededFor?: string,
    opts: WorkspaceLoadAspectsOptions = {}
  ): Promise<string[]> {
    return startOrJoinLoadTrace('workspace.loadAspects', { ids: ids.length, neededFor }, (span) =>
      this.loadAspectsWithSpan(ids, span, throwOnError, neededFor, opts)
    );
  }

  private async loadAspectsWithSpan(
    ids: string[],
    span: LoadSpan,
    throwOnError?: boolean,
    neededFor?: string,
    opts: WorkspaceLoadAspectsOptions = {}
  ): Promise<string[]> {
    const calculatedThrowOnError: boolean = throwOnError ?? false;
    const defaultOpts: Required<WorkspaceLoadAspectsOptions> = {
      useScopeAspectsCapsule: false,
      throwOnError: calculatedThrowOnError,
      runSubscribers: true,
      skipDeps: false,
      hideMissingModuleError: !!this.workspace.inInstallContext,
      ignoreErrorFunc: this.workspace.inInstallContext ? ignoreAspectLoadingError : () => false,
      ignoreErrors: false,
      resolveEnvsFromRoots: this.resolveEnvsFromRoots,
      forceLoad: false,
    };
    const mergedOpts: Required<WorkspaceLoadAspectsOptions> = { ...defaultOpts, ...opts };

    const loggerPrefix = `loadAspects,`;
    this.logger.info(`${loggerPrefix} loading ${ids.length} aspects.
ids: ${ids.join(', ')}
needed-for: ${neededFor || '<unknown>'}. using opts: ${JSON.stringify(mergedOpts, null, 2)}`);
    const [localAspects, nonLocalAspects] = partition(ids, (id) => id.startsWith('file:'));
    const localAspectsMap = await this.aspectLoader.loadAspectFromPath(localAspects);
    this.workspace.localAspects = { ...this.workspace.localAspects, ...localAspectsMap };

    let notLoadedIds = nonLocalAspects;
    if (!mergedOpts.forceLoad) {
      notLoadedIds = nonLocalAspects.filter((id) => !this.isAspectLoadedInclLegacyEnvs(id));
    }
    // break circular env chains - if an aspect is already in the process of loading (a parent
    // call in the current chain), don't try to load it again.
    const [inFlightIds, idsToLoad] = partition(notLoadedIds, (id) =>
      this.workspace.inFlightAspectsLoads.has(id.split('@')[0])
    );
    if (inFlightIds.length) {
      this.logger.debug(`${loggerPrefix} skipping aspects that are already loading: ${inFlightIds.join(', ')}`);
    }
    notLoadedIds = idsToLoad;
    if (!notLoadedIds.length) {
      span.setAttribute('alreadyLoaded', true);
      return [];
    }
    const inFlightAdded = notLoadedIds.map((id) => id.split('@')[0]);
    inFlightAdded.forEach((id) => this.workspace.inFlightAspectsLoads.add(id));
    try {
      return await this.loadAspectsAfterInFlightCheck(notLoadedIds, span, neededFor, mergedOpts, loggerPrefix);
    } finally {
      inFlightAdded.forEach((id) => this.workspace.inFlightAspectsLoads.delete(id));
    }
  }

  private async loadAspectsAfterInFlightCheck(
    notLoadedIds: string[],
    span: LoadSpan,
    neededFor: string | undefined,
    mergedOpts: Required<WorkspaceLoadAspectsOptions>,
    loggerPrefix: string
  ): Promise<string[]> {
    const throwOnError = mergedOpts.throwOnError;
    const opts = mergedOpts;
    const coreAspectsStringIds = this.aspectLoader.getCoreAspectIds();
    // filter out core aspects also when they are requested with a version (e.g. when they are
    // dependencies of a loaded aspect, the version is the component version)
    const idsWithoutCore: string[] = difference(notLoadedIds, coreAspectsStringIds).filter(
      (id) => !coreAspectsStringIds.includes(id.split('@')[0])
    );

    let componentIds = await this.workspace.resolveMultipleComponentIds(idsWithoutCore);
    componentIds = this.resolveLegacyCoreEnvsVersions(componentIds);

    const { workspaceIds, nonWorkspaceIds } = await this.groupIdsByWorkspaceExistence(
      componentIds,
      mergedOpts.resolveEnvsFromRoots
    );

    this.logFoundWorkspaceVsScope(loggerPrefix, workspaceIds, nonWorkspaceIds);
    let idsToLoadFromWs = componentIds;
    let scopeAspectIds: string[] = [];

    // TODO: hard coded use the old approach and loading from the scope capsules
    // This is because right now loading from the ws node_modules causes issues in some cases
    // like for the cloud app
    // it should be removed once we fix the issues
    if (!this.resolveAspectsFromNodeModules) {
      mergedOpts.useScopeAspectsCapsule = true;
    }

    if (mergedOpts.useScopeAspectsCapsule) {
      idsToLoadFromWs = workspaceIds;
      scopeAspectIds = await this.loadFromScopeAspectsCapsule(nonWorkspaceIds, throwOnError, neededFor);
    }

    const aspectsDefs = await this.resolveAspects(undefined, idsToLoadFromWs, {
      excludeCore: true,
      requestedOnly: false,
      ...mergedOpts,
    });

    // use also the resolved component-ids (with versions) as seeders and not only the requested
    // ids, as the requested ids may not have a version (e.g. envs that used to be core aspects),
    // while the seeders are matched against the loaded manifests ids, which always have a version.
    const seedersIds = uniq(componentIds.map((id) => id.toString()).concat(idsWithoutCore));
    const { manifests, requireableComponents } = await this.loadAspectDefsByOrder(
      aspectsDefs,
      seedersIds,
      mergedOpts.throwOnError,
      mergedOpts.hideMissingModuleError,
      mergedOpts.ignoreErrorFunc,
      neededFor,
      mergedOpts.runSubscribers
    );

    const potentialPluginsIndexes = compact(
      manifests.map((manifest, index) => {
        if (this.aspectLoader.isValidAspect(manifest)) return undefined;
        return index;
      })
    );

    // Try require components for potential plugins
    const pluginsRequireableComponents = potentialPluginsIndexes.map((index) => {
      return requireableComponents[index];
    });
    // Do the require again now that the plugins defs already registered
    const pluginsManifests = await this.aspectLoader.getManifestsFromRequireableExtensions(
      pluginsRequireableComponents,
      throwOnError,
      opts.runSubscribers
    );
    await this.aspectLoader.loadExtensionsByManifests(pluginsManifests, undefined, { throwOnError });
    const manifestIds = manifests.map((manifest) => manifest.id);
    this.logger.debug(`${loggerPrefix} finish loading aspects`);
    return compact(manifestIds.concat(scopeAspectIds));
  }

  /**
   * whether this aspect-id was already loaded into harmony. in case the id is an env that used
   * to be a core aspect and is requested without a version (old components have them saved in
   * the model without a version), match the loaded extensions while ignoring the version
   * (they are loaded and registered to harmony with a version).
   */
  private isAspectLoadedInclLegacyEnvs(id: string): boolean {
    if (this.aspectLoader.isAspectLoaded(id)) return true;
    const idWithoutVersion = id.split('@')[0];
    if (!this.envs.isLegacyCoreEnv(idWithoutVersion)) return false;
    // a legacy core env should have a single instance regardless of the requested version. old
    // components request it without a version while a workspace/pinned copy is loaded with one.
    // a second instance of the same env would register duplicate build tasks.
    return this.harmony.extensionsIds.some(
      (extId) => extId.split('@')[0] === idWithoutVersion && this.harmony.extensions.get(extId)?.loaded
    );
  }

  /**
   * envs that used to be core aspects may be requested without a version (old components have
   * them saved in the model without a version). when such an env is not a workspace component,
   * resolve it to its pinned version so it can be imported and loaded as a regular external env.
   */
  private resolveLegacyCoreEnvsVersions(componentIds: ComponentID[]): ComponentID[] {
    return componentIds.map((componentId) => {
      if (componentId.hasVersion()) return componentId;
      if (!this.envs.isLegacyCoreEnv(componentId.toStringWithoutVersion())) return componentId;
      // when the env is a workspace component (e.g. in the bit repo itself), use the workspace id
      // including its version. loading it versionless would create a second harmony instance of
      // the same aspect (it is loaded with a version when loaded as a workspace component),
      // causing duplicate build tasks.
      const workspaceId = this.workspace.getIdIfExist(componentId);
      if (workspaceId) return workspaceId;
      const resolved = resolveLegacyCoreEnvId(componentId.toString());
      if (resolved === componentId.toString()) return componentId;
      return ComponentID.fromString(resolved);
    });
  }

  private async loadFromScopeAspectsCapsule(ids: ComponentID[], throwOnError?: boolean, neededFor?: string) {
    let scopeAspectIds: string[] = [];
    const currentLane = await this.consumer.getCurrentLaneObject();

    if (!ids.length) return [];

    const nonWorkspaceIdsString = ids.map((id) => id.toString());
    try {
      scopeAspectIds = await this.scope.loadAspects(nonWorkspaceIdsString, throwOnError, neededFor, currentLane, {
        packageManagerConfigRootDir: this.workspace.path,
        workspaceName: this.workspace.name,
      });
      return scopeAspectIds;
    } catch (err: any) {
      this.throwWsJsoncAspectNotFoundError(err);
      return scopeAspectIds;

      throw err;
    }
  }

  throwWsJsoncAspectNotFoundError(err: any) {
    if (err instanceof ComponentNotFound) {
      const config = this.harmony.get<ConfigMain>('teambit.harmony/config');
      const configStr = JSON.stringify(config.workspaceConfig?.raw || {});
      if (configStr.includes(err.id)) {
        throw new BitError(`error: a component "${err.id}" was not found
your workspace.jsonc has this component-id set. you might want to remove/change it.`);
      }
    }
  }

  private async loadAspectDefsByOrder(
    aspectsDefs: AspectDefinition[],
    seeders: string[],
    throwOnError: boolean,
    hideMissingModuleError: boolean,
    ignoreErrorFunc?: (err: Error) => boolean,
    neededFor?: string,
    runSubscribers = true
  ): Promise<{ manifests: Array<Aspect | ExtensionManifest>; requireableComponents: RequireableComponent[] }> {
    const { nonWorkspaceDefs } = await this.groupAspectDefsByWorkspaceExistence(aspectsDefs);
    const scopeAspectsLoader = this.scope.getScopeAspectsLoader();
    const scopeIds: string[] = compact(nonWorkspaceDefs.map((aspectDef) => aspectDef.getId));
    const scopeIdsGrouped = await scopeAspectsLoader.groupAspectIdsByEnvOfTheList(scopeIds);

    // Make sure to first load envs from the list otherwise it will fail when trying to load other aspects
    // as their envs might not be loaded yet
    if (scopeIdsGrouped.envs && scopeIdsGrouped.envs.length && !runSubscribers) {
      await this.scope.loadAspects(scopeIdsGrouped.envs, throwOnError, 'workspace.loadAspects loading scope aspects');
    }
    const requireableComponents = this.aspectDefsToRequireableComponents(aspectsDefs);
    const manifests = await this.aspectLoader.getManifestsFromRequireableExtensions(
      requireableComponents,
      throwOnError,
      runSubscribers
    );
    await this.aspectLoader.loadExtensionsByManifests(
      manifests,
      { seeders, neededFor },
      { throwOnError, hideMissingModuleError, ignoreErrorFunc }
    );
    return { manifests, requireableComponents };
  }

  async resolveAspects(
    runtimeName?: string,
    componentIds?: ComponentID[],
    opts?: ResolveAspectsOptions
  ): Promise<AspectDefinition[]> {
    const callId = Math.floor(Math.random() * 1000);
    const loggerPrefix = `[${callId}] workspace resolveAspects,`;

    this.logger.debug(
      `${loggerPrefix}, resolving aspects for - runtimeName: ${runtimeName}, componentIds: ${componentIds}`
    );
    const defaultOpts: ResolveAspectsOptions = {
      excludeCore: false,
      requestedOnly: false,
      filterByRuntime: true,
      useScopeAspectsCapsule: false,
      workspaceName: this.workspace.name,
      resolveEnvsFromRoots: this.resolveEnvsFromRoots,
      packageManagerConfigRootDir: this.workspace.path,
    };
    const mergedOpts = { ...defaultOpts, ...opts };
    const idsToResolve = componentIds ? componentIds.map((id) => id.toString()) : this.harmony.extensionsIds;
    const workspaceLocalAspectsIds = Object.keys(this.workspace.localAspects);
    const [localAspectsIds, nonLocalAspectsIds] = partition(idsToResolve, (id) =>
      workspaceLocalAspectsIds.includes(id)
    );

    const localDefs = await this.aspectLoader.resolveLocalAspects(
      localAspectsIds.map((id) => this.workspace.localAspects[id]),
      runtimeName
    );
    const coreAspectsIds = this.aspectLoader.getCoreAspectIds();
    const configuredAspects = this.aspectLoader.getConfiguredAspects();
    // it's possible that componentIds are core-aspects that got version for some reason, remove the version to
    // correctly filter them out later.
    const userAspectsIds: string[] = nonLocalAspectsIds
      ? nonLocalAspectsIds.filter((id) => !coreAspectsIds.includes(id.split('@')[0])).map((id) => id.toString())
      : difference(this.harmony.extensionsIds, coreAspectsIds);
    const rootAspectsIds: string[] = difference(configuredAspects, coreAspectsIds);
    let componentIdsToResolve = await this.workspace.resolveMultipleComponentIds(userAspectsIds);
    componentIdsToResolve = this.resolveLegacyCoreEnvsVersions(componentIdsToResolve);
    const components = await this.importAndGetAspects(componentIdsToResolve, opts?.throwOnError);
    // Run the on load slot
    await this.runOnAspectsResolveFunctions(components);

    if (opts?.skipDeps) {
      const wsAspectDefs = await this.aspectLoader.resolveAspects(
        components,
        this.getWorkspaceAspectResolver([], runtimeName)
      );

      const coreAspectDefs = await Promise.all(
        coreAspectsIds.map(async (coreId) => {
          const rawDef = await getAspectDef(coreId, runtimeName);
          return this.aspectLoader.loadDefinition(rawDef);
        })
      );

      const idsToFilter = idsToResolve.map((idStr) => ComponentID.fromString(idStr));
      const targetDefs = wsAspectDefs.concat(coreAspectDefs).concat(localDefs);
      const finalDefs = this.aspectLoader.filterAspectDefs(targetDefs, idsToFilter, runtimeName, mergedOpts);

      return finalDefs;
    }

    const groupedByIsPlugin = groupBy(components, (component) => {
      return this.aspectLoader.hasPluginFiles(component);
    });
    // envs that used to be core aspects are expected to be installed into the workspace rather than
    // isolated into scope capsules (which is very slow). when installed, keep them in the graph so
    // their aspect dependencies (e.g. react for the node env) get resolved as well, but from their
    // installed packages. when not installed yet, don't walk their dependencies graph at all - they
    // are resolved directly, fail to load gracefully and the user gets a NonLoadedEnv issue
    // suggesting to run "bit install".
    let graphSeeders = groupedByIsPlugin.false || [];
    const installedLegacyEnvs: Component[] = [];
    const nonInstalledLegacyEnvs: Component[] = [];
    if (mergedOpts.resolveEnvsFromRoots) {
      const rest: Component[] = [];
      await Promise.all(
        graphSeeders.map(async (component) => {
          const isNonWsLegacyEnv =
            this.envs.isLegacyCoreEnv(component.id.toStringWithoutVersion()) &&
            !(await this.workspace.hasId(component.id));
          if (!isNonWsLegacyEnv) {
            rest.push(component);
            return;
          }
          const packagePath = await this.workspace.getComponentPackagePath(component);
          if (await fs.pathExists(packagePath)) {
            installedLegacyEnvs.push(component);
            rest.push(component);
          } else {
            nonInstalledLegacyEnvs.push(component);
          }
        })
      );
      graphSeeders = rest;
    }
    const graph = await this.getAspectsGraphWithoutCore(graphSeeders, this.isAspect.bind(this));
    const aspectsComponentsInclCore = graph.nodes
      .map((node) => node.attr)
      .concat(groupedByIsPlugin.true || [])
      .concat(nonInstalledLegacyEnvs);
    // remove core aspects from the list. the graph may include them (with a version) when they
    // are dependencies of the given components
    const aspectsComponents = aspectsComponentsInclCore.filter(
      (component) => !coreAspectsIds.includes(component.id.toStringWithoutVersion())
    );
    this.logger.debug(`${loggerPrefix} found ${aspectsComponents.length} aspects in the aspects-graph`);
    let { workspaceComps, nonWorkspaceComps } = await this.groupComponentsByWorkspaceExistence(
      aspectsComponents,
      mergedOpts.resolveEnvsFromRoots
    );
    // legacy-core envs that got here only as dependencies of other (installed) legacy-core envs
    // are not installed at the workspace root themselves. resolve them from the installed packages
    // (below) rather than from the workspace root path, which doesn't exist for them.
    if (installedLegacyEnvs.length) {
      const seederLegacyIds = new Set([...installedLegacyEnvs, ...nonInstalledLegacyEnvs].map((c) => c.id.toString()));
      const depLegacyEnvs: Component[] = [];
      const properWorkspaceComps: Component[] = [];
      await Promise.all(
        workspaceComps.map(async (component) => {
          const isDepLegacyEnv =
            this.envs.isLegacyCoreEnv(component.id.toStringWithoutVersion()) &&
            !seederLegacyIds.has(component.id.toString()) &&
            !(await this.workspace.hasId(component.id));
          if (isDepLegacyEnv) depLegacyEnvs.push(component);
          else properWorkspaceComps.push(component);
        })
      );
      workspaceComps = properWorkspaceComps;
      nonWorkspaceComps = nonWorkspaceComps.concat(depLegacyEnvs);
    }

    const workspaceCompsIds = workspaceComps.map((c) => c.id);
    const nonWorkspaceCompsIds = nonWorkspaceComps.map((c) => c.id);
    this.logFoundWorkspaceVsScope(loggerPrefix, workspaceCompsIds, nonWorkspaceCompsIds);

    const stringIds: string[] = [];
    const wsAspectDefs = await this.aspectLoader.resolveAspects(
      workspaceComps,
      this.getWorkspaceAspectResolver(stringIds, runtimeName)
    );

    await this.linkIfMissingWorkspaceAspects(wsAspectDefs);

    // TODO: hard coded use the old approach and loading from the scope capsules
    // This is because right now loading from the ws node_modules causes issues in some cases
    // like for the cloud app
    // it should be removed once we fix the issues
    if (!this.resolveAspectsFromNodeModules) {
      mergedOpts.useScopeAspectsCapsule = true;
    }

    let componentsToResolveFromScope = nonWorkspaceComps;
    let componentsToResolveFromInstalled: Component[] = [];
    if (!mergedOpts.useScopeAspectsCapsule) {
      const nonWorkspaceCompsGroups = groupBy(nonWorkspaceComps, (component) => this.envs.isEnv(component));
      componentsToResolveFromScope = nonWorkspaceCompsGroups.true || [];
      componentsToResolveFromInstalled = nonWorkspaceCompsGroups.false || [];
    }
    // runtime dependencies of installed legacy-core envs were installed along with them as
    // packages. resolve them from the installed packages instead of isolating them into scope
    // capsules. their dev dependencies are not needed to run the env - drop them, unless they are
    // also reachable from other requested aspects.
    if (installedLegacyEnvs.length && componentsToResolveFromScope.length) {
      const legacyEnvIds = installedLegacyEnvs.map((c) => c.id.toString());
      const legacyRuntimeClosure = this.getGraphDescendants(graph, legacyEnvIds, ['runtime']);
      const otherSeederIds = graphSeeders.map((c) => c.id.toString()).filter((idStr) => !legacyEnvIds.includes(idStr));
      const otherClosure = this.getGraphDescendants(graph, otherSeederIds);
      otherSeederIds.forEach((idStr) => otherClosure.add(idStr));
      const fromScope: Component[] = [];
      const fromInstalled: Component[] = [];
      const dropped: Component[] = [];
      componentsToResolveFromScope.forEach((component) => {
        const idStr = component.id.toString();
        if (otherClosure.has(idStr)) fromScope.push(component);
        else if (legacyRuntimeClosure.has(idStr)) fromInstalled.push(component);
        else dropped.push(component);
      });
      if (dropped.length) {
        this.logger.debug(
          `resolveAspects, dropped ${dropped.length} dev/peer dependencies of installed legacy-core envs from aspects resolution:\n${dropped.map((c) => c.id.toString()).join('\n')}`
        );
      }
      componentsToResolveFromInstalled = componentsToResolveFromInstalled.concat(fromInstalled);
      componentsToResolveFromScope = fromScope;
    }
    const installedResolverRootIds = uniq(rootAspectsIds.concat(installedLegacyEnvs.map((c) => c.id.toString())));

    const scopeIds = componentsToResolveFromScope.map((c) => c.id);
    this.logger.debug(
      `${loggerPrefix} ${
        scopeIds.length
      } components are not in the workspace and are loaded from the scope capsules:\n${scopeIds
        .map((id) => id.toString())
        .join('\n')}`
    );
    const scopeAspectsDefs: AspectDefinition[] = scopeIds.length
      ? await this.scope.resolveAspects(runtimeName, scopeIds, mergedOpts)
      : [];

    this.logger.debug(
      `${loggerPrefix} ${
        componentsToResolveFromInstalled.length
      } components are not in the workspace and are loaded from the node_modules:\n${componentsToResolveFromInstalled
        .map((c) => c.id.toString())
        .join('\n')}`
    );
    const installedAspectsDefs: AspectDefinition[] = componentsToResolveFromInstalled.length
      ? await this.aspectLoader.resolveAspects(
          componentsToResolveFromInstalled,
          this.getInstalledAspectResolver(graph, installedResolverRootIds, runtimeName, {
            throwOnError: opts?.throwOnError ?? false,
          })
        )
      : [];

    let coreAspectDefs = await Promise.all(
      coreAspectsIds.map(async (coreId) => {
        const rawDef = await getAspectDef(coreId, runtimeName);
        return this.aspectLoader.loadDefinition(rawDef);
      })
    );

    // due to lack of workspace and scope runtimes. TODO: fix after adding them.
    if (runtimeName && mergedOpts.filterByRuntime) {
      coreAspectDefs = coreAspectDefs.filter((coreAspect) => {
        return coreAspect.runtimePath;
      });
    }
    const localResolved = await this.aspectLoader.resolveLocalAspects(
      Object.keys(this.workspace.localAspects),
      runtimeName
    );
    const allDefsExceptLocal = [...wsAspectDefs, ...coreAspectDefs, ...scopeAspectsDefs, ...installedAspectsDefs];
    const withoutLocalAspects = allDefsExceptLocal.filter((aspectId) => {
      return !localResolved.find((localAspect) => {
        return localAspect.id === aspectId.component?.id?.toStringWithoutVersion();
      });
    });
    const allDefs = [...withoutLocalAspects, ...localResolved];
    const idsToFilter = idsToResolve.map((idStr) => ComponentID.fromString(idStr));
    const filteredDefs = this.aspectLoader.filterAspectDefs(allDefs, idsToFilter, runtimeName, mergedOpts);
    return filteredDefs;
  }

  shouldUseHashForCapsules(): boolean {
    return !this.configStore.getConfig(CFG_CAPSULES_BUILD_COMPONENTS_BASE_DIR);
  }

  getCapsulePath() {
    const defaultPath = this.workspace.path;
    return this.configStore.getConfig(CFG_CAPSULES_BUILD_COMPONENTS_BASE_DIR) || defaultPath;
  }

  private logFoundWorkspaceVsScope(loggerPrefix: string, workspaceIds: ComponentID[], nonWorkspaceIds: ComponentID[]) {
    const workspaceIdsStr = workspaceIds.length ? workspaceIds.map((id) => id.toString()).join('\n') : '';
    const nonWorkspaceIdsStr = nonWorkspaceIds.length ? nonWorkspaceIds.map((id) => id.toString()).join('\n') : '';
    this.logger.debug(
      `${loggerPrefix} found ${workspaceIds.length} components in the workspace, ${nonWorkspaceIds.length} not in the workspace`
    );
    if (workspaceIdsStr) this.logger.debug(`${loggerPrefix} workspace components:\n${workspaceIdsStr}`);
    if (nonWorkspaceIdsStr)
      this.logger.debug(
        `${loggerPrefix} non workspace components (loaded from the scope capsules or from the node_modules):\n${nonWorkspaceIdsStr}`
      );
  }

  async use(aspectIdStr: string): Promise<string> {
    let aspectId = await this.workspace.resolveComponentId(aspectIdStr);
    const inWs = await this.workspace.hasId(aspectId);
    let aspectIdToAdd = aspectId.toStringWithoutVersion();

    let aspectsComponent;
    // let aspectPackage;
    if (!inWs) {
      const aspectsComponents = await this.importAndGetAspects([aspectId]);
      if (aspectsComponents[0]) {
        aspectsComponent = aspectsComponents[0];
        aspectId = aspectsComponent.id;
        aspectIdToAdd = aspectId.toString();
      }
    }

    const config = this.harmony.get<ConfigMain>('teambit.harmony/config').workspaceConfig;
    if (!config) {
      throw new Error(`use() unable to get the workspace config`);
    }
    config.setExtension(
      aspectIdToAdd,
      {},
      {
        overrideExisting: false,
        ignoreVersion: false,
      }
    );
    await config.write({ reasonForChange: `use (${aspectIdStr})` });
    this.aspectLoader.addInMemoryConfiguredAspect(aspectIdToAdd);
    await this.runOnRootAspectAddedFunctions(aspectId, inWs);
    return aspectIdToAdd;
  }

  async getConfiguredUserAspectsPackages(
    options: GetConfiguredUserAspectsPackagesOptions = {}
  ): Promise<AspectPackage[]> {
    const rawConfiguredAspects = this.workspace.getWorkspaceConfig()?.extensionsIds;
    const coreAspectsIds = this.aspectLoader.getCoreAspectIds();
    const userAspectsIds: string[] = difference(rawConfiguredAspects, coreAspectsIds);
    const componentIdsToResolve = await this.workspace.resolveMultipleComponentIds(
      userAspectsIds.filter((id) => !id.startsWith('file:'))
    );
    const aspectsComponents = await this.importAndGetAspects(componentIdsToResolve);
    let componentsToGetPackages = aspectsComponents;
    if (options.externalsOnly) {
      const { nonWorkspaceComps } = await this.groupComponentsByWorkspaceExistence(aspectsComponents);
      componentsToGetPackages = nonWorkspaceComps;
    }
    const packages = componentsToGetPackages.map((aspectComponent) => {
      const packageName = this.dependencyResolver.getPackageName(aspectComponent);
      const version = aspectComponent.id.version || '*';
      return { packageName, version };
    });
    return packages;
  }

  private aspectDefsToRequireableComponents(aspectDefs: AspectDefinition[]): RequireableComponent[] {
    const requireableComponents = aspectDefs.map((aspectDef) => {
      const localPath = aspectDef.aspectPath;
      const component = aspectDef.component;
      if (!component) return undefined;
      const requireFunc = async () => {
        // Honor the workspace's scope-trust hook (registered on ScopeMain).
        // Workspace and scope-aspects-loader take parallel require paths.
        const guard = this.scope.getAspectLoadGuard();
        if (guard) await guard(component.id);

        const plugins = this.aspectLoader.getPlugins(component, localPath);
        if (plugins.has()) {
          return plugins.load(MainRuntime.name);
        }

        const isModule = await this.aspectLoader.isEsmModule(localPath);

        let aspect;
        try {
          aspect = !isModule
            ? // eslint-disable-next-line global-require, import/no-dynamic-require
              require(localPath)
            : // : await this.aspectLoader.loadEsm(join(localPath, 'dist', 'index.js'));
              await this.aspectLoader.loadEsm(localPath);
        } catch (err: any) {
          // the package.json of a workspace-component instance may point its "main" at the source
          // file - it's generated from the component manifest, which is calculated before the
          // component's env (hence its compiler) is loaded, e.g. on the first install cycle - and
          // node refuses to load .ts sources from node_modules. the compiled dist is reliable
          // when it exists, so require it directly, bypassing the stale "main".
          const distMain =
            err.code === 'ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING'
              ? this.getDistMain(component, localPath)
              : undefined;
          if (!distMain) throw err;
          this.logger.debug(
            `aspectDefsToRequireableComponents: failed loading ${component.id.toString()} from ${localPath} (stale source "main"), falling back to ${distMain}`
          );
          // eslint-disable-next-line global-require, import/no-dynamic-require
          aspect = isModule ? await this.aspectLoader.loadEsm(distMain) : require(distMain);
        }

        // require aspect runtimes
        const runtimePath = await this.aspectLoader.getRuntimePath(component, localPath, MainRuntime.name);
        if (runtimePath) {
          if (isModule) await this.aspectLoader.loadEsm(runtimePath);
          // eslint-disable-next-line global-require, import/no-dynamic-require
          require(runtimePath);
        }
        return aspect;
      };
      return new RequireableComponent(component, requireFunc);
    });
    return compact(requireableComponents);
  }

  /**
   * the compiled main file of the component inside `localPath`, if it exists.
   * (e.g. `<localPath>/dist/index.js` for an `index.ts` main file).
   */
  private getDistMain(component: Component, localPath: string): string | undefined {
    const mainFile = component.state._consumer.mainFile;
    if (!mainFile) return undefined;
    const distMain = join(localPath, 'dist', mainFile.replace(/\.(ts|tsx)$/, '.js'));
    return fs.pathExistsSync(distMain) ? distMain : undefined;
  }

  private async linkIfMissingWorkspaceAspects(aspects: AspectDefinition[]) {
    const idsToLink = await Promise.all(
      aspects.map(async (aspect) => {
        if (!aspect.component)
          throw new Error(`linkIfMissingWorkspaceAspects, aspect.component is missing for ${aspect.aspectPath}`);
        const isInWs = await this.workspace.hasId(aspect.component.id);
        if (!isInWs) return null;
        const exist = await fs.pathExists(aspect.aspectPath);
        if (!exist) return aspect.component.id;
        return null;
      })
    );
    const idsToLinkWithoutNull = compact(idsToLink);
    if (!idsToLinkWithoutNull.length) return;
    await linkToNodeModulesByIds(this.workspace, idsToLinkWithoutNull);
  }

  /**
   * This will return a resolver that knows to resolve aspects which are part of the workspace.
   * means aspects exist in the bitmap file
   * @param stringIds
   * @param runtimeName
   * @returns
   */
  private getWorkspaceAspectResolver(stringIds: string[], runtimeName?: string): AspectResolver {
    const workspaceAspectResolver = async (component: Component): Promise<ResolvedAspect> => {
      const compStringId = component.id.toString();
      stringIds.push(compStringId);
      const localPath = await this.workspace.getComponentPackagePath(component);

      const runtimePath = runtimeName
        ? await this.aspectLoader.getRuntimePath(component, localPath, runtimeName)
        : null;

      const aspectFilePath = await this.aspectLoader.getAspectFilePath(component, localPath);

      this.logger.debug(
        `workspace resolveAspects, resolving id: ${compStringId}, localPath: ${localPath}, runtimePath: ${runtimePath}`
      );
      return {
        aspectPath: localPath,
        aspectFilePath,
        runtimePath,
      };
    };
    return workspaceAspectResolver;
  }

  private async runOnAspectsResolveFunctions(aspectsComponents: Component[]): Promise<void> {
    const funcs = this.getOnAspectsResolveFunctions();
    await pMapSeries(funcs, async (func) => {
      try {
        await func(aspectsComponents);
      } catch (err) {
        this.logger.error('failed running onAspectsResolve function', err);
      }
    });
  }

  private getOnAspectsResolveFunctions(): OnAspectsResolve[] {
    const aspectsResolveFunctions = this.onAspectsResolveSlot.values();
    return aspectsResolveFunctions;
  }

  private async runOnRootAspectAddedFunctions(aspectsId: ComponentID, inWs: boolean): Promise<void> {
    const funcs = this.getOnRootAspectAddedFunctions();
    await pMapSeries(funcs, async (func) => {
      try {
        await func(aspectsId, inWs);
      } catch (err) {
        this.logger.error('failed running onRootAspectAdded function', err);
      }
    });
  }

  private getOnRootAspectAddedFunctions(): OnRootAspectAdded[] {
    const RootAspectAddedFunctions = this.onRootAspectAddedSlot.values();
    return RootAspectAddedFunctions;
  }

  /**
   * This will return a resolver that knows to resolve aspects which are not part of the workspace.
   * means aspects that does not exist in the bitmap file
   * instead it will resolve them from the node_modules recursively
   * @param graph
   * @param rootIds
   * @param runtimeName
   * @returns
   */
  private getInstalledAspectResolver(
    graph: Graph<Component, string>,
    rootIds: string[],
    runtimeName?: string,
    opts: { throwOnError: boolean } = { throwOnError: false }
  ): AspectResolver {
    const installedAspectsResolver = async (component: Component): Promise<ResolvedAspect | undefined> => {
      const compStringId = component.id.toString();
      // stringIds.push(compStringId);
      const localPath = await this.resolveInstalledAspectRecursively(component, rootIds, graph, opts);
      if (!localPath) return undefined;

      const runtimePath = runtimeName
        ? await this.aspectLoader.getRuntimePath(component, localPath, runtimeName)
        : null;

      const aspectFilePath = await this.aspectLoader.getAspectFilePath(component, localPath);

      this.logger.debug(
        `workspace resolveInstalledAspects, resolving id: ${compStringId}, localPath: ${localPath}, runtimePath: ${runtimePath}`
      );
      return {
        aspectPath: localPath,
        aspectFilePath,
        runtimePath,
      };
    };
    return installedAspectsResolver;
  }

  private async resolveInstalledAspectRecursively(
    aspectComponent: Component,
    rootIds: string[],
    graph: Graph<Component, string>,
    opts: { throwOnError: boolean } = { throwOnError: false },
    visiting = new Set<string>()
  ): Promise<string | null | undefined> {
    const aspectStringId = aspectComponent.id.toString();
    if (this.resolvedInstalledAspects.has(aspectStringId)) {
      const resolvedPath = this.resolvedInstalledAspects.get(aspectStringId);
      return resolvedPath;
    }
    // guard against circular dependencies in the graph. the set acts as the active call stack -
    // ids are removed when unwinding (finally below), so it never misclassifies reconverging
    // (diamond) paths as cycles.
    if (visiting.has(aspectStringId)) return undefined;
    visiting.add(aspectStringId);
    try {
      if (rootIds.includes(aspectStringId)) {
        const localPath = await this.workspace.getComponentPackagePath(aspectComponent);
        this.resolvedInstalledAspects.set(aspectStringId, localPath);
        return localPath;
      }
      // a workspace component may reach here as a dependency of another aspect. resolve it from
      // the workspace (where its dists are) rather than from a copy nested in the parent's
      // node_modules, which may contain only its sources (e.g. a file: instance of the package
      // manager) and fail to require.
      if (this.workspace.hasId(aspectComponent.id)) {
        const localPath = await this.workspace.getComponentPackagePath(aspectComponent);
        this.resolvedInstalledAspects.set(aspectStringId, localPath);
        return localPath;
      }
      // use inEdges to get the immediate parent. don't use graph.predecessors() as it returns all
      // the recursive predecessors, which may throw "Maximum call stack size exceeded" on big graphs
      const parentEdge = graph.inEdges(aspectStringId)[0];
      const parent = parentEdge ? graph.node(parentEdge.sourceId) : undefined;
      if (!parent) return undefined;
      const parentPath = await this.resolveInstalledAspectRecursively(parent.attr, rootIds, graph, opts, visiting);
      if (!parentPath) {
        this.resolvedInstalledAspects.set(aspectStringId, null);
        return undefined;
      }
      const packageName = this.dependencyResolver.getPackageName(aspectComponent);
      try {
        const resolvedPath = resolveFrom(parentPath, [packageName]);
        const localPath = findRoot(resolvedPath);
        this.resolvedInstalledAspects.set(aspectStringId, localPath);
        return localPath;
      } catch (error: any) {
        this.resolvedInstalledAspects.set(aspectStringId, null);
        if (opts.throwOnError) {
          throw error;
        }
        this.logger.consoleWarning(
          `failed resolving aspect ${aspectStringId} from ${parentPath}, error: ${error.message}`
        );
        // record the swallowed failure on the active load-trace so it surfaces as a component issue
        reportLoadFailure({ failedId: aspectStringId, phase: 'resolve-installed-aspect', error: error.message });
        return undefined;
      }
    } finally {
      visiting.delete(aspectStringId);
    }
  }

  /**
   * Create a graph of aspects without the core aspects.
   * @param components
   * @param isAspect
   * @returns
   */
  /**
   * collect all the ids reachable from the given source ids, excluding the sources themselves.
   * optionally traverse only edges of the given lifecycle types (e.g. ['runtime']).
   * iterative BFS to avoid stack overflow on big graphs.
   */
  private getGraphDescendants(graph: Graph<Component, string>, sourceIds: string[], edgeTypes?: string[]): Set<string> {
    const visited = new Set<string>();
    const queue = [...sourceIds];
    let queueIndex = 0;
    while (queueIndex < queue.length) {
      const current = queue[queueIndex];
      queueIndex += 1;
      if (visited.has(current)) continue;
      visited.add(current);
      graph.outEdges(current).forEach((edge) => {
        if (edgeTypes && !edgeTypes.includes(edge.attr)) return;
        queue.push(edge.targetId);
      });
    }
    sourceIds.forEach((id) => visited.delete(id));
    return visited;
  }

  private async getAspectsGraphWithoutCore(
    components: Component[] = [],
    isAspect?: ShouldLoadFunc
  ): Promise<Graph<Component, string>> {
    const ids = components.map((component) => component.id);
    const coreAspectsStringIds = this.aspectLoader.getCoreAspectIds();
    // TODO: @gilad it causes many issues we need to find a better solution. removed for now.
    // const coreAspectsComponentIds = coreAspectsStringIds.map((id) => ComponentID.fromString(id));
    // const aspectsIds = components.reduce((acc, curr) => {
    //   const currIds = curr.state.aspects.ids;
    //   acc = acc.concat(currIds);
    //   return acc;
    // }, [] as any);
    // const otherDependenciesMap = components.reduce((acc, curr) => {
    //   // const currIds = curr.state.dependencies.dependencies.map(dep => dep.id.toString());
    //   const currMap = curr.state.dependencies.getIdsMap();
    //   Object.assign(acc, currMap);
    //   return acc;
    // }, {});

    // const depsWhichAreNotAspects = difference(Object.keys(otherDependenciesMap), aspectsIds);
    // const depsWhichAreNotAspectsBitIds = depsWhichAreNotAspects.map((strId) => otherDependenciesMap[strId]);
    // We only want to load into the graph components which are aspects and not regular dependencies
    // This come to solve a circular loop when an env aspect use an aspect (as regular dep) and the aspect use the env aspect as its env
    return this.workspace.buildOneGraphForComponents(ids, coreAspectsStringIds, isAspect);
  }

  /**
   * Load all unloaded extensions from an extension list
   * this will resolve the extensions from the scope aspects capsules if they are not in the ws
   * Only use it for component extensions
   * for workspace/scope root aspect use the load aspects directly
   *
   * The reason we are loading component extensions with "scope aspects capsules" is because for component extensions
   * we might have the same extension in multiple versions
   * (for example I might have 2 components using different versions of the same env)
   * in such case, I can't install both version into the root of the node_modules so I need to place it somewhere else (capsules)
   * @param extensions list of extensions with config to load
   */
  async loadComponentsExtensions(
    extensions: ExtensionDataList,
    originatedFrom?: ComponentID,
    opts: WorkspaceLoadAspectsOptions = {}
  ): Promise<void> {
    const defaultOpts: WorkspaceLoadAspectsOptions = {
      useScopeAspectsCapsule: true,
      throwOnError: false,
      hideMissingModuleError: !!this.workspace.inInstallContext,
      ignoreErrorFunc: this.workspace.inInstallContext ? ignoreAspectLoadingError : undefined,
      resolveEnvsFromRoots: this.resolveEnvsFromRoots,
    };
    const mergedOpts = { ...defaultOpts, ...opts };
    const extensionsIdsP = extensions.map(async (extensionEntry) => {
      // Core extension
      if (!extensionEntry.extensionId) {
        return extensionEntry.stringId as string;
      }

      const id = await this.workspace.resolveComponentId(extensionEntry.extensionId);
      // return this.resolveComponentId(extensionEntry.extensionId);
      return id.toString();
    });
    const extensionsIds: string[] = await Promise.all(extensionsIdsP);
    const harmonyExtensions = this.harmony.extensionsIds;
    const loadedExtensions = harmonyExtensions.filter((extId) => {
      return this.harmony.extensions.get(extId)?.loaded;
    });
    const notLoaded = difference(extensionsIds, loadedExtensions);
    // envs that used to be core aspects appear in old components without a version, while they
    // are loaded and registered to harmony with a version. match them ignoring the version to
    // avoid re-loading them over and over again.
    const extensionsToLoad = notLoaded.filter((extId) => !this.isAspectLoadedInclLegacyEnvs(extId));
    if (!extensionsToLoad.length) return;
    await this.loadAspects(extensionsToLoad, undefined, originatedFrom?.toString(), mergedOpts);
  }

  private async isAspect(id: ComponentID) {
    // envs that used to be core aspects are always aspects. this can't be determined by the
    // component env-data, as when their own env was not loaded yet, the env-data is calculated
    // with a fallback env, which is not an aspect env.
    if (this.envs.isLegacyCoreEnv(id.toStringWithoutVersion())) return true;
    const component = await this.workspace.get(id);
    const isUsingAspectEnv = this.envs.isUsingAspectEnv(component);
    const isUsingEnvEnv = this.envs.isUsingEnvEnv(component);
    const isValidAspect = isUsingAspectEnv || isUsingEnvEnv;
    return isValidAspect;
  }

  /**
   * same as `this.importAndGetMany()` with a specific error handling of ComponentNotFound
   */
  private async importAndGetAspects(componentIds: ComponentID[], throwOnError = true): Promise<Component[]> {
    try {
      // We don't want to load the seeders as aspects as it will cause an infinite loop
      // once you try to load the seeder it will try to load the workspace component
      // that will arrive here again and again
      const loadOpts: ComponentLoadOptions = {
        idsToNotLoadAsAspects: componentIds.map((id) => id.toString()),
      };
      return await this.workspace.importAndGetMany(
        componentIds,
        'to load aspects from the workspace',
        loadOpts,
        throwOnError
      );
    } catch (err: any) {
      this.throwWsJsoncAspectNotFoundError(err);

      throw err;
    }
  }

  /**
   * split the provided components into 2 groups, one which are workspace components and the other which are not.
   * @param components
   * @returns
   */
  private async groupComponentsByWorkspaceExistence(
    components: Component[],
    resolveEnvsFromRoots?: boolean
  ): Promise<{ workspaceComps: Component[]; nonWorkspaceComps: Component[] }> {
    let workspaceComps: Component[] = [];
    let nonWorkspaceComps: Component[] = [];
    await Promise.all(
      components.map(async (component) => {
        const existOnWorkspace = await this.workspace.hasId(component.id);
        existOnWorkspace ? workspaceComps.push(component) : nonWorkspaceComps.push(component);
      })
    );
    if (resolveEnvsFromRoots) {
      const { rootComps, nonRootComps } = await this.groupComponentsByLoadFromRootComps(nonWorkspaceComps);
      workspaceComps = workspaceComps.concat(rootComps);
      nonWorkspaceComps = nonRootComps;
    }
    return { workspaceComps, nonWorkspaceComps };
  }

  private async groupComponentsByLoadFromRootComps(
    components: Component[]
  ): Promise<{ rootComps: Component[]; nonRootComps: Component[] }> {
    const rootComps: Component[] = [];
    const nonRootComps: Component[] = [];
    await Promise.all(
      components.map(async (component) => {
        const shouldLoadFromRootComps = await this.shouldLoadFromRootComps(component);
        if (shouldLoadFromRootComps) {
          rootComps.push(component);
          return;
        }
        nonRootComps.push(component);
      })
    );
    return { rootComps, nonRootComps };
  }

  private async shouldLoadFromRootComps(component: Component): Promise<boolean> {
    const rootDir = await this.workspace.getComponentPackagePath(component);
    const rootDirExist = await fs.pathExists(rootDir);
    const aspectFilePath = await this.aspectLoader.getAspectFilePath(component, rootDir);
    const aspectFilePathExist = aspectFilePath ? await fs.pathExists(aspectFilePath) : false;
    const pluginFiles = await this.aspectLoader.getPluginFiles(component, rootDir);

    // checking that we have the root dir (this means it's an aspect that needs to be loaded from there)
    // and validate that localPathExist so we can
    // really load the component from that path (if it's there it means that it's an env)
    if (rootDirExist && (aspectFilePathExist || pluginFiles.length)) {
      return true;
    }
    // If the component has env.jsonc we want to list it to be loaded from the root folder
    // even if it's not there yet
    // in that case we will fail to load it, and the user will need to run bit install
    if (this.envs.hasEnvManifest(component)) {
      return true;
    }
    // envs that used to be core aspects are expected to be installed into the workspace ("bit install"
    // adds them to the root policy) rather than isolated into scope capsules, which is very slow.
    // same as the env.jsonc case above - when not installed yet, loading fails gracefully and the
    // user gets a NonLoadedEnv issue suggesting to run bit install.
    if (this.envs.isLegacyCoreEnv(component.id.toStringWithoutVersion())) {
      return true;
    }
    return false;
  }

  /**
   * split the provided components into 2 groups, one which are workspace components and the other which are not.
   * @param components
   * @returns
   */
  private async groupAspectDefsByWorkspaceExistence(
    aspectDefs: AspectDefinition[]
  ): Promise<{ workspaceDefs: AspectDefinition[]; nonWorkspaceDefs: AspectDefinition[] }> {
    const workspaceDefs: AspectDefinition[] = [];
    const nonWorkspaceDefs: AspectDefinition[] = [];
    await Promise.all(
      aspectDefs.map(async (aspectDef) => {
        const id = aspectDef.component?.id;
        const existOnWorkspace = id ? await this.workspace.hasId(id) : true;
        if (existOnWorkspace) {
          workspaceDefs.push(aspectDef);
          return;
        }
        const shouldLoadFromRootComps = aspectDef.component
          ? await this.shouldLoadFromRootComps(aspectDef.component)
          : undefined;
        if (shouldLoadFromRootComps) {
          workspaceDefs.push(aspectDef);
          return;
        }
        nonWorkspaceDefs.push(aspectDef);
      })
    );
    return { workspaceDefs, nonWorkspaceDefs };
  }

  private async groupIdsByWorkspaceExistence(
    ids: ComponentID[],
    resolveEnvsFromRoots?: boolean
  ): Promise<{ workspaceIds: ComponentID[]; nonWorkspaceIds: ComponentID[] }> {
    let workspaceIds: ComponentID[] = [];
    let nonWorkspaceIds: ComponentID[] = [];
    await Promise.all(
      ids.map(async (id) => {
        const existOnWorkspace = await this.workspace.hasId(id);
        existOnWorkspace ? workspaceIds.push(id) : nonWorkspaceIds.push(id);
      })
    );
    // We need to bring the components in order to really group them with taking the root comps into account
    const scopeComponents = await this.importAndGetAspects(nonWorkspaceIds);
    const { nonWorkspaceComps, workspaceComps } = await this.groupComponentsByWorkspaceExistence(
      scopeComponents,
      resolveEnvsFromRoots
    );
    workspaceIds = workspaceIds.concat(workspaceComps.map((c) => c.id));
    nonWorkspaceIds = nonWorkspaceComps.map((c) => c.id);
    return { workspaceIds, nonWorkspaceIds };
  }
}

function ignoreAspectLoadingError(err: Error) {
  // Ignoring that error as probably we are in the middle of the installation process
  // so we didn't yet compile the aspect to esm correctly
  if (err.message.includes(`Cannot use 'import.meta' outside a module`)) {
    return true;
  }
  return false;
}
