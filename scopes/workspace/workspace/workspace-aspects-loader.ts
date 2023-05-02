import findRoot from 'find-root';
import { resolveFrom } from '@teambit/toolbox.modules.module-resolver';
import { Graph } from '@teambit/graph.cleargraph';
import { ExtensionDataList } from '@teambit/legacy/dist/consumer/config/extension-data';
import { ExtensionManifest, Harmony, Aspect } from '@teambit/harmony';
import {
  AspectDefinition,
  AspectLoaderMain,
  AspectResolver,
  getAspectDef,
  ResolvedAspect,
} from '@teambit/aspect-loader';
import { MainRuntime } from '@teambit/cli';
import fs from 'fs-extra';
import { RequireableComponent } from '@teambit/harmony.modules.requireable-component';
import { linkToNodeModulesByIds } from '@teambit/workspace.modules.node-modules-linker';
import { BitId } from '@teambit/legacy-bit-id';
import { ComponentNotFound } from '@teambit/legacy/dist/scope/exceptions';
import pMapSeries from 'p-map-series';
import { difference, compact, groupBy } from 'lodash';
import { Consumer } from '@teambit/legacy/dist/consumer';
import { Component, ComponentID, LoadAspectsOptions, ResolveAspectsOptions } from '@teambit/component';
import { ScopeMain } from '@teambit/scope';
import { Logger } from '@teambit/logger';
import { BitError } from '@teambit/bit-error';
import { EnvsMain } from '@teambit/envs';
import { ConfigMain } from '@teambit/config';
import { DependencyResolverMain } from '@teambit/dependency-resolver';
import { ShouldLoadFunc } from './build-graph-from-fs';
import type { Workspace } from './workspace';
import { OnAspectsResolve, OnAspectsResolveSlot, OnRootAspectAdded, OnRootAspectAddedSlot } from './workspace.provider';

export type GetConfiguredUserAspectsPackagesOptions = {
  externalsOnly?: boolean;
};

