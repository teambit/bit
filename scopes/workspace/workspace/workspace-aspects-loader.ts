import findRoot from 'find-root';
import { resolveFrom } from '@teambit/toolbox.modules.module-resolver';
import { Graph } from '@teambit/graph.cleargraph';
import { ExtensionDataList } from '@teambit/legacy/dist/consumer/config/extension-data';
import { Harmony } from '@teambit/harmony';
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
import { link } from '@teambit/legacy/dist/api/consumer';
import { ComponentNotFound } from '@teambit/legacy/dist/scope/exceptions';
import { uniqBy, difference, compact } from 'lodash';
import { Consumer } from '@teambit/legacy/dist/consumer';
import { Component, ComponentID, FilterAspectsOptions, ResolveAspectsOptions } from '@teambit/component';
import { ScopeMain } from '@teambit/scope';
import { Logger } from '@teambit/logger';
import { BitError } from '@teambit/bit-error';
import { EnvsMain } from '@teambit/envs';
import { ConfigMain } from '@teambit/config';
import { DependencyResolverMain } from '@teambit/dependency-resolver';
import { ShouldLoadFunc } from './build-graph-from-fs';
import type { Workspace } from './workspace';

export class WorkspaceAspectsLoader {
  private consumer: Consumer;
  private resolvedInstalledAspects: Map<string, string>;

  constructor(
    private workspace: Workspace,
    private aspectLoader: AspectLoaderMain,
    private envs: EnvsMain,
    private dependencyResolver: DependencyResolverMain,
    private scope: ScopeMain,
    private logger: Logger,
    private harmony: Harmony
  ) {
    this.consumer = this.workspace.consumer;
    this.resolvedInstalledAspects = new Map();
  }

  /**
   * load aspects from the workspace and if not exists in the workspace, load from the scope.
   * keep in mind that the graph may have circles.
   */
  async loadAspects(ids: string[] = [], throwOnError = false, neededFor?: string): Promise<string[]> {
    // generate a random callId to be able to identify the call from the logs
    const callId = Math.floor(Math.random() * 1000);
    const loggerPrefix = `[${callId}] loadAspects,`;
    this.logger.info(`${loggerPrefix} loading ${ids.length} aspects.
ids: ${ids.join(', ')}
needed-for: ${neededFor || '<unknown>'}`);
    const notLoadedIds = ids.filter((id) => !this.aspectLoader.isAspectLoaded(id));
    if (!notLoadedIds.length) return [];
    const coreAspectsStringIds = this.aspectLoader.getCoreAspectIds();
    const idsWithoutCore: string[] = difference(notLoadedIds, coreAspectsStringIds);

    const componentIds = await this.workspace.resolveMultipleComponentIds(idsWithoutCore);

    const aspectsDefs = await this.resolveAspects(undefined, componentIds, {
      excludeCore: true,
      requestedOnly: false,
    });
    const requireableComponents = this.aspectDefsToRequireableComponents(aspectsDefs);
    const manifests = await this.aspectLoader.getManifestsFromRequireableExtensions(
      requireableComponents,
      throwOnError
    );
    const potentialPluginsIndexes = compact(
      manifests.map((manifest, index) => {
        if (this.aspectLoader.isValidAspect(manifest)) return undefined;
        return index;
      })
    );
    await this.aspectLoader.loadExtensionsByManifests(manifests, throwOnError, idsWithoutCore);

    // Try require components for potential plugins
    const pluginsRequireableComponents = potentialPluginsIndexes.map((index) => {
      return requireableComponents[index];
    });
    // Do the require again now that the plugins defs already registered
    const pluginsManifests = await this.aspectLoader.getManifestsFromRequireableExtensions(
      pluginsRequireableComponents,
      throwOnError
    );
    await this.aspectLoader.loadExtensionsByManifests(pluginsManifests, throwOnError);
    this.logger.debug(`${loggerPrefix} finish loading aspects`);
    const manifestIds = manifests.map((manifest) => manifest.id);
    return compact(manifestIds);
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
    };
    const mergedOpts = { ...defaultOpts, ...opts };
    const idsToResolve = componentIds ? componentIds.map((id) => id.toString()) : this.harmony.extensionsIds;
    const coreAspectsIds = this.aspectLoader.getCoreAspectIds();
    const userAspectsIds: string[] = difference(idsToResolve, coreAspectsIds);
    const componentIdsToResolve = await this.workspace.resolveMultipleComponentIds(userAspectsIds);
    // const { workspaceIds, scopeIds } = await this.groupIdsByWorkspaceAndScope(componentIdsToResolve);
    const components = await this.importAndGetAspects(componentIdsToResolve);

    const graph = await this.getAspectsGraphWithoutCore(components, this.isAspect.bind(this));
    const aspects = graph.nodes.map((node) => node.attr);
    this.logger.debug(`${loggerPrefix} found ${aspects.length} aspects in the aspects-graph`);
    const { workspaceComps, scopeComps } = await this.groupComponentsByWorkspaceAndScope(aspects);
    const workspaceCompsIds = workspaceComps.map((c) => c.id);
    this.logger.debug(
      `${loggerPrefix} found ${workspaceComps.length} components in the workspace:\n${workspaceComps
        .map((c) => c.id.toString())
        .join('\n')}`
    );
    this.logger.debug(
      `${loggerPrefix} ${
        scopeComps.length
      } components are not in the workspace and are loaded from the scope:\n${scopeComps
        .map((c) => c.id.toString())
        .join('\n')}`
    );

    const stringIds: string[] = [];
    const wsAspectDefs = await this.aspectLoader.resolveAspects(
      workspaceComps,
      this.getWorkspaceAspectResolver(stringIds, runtimeName)
    );

    await this.linkIfMissingWorkspaceAspects(wsAspectDefs, workspaceCompsIds);

    const scopeCompsStringIds = scopeComps.map((c) => c.id);

    const scopeAspectDefs = await this.aspectLoader.resolveAspects(
      scopeComps,
      this.getInstalledAspectResolver(graph, userAspectsIds, runtimeName)
    );

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

    const allDefs = wsAspectDefs.concat(coreAspectDefs).concat(scopeAspectDefs);
    const idsToFilter = idsToResolve.map((idStr) => ComponentID.fromString(idStr));
    const filteredDefs = this.filterAspectDefs(allDefs, idsToFilter, coreAspectsIds, runtimeName, mergedOpts);
    return filteredDefs;
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

  private filterAspectDefs(
    allDefs: AspectDefinition[],
    componentIds: ComponentID[],
    coreIds: string[],
    runtimeName: string | undefined,
    filterOpts: FilterAspectsOptions = {}
  ) {
    const stringIds = componentIds.map((id) => id.toStringWithoutVersion());
    const afterExclusion = filterOpts.excludeCore
      ? allDefs.filter((def) => {
          const isCore = coreIds.includes(def.getId || '');
          const id = ComponentID.fromString(def.getId || '');
          const isTarget = stringIds.includes(id.toStringWithoutVersion());
          if (isTarget) return true;
          return !isCore;
        })
      : allDefs;

    const uniqDefs = uniqBy(afterExclusion, (def) => `${def.aspectPath}-${def.runtimePath}`);
    let defs = uniqDefs;
    if (runtimeName && filterOpts.filterByRuntime) {
      defs = defs.filter((def) => def.runtimePath);
    }

    if (componentIds && componentIds.length && filterOpts.requestedOnly) {
      const componentIdsString = componentIds.map((id) => id.toString());
      defs = defs.filter((def) => {
        return (
          (def.id && componentIdsString.includes(def.id)) ||
          (def.component && componentIdsString.includes(def.component?.id.toString()))
        );
      });
    }

    return defs;
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
      const stringIds: string[] = ids.map((id) => id._legacy.toString());
      return link(stringIds, false);
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
    runtimeName?: string
  ): AspectResolver {
    const installedAspectsResolver = async (component: Component): Promise<ResolvedAspect> => {
      const compStringId = component.id._legacy.toString();
      // stringIds.push(compStringId);
      const localPath = this.resolveInstalledAspectRecursively(component, rootIds, graph);

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
    graph: Graph<Component, string>
  ): string {
    const aspectStringId = aspectComponent.id._legacy.toString();
    if (this.resolvedInstalledAspects.has(aspectStringId)) {
      const resolvedPath = this.resolvedInstalledAspects.get(aspectStringId);
      if (resolvedPath) return resolvedPath;
    }
    if (rootIds.includes(aspectStringId)){
      const localPath = this.workspace.getComponentPackagePath(aspectComponent);
      this.resolvedInstalledAspects.set(aspectStringId, localPath);
      return localPath;
    }
    const parent = graph.predecessors(aspectStringId)[0];
    const parentPath = this.resolveInstalledAspectRecursively(parent.attr, rootIds, graph);
    const packageName = this.dependencyResolver.getPackageName(aspectComponent);
    const resolvedPath = resolveFrom(parentPath, [packageName]);
    const localPath = findRoot(resolvedPath);
    this.resolvedInstalledAspects.set(aspectStringId, localPath);
    return localPath;
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
   * Load all unloaded extensions from a list
   * @param extensions list of extensions with config to load
   */
  async loadExtensions(
    extensions: ExtensionDataList,
    originatedFrom?: ComponentID,
    throwOnError = false
  ): Promise<void> {
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
    const loadedExtensions = this.harmony.extensionsIds;
    const extensionsToLoad = difference(extensionsIds, loadedExtensions);
    if (!extensionsToLoad.length) return;
    await this.loadAspects(extensionsToLoad, throwOnError, originatedFrom?.toString());
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

  private async groupIdsByWorkspaceAndScope(
    ids: ComponentID[]
  ): Promise<{ workspaceIds: ComponentID[]; scopeIds: ComponentID[] }> {
    const workspaceIds: ComponentID[] = [];
    const scopeIds: ComponentID[] = [];
    await Promise.all(
      ids.map(async (id) => {
        const existOnWorkspace = await this.workspace.hasId(id);
        existOnWorkspace ? workspaceIds.push(id) : scopeIds.push(id);
      })
    );
    return { workspaceIds, scopeIds };
  }

  private async groupComponentsByWorkspaceAndScope(
    components: Component[]
  ): Promise<{ workspaceComps: Component[]; scopeComps: Component[] }> {
    const workspaceComps: Component[] = [];
    const scopeComps: Component[] = [];
    await Promise.all(
      components.map(async (component) => {
        const existOnWorkspace = await this.workspace.hasId(component.id);
        existOnWorkspace ? workspaceComps.push(component) : scopeComps.push(component);
      })
    );
    return { workspaceComps, scopeComps };
  }
}