export type WorkspaceLoadAspectsOptions = LoadAspectsOptions & {
  useScopeAspectsCapsule?: boolean;
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
    private harmony: Harmony,
    private onAspectsResolveSlot: OnAspectsResolveSlot,
    private onRootAspectAddedSlot: OnRootAspectAddedSlot,
    private resolveAspectsFromNodeModules = false
  ) {
    this.consumer = this.workspace.consumer;
    this.resolvedInstalledAspects = new Map();
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
    const calculatedThrowOnError: boolean = throwOnError ?? false;
    const defaultOpts: Required<WorkspaceLoadAspectsOptions> = {
      useScopeAspectsCapsule: false,
      throwOnError: calculatedThrowOnError,
      hideMissingModuleError: !!this.workspace.inInstallContext,
      ignoreErrors: false,
    };
    const mergedOpts: Required<WorkspaceLoadAspectsOptions> = { ...defaultOpts, ...opts };

    // generate a random callId to be able to identify the call from the logs
    const callId = Math.floor(Math.random() * 1000);
    const loggerPrefix = `[${callId}] loadAspects,`;
    this.logger.info(`${loggerPrefix} loading ${ids.length} aspects.
ids: ${ids.join(', ')}
needed-for: ${neededFor || '<unknown>'}. using opts: ${JSON.stringify(mergedOpts, null, 2)}`);
    const notLoadedIds = ids.filter((id) => !this.aspectLoader.isAspectLoaded(id));
    if (!notLoadedIds.length) return [];
    const coreAspectsStringIds = this.aspectLoader.getCoreAspectIds();
    const idsWithoutCore: string[] = difference(notLoadedIds, coreAspectsStringIds);

    const componentIds = await this.workspace.resolveMultipleComponentIds(idsWithoutCore);
    const { workspaceIds, nonWorkspaceIds } = await this.groupIdsByWorkspaceExistence(componentIds);
    this.logFoundWorkspaceVsScope(loggerPrefix, workspaceIds, nonWorkspaceIds);
    let idsToLoadFromWs = componentIds;
    let scopeAspectIds: string[] = [];

    // TODO: hard coded use the old approach and loading from the scope capsules
    // This is because right now loading from the ws node_modules causes issues in some cases
    // like for the cloud app
    // it should be removed once we fix the issues
    if (!this.resolveAspectsFromNodeModules) {
      if (!this.resolveAspectsFromNodeModules) {
        mergedOpts.useScopeAspectsCapsule = true;
      }
    }

    if (mergedOpts.useScopeAspectsCapsule) {
      idsToLoadFromWs = workspaceIds;
      const currentLane = await this.consumer.getCurrentLaneObject();

      const nonWorkspaceIdsString = nonWorkspaceIds.map((id) => id.toString());
      try {
        scopeAspectIds = await this.scope.loadAspects(
          nonWorkspaceIdsString,
          throwOnError,
          neededFor,
          currentLane || undefined,
          {
            packageManagerConfigRootDir: this.workspace.path,
            workspaceName: this.workspace.name,
          }
        );
      } catch (err: any) {
        if (err instanceof ComponentNotFound) {
          const config = this.harmony.get<ConfigMain>('teambit.harmony/config');
          const configStr = JSON.stringify(config.workspaceConfig?.raw || {});
          if (configStr.includes(err.id)) {
            throw new BitError(`error: a component "${err.id}" was not found
  your workspace.jsonc has this component-id set. you might want to remove/change it.`);
          }
        }

        throw err;
      }
    }

    const aspectsDefs = await this.resolveAspects(undefined, idsToLoadFromWs, {
      excludeCore: true,
      requestedOnly: false,
      ...mergedOpts,
    });

    const { manifests, requireableComponents } = await this.loadAspectDefsByOrder(
      aspectsDefs,
      idsWithoutCore,
      mergedOpts.throwOnError,
      mergedOpts.hideMissingModuleError,
      neededFor
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
      throwOnError
    );
    await this.aspectLoader.loadExtensionsByManifests(pluginsManifests, undefined, { throwOnError });
    this.logger.debug(`${loggerPrefix} finish loading aspects`);
    const manifestIds = manifests.map((manifest) => manifest.id);
    return compact(manifestIds.concat(scopeAspectIds));
  }

  private async loadAspectDefsByOrder(
    aspectsDefs: AspectDefinition[],
    seeders: string[],
    throwOnError: boolean,
    hideMissingModuleError: boolean,
    neededFor?: string
  ): Promise<{ manifests: Array<Aspect | ExtensionManifest>; requireableComponents: RequireableComponent[] }> {
    const { nonWorkspaceDefs } = await this.groupAspectDefsByWorkspaceExistence(aspectsDefs);
    const scopeAspectsLoader = this.scope.getScopeAspectsLoader();
    const scopeIds: string[] = compact(nonWorkspaceDefs.map((aspectDef) => aspectDef.getId));
    const scopeIdsGrouped = await scopeAspectsLoader.groupAspectIdsByEnvOfTheList(scopeIds);

    // Make sure to first load envs from the list otherwise it will fail when trying to load other aspects
    // as their envs might not be loaded yet
    if (scopeIdsGrouped.envs && scopeIdsGrouped.envs.length) {
      await this.scope.loadAspects(scopeIdsGrouped.envs, throwOnError, 'workspace.loadAspects loading scope aspects');
    }
    const requireableComponents = this.aspectDefsToRequireableComponents(aspectsDefs);
    const manifests = await this.aspectLoader.getManifestsFromRequireableExtensions(
      requireableComponents,
      throwOnError
    );
    await this.aspectLoader.loadExtensionsByManifests(
      manifests,
      { seeders, neededFor },
      { throwOnError, hideMissingModuleError }
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
    };
    const mergedOpts = { ...defaultOpts, ...opts };
    const idsToResolve = componentIds ? componentIds.map((id) => id.toString()) : this.harmony.extensionsIds;
    const coreAspectsIds = this.aspectLoader.getCoreAspectIds();
    const configuredAspects = this.aspectLoader.getConfiguredAspects();
    // it's possible that componentIds are core-aspects that got version for some reason, remove the version to
    // correctly filter them out later.
    const userAspectsIds: string[] = componentIds
      ? componentIds.filter((id) => !coreAspectsIds.includes(id.toStringWithoutVersion())).map((id) => id.toString())
      : difference(this.harmony.extensionsIds, coreAspectsIds);
    const rootAspectsIds: string[] = difference(configuredAspects, coreAspectsIds);
    const componentIdsToResolve = await this.workspace.resolveMultipleComponentIds(userAspectsIds);
    const components = await this.importAndGetAspects(componentIdsToResolve);

    // Run the on load slot
    await this.runOnAspectsResolveFunctions(components);

    const graph = await this.getAspectsGraphWithoutCore(components, this.isAspect.bind(this));
    const aspects = graph.nodes.map((node) => node.attr);
    this.logger.debug(`${loggerPrefix} found ${aspects.length} aspects in the aspects-graph`);
    const { workspaceComps, nonWorkspaceComps } = await this.groupComponentsByWorkspaceExistence(aspects);
    const workspaceCompsIds = workspaceComps.map((c) => c.id);
    const nonWorkspaceCompsIds = workspaceComps.map((c) => c.id);
    this.logFoundWorkspaceVsScope(loggerPrefix, workspaceCompsIds, nonWorkspaceCompsIds);

    const stringIds: string[] = [];
    const wsAspectDefs = await this.aspectLoader.resolveAspects(
      workspaceComps,
      this.getWorkspaceAspectResolver(stringIds, runtimeName)
    );

    await this.linkIfMissingWorkspaceAspects(wsAspectDefs, workspaceCompsIds);

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
          this.getInstalledAspectResolver(graph, rootAspectsIds, runtimeName, {
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
    const allDefs = wsAspectDefs.concat(coreAspectDefs).concat(scopeAspectsDefs).concat(installedAspectsDefs);
    const idsToFilter = idsToResolve.map((idStr) => ComponentID.fromString(idStr));
    const filteredDefs = this.aspectLoader.filterAspectDefs(allDefs, idsToFilter, runtimeName, mergedOpts);
    return filteredDefs;
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
    await config.write();
    this.aspectLoader.addInMemoryConfiguredAspect(aspectIdToAdd);
    await this.runOnRootAspectAddedFunctions(aspectId, inWs);
    return aspectIdToAdd;
  }

  async getConfiguredUserAspectsPackages(
    options: GetConfiguredUserAspectsPackagesOptions = {}
  ): Promise<AspectPackage[]> {
    const configuredAspects = this.aspectLoader.getConfiguredAspects();
    const coreAspectsIds = this.aspectLoader.getCoreAspectIds();
    const userAspectsIds: string[] = difference(configuredAspects, coreAspectsIds);
    const componentIdsToResolve = await this.workspace.resolveMultipleComponentIds(userAspectsIds);
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
        const plugins = this.aspectLoader.getPlugins(component, localPath);
        if (plugins.has()) {
          return plugins.load(MainRuntime.name);
        }

        // eslint-disable-next-line global-require, import/no-dynamic-require
        const aspect = require(localPath);
        // require aspect runtimes
        const runtimePath = await this.aspectLoader.getRuntimePath(component, localPath, MainRuntime.name);
        // eslint-disable-next-line global-require, import/no-dynamic-require
        if (runtimePath) require(runtimePath);
        return aspect;
      };
      return new RequireableComponent(component, requireFunc);
    });
    return compact(requireableComponents);
  }

  private async linkIfMissingWorkspaceAspects(aspects: AspectDefinition[], ids: ComponentID[]) {
    let missingPaths = false;
    const existsP = aspects.map(async (aspect) => {
      const exist = await fs.pathExists(aspect.aspectPath);
      if (!exist) {
        missingPaths = true;
      }
    });
    await Promise.all(existsP);
    // TODO: this should be done properly by the install aspect by slot
    if (missingPaths) {
      const bitIds: BitId[] = ids.map((id) => id._legacy);
      return linkToNodeModulesByIds(this.workspace, bitIds);
    }
    return Promise.resolve();
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
      const compStringId = component.id._legacy.toString();
      stringIds.push(compStringId);
      const localPath = this.workspace.getComponentPackagePath(component);

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
      const compStringId = component.id._legacy.toString();
      // stringIds.push(compStringId);
      const localPath = this.resolveInstalledAspectRecursively(component, rootIds, graph, opts);
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

  private resolveInstalledAspectRecursively(
    aspectComponent: Component,
    rootIds: string[],
    graph: Graph<Component, string>,
    opts: { throwOnError: boolean } = { throwOnError: false }
  ): string | null | undefined {
    const aspectStringId = aspectComponent.id._legacy.toString();
    if (this.resolvedInstalledAspects.has(aspectStringId)) {
      const resolvedPath = this.resolvedInstalledAspects.get(aspectStringId);
      return resolvedPath;
    }
    if (rootIds.includes(aspectStringId)) {
      const localPath = this.workspace.getComponentPackagePath(aspectComponent);
      this.resolvedInstalledAspects.set(aspectStringId, localPath);
      return localPath;
    }
    const parent = graph.predecessors(aspectStringId)[0];
    const parentPath = this.resolveInstalledAspectRecursively(parent.attr, rootIds, graph);
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
      return undefined;
    }
  }

  /**
   * Create a graph of aspects without the core aspects.
   * @param components
   * @param isAspect
   * @returns
   */
  private async getAspectsGraphWithoutCore(
    components: Component[],
    isAspect?: ShouldLoadFunc
  ): Promise<Graph<Component, string>> {
    const ids = components.map((component) => component.id);
    const coreAspectsStringIds = this.aspectLoader.getCoreAspectIds();
    // TODO: @gilad it causes many issues we need to find a better solution. removed for now.
    // const coreAspectsComponentIds = coreAspectsStringIds.map((id) => BitId.parse(id, true));
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
   * The reason we are loading component extensions with "scope aspects capsules" is becasuse for component extensions
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
    const extensionsToLoad = difference(extensionsIds, loadedExtensions);
    if (!extensionsToLoad.length) return;
    await this.loadAspects(extensionsToLoad, undefined, originatedFrom?.toString(), mergedOpts);
  }

  private async isAspect(id: ComponentID) {
    const component = await this.workspace.get(id);
    const isUsingAspectEnv = this.envs.isUsingAspectEnv(component);
    const isUsingEnvEnv = this.envs.isUsingEnvEnv(component);
    const isValidAspect = isUsingAspectEnv || isUsingEnvEnv;
    return isValidAspect;
  }

  /**
   * same as `this.importAndGetMany()` with a specific error handling of ComponentNotFound
   */
  private async importAndGetAspects(componentIds: ComponentID[]): Promise<Component[]> {
    try {
      return await this.workspace.importAndGetMany(componentIds);
    } catch (err: any) {
      if (err instanceof ComponentNotFound) {
        const config = this.harmony.get<ConfigMain>('teambit.harmony/config');
        const configStr = JSON.stringify(config.workspaceConfig?.raw || {});
        if (configStr.includes(err.id)) {
          throw new BitError(`error: a component "${err.id}" was not found
your workspace.jsonc has this component-id set. you might want to remove/change it.`);
        }
      }

      throw err;
    }
  }

  /**
   * split the provided components into 2 groups, one which are workspace components and the other which are not.
   * @param components
   * @returns
   */
  private async groupComponentsByWorkspaceExistence(
    components: Component[]
  ): Promise<{ workspaceComps: Component[]; nonWorkspaceComps: Component[] }> {
    const workspaceComps: Component[] = [];
    const nonWorkspaceComps: Component[] = [];
    await Promise.all(
      components.map(async (component) => {
        const existOnWorkspace = await this.workspace.hasId(component.id);
        existOnWorkspace ? workspaceComps.push(component) : nonWorkspaceComps.push(component);
      })
    );
    return { workspaceComps, nonWorkspaceComps };
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
        existOnWorkspace ? workspaceDefs.push(aspectDef) : nonWorkspaceDefs.push(aspectDef);
      })
    );
    return { workspaceDefs, nonWorkspaceDefs };
  }

  private async groupIdsByWorkspaceExistence(
    ids: ComponentID[]
  ): Promise<{ workspaceIds: ComponentID[]; nonWorkspaceIds: ComponentID[] }> {
    const workspaceIds: ComponentID[] = [];
    const nonWorkspaceIds: ComponentID[] = [];
    await Promise.all(
      ids.map(async (id) => {
        const existOnWorkspace = await this.workspace.hasId(id);
        existOnWorkspace ? workspaceIds.push(id) : nonWorkspaceIds.push(id);
      })
    );
    return { workspaceIds, nonWorkspaceIds };
  }
}
