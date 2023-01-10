import { ExtensionDataList } from '@teambit/legacy/dist/consumer/config/extension-data';
import { Harmony } from '@teambit/harmony';
import { AspectDefinition, AspectLoaderMain, getAspectDef } from '@teambit/aspect-loader';
import { MainRuntime } from '@teambit/cli';
import fs from 'fs-extra';
import { RequireableComponent } from '@teambit/harmony.modules.requireable-component';
import { link } from '@teambit/legacy/dist/api/consumer';
import { ComponentNotFound } from '@teambit/legacy/dist/scope/exceptions';
import { uniqBy, difference, compact } from 'lodash';
import { Consumer } from '@teambit/legacy/dist/consumer';
import { Component, ComponentID, ResolveAspectsOptions } from '@teambit/component';
import { ScopeMain } from '@teambit/scope';
import { Logger } from '@teambit/logger';
import { BitError } from '@teambit/bit-error';
import { EnvsMain } from '@teambit/envs';
import { ConfigMain } from '@teambit/config';
import { ShouldLoadFunc } from './build-graph-from-fs';
import type { Workspace } from './workspace';

export class WorkspaceAspectsLoader {
  private consumer: Consumer;

  constructor(
    private workspace: Workspace,
    private aspectLoader: AspectLoaderMain,
    private envs: EnvsMain,
    private scope: ScopeMain,
    private logger: Logger,
    private harmony: Harmony,
  ) {
    this.consumer = this.workspace.consumer;
  }

  /**
   * load aspects from the workspace and if not exists in the workspace, load from the scope.
   * keep in mind that the graph may have circles.
   */
  async loadAspects(ids: string[] = [], throwOnError = false, neededFor?: string): Promise<string[]> {
    console.log('ws load aspects')
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
    console.log('ws load aspects idsWithoutCore', idsWithoutCore)

    const componentIds = await this.workspace.resolveMultipleComponentIds(idsWithoutCore);
    const components = await this.importAndGetAspects(componentIds);

    const isAspect = async (id: ComponentID) => {
      const component = await this.workspace.get(id);
      const isUsingAspectEnv = this.envs.isUsingAspectEnv(component);
      const isUsingEnvEnv = this.envs.isUsingEnvEnv(component);
      const isValidAspect = isUsingAspectEnv || isUsingEnvEnv;
      // if (!isValidAspect && idsWithoutCore.includes(component.id.toString())) {
      //   const data = this.envs.getEnvData(component);
      //   const err = new IncorrectEnvAspect(component.id.toString(), data.type, data.id);
      //   if (data.id === DEFAULT_ENV) {
      //     // when cloning a project, or when the node-modules dir is deleted, nothing works and all
      //     // components are default to the DEFAULT_ENV, which is node-env. we must allow "bit
      //     // install" to prepare the workspace and let the proper the envs to be loaded
      //     this.logger.error(err.message);
      //   } else {
      //     throw err;
      //   }
      // }
      return isValidAspect;
    };

    const graph = await this.getAspectsGraphWithoutCore(components, isAspect);
    const aspects = graph.nodes.map((node) => node.attr);
    this.logger.debug(`${loggerPrefix} found ${aspects.length} aspects in the aspects-graph`);
    const { workspaceComps, scopeComps } = await this.groupComponentsByWorkspaceAndScope(aspects);
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
    const scopeIds = scopeComps.map((aspect) => aspect.id.toString());
    console.log('loadAspects scopeIds', scopeIds)
    const workspaceAspects = await this.requireComponents(workspaceComps);
    const workspaceManifests = await this.aspectLoader.getManifestsFromRequireableExtensions(
      workspaceAspects,
      throwOnError
    );
    const potentialPluginsIndexes = compact(
      workspaceManifests.map((manifest, index) => {
        if (this.aspectLoader.isValidAspect(manifest)) return undefined;
        return index;
      })
    );
    const workspaceManifestsIds = compact(workspaceManifests.map((m) => m.id));
    // We are grouping the scope aspects by whether they are envs of something of the list or not
    // if yes, we want to load them first
    // the rest we will load together with the workspace aspects
    const scopeIdsGrouped = await this.scope.groupAspectIdsByEnvOfTheList(scopeIds);
    const scopeEnvsManifestsIds =
      scopeIdsGrouped.envs && scopeIdsGrouped.envs.length
        ? await this.scope.loadAspects(
            scopeIdsGrouped.envs,
            throwOnError,
            'workspace.loadAspects loading scope aspects'
          )
        : [];
    const currentLane = await this.consumer.getCurrentLaneObject();
    const { manifests: scopeOtherManifests } =
      scopeIdsGrouped.other && scopeIdsGrouped.other.length
        ? await this.scope.getManifestsGraphRecursively(
            scopeIdsGrouped.other,
            compact(workspaceManifestsIds),
            throwOnError,
            currentLane || undefined,
            {
              packageManagerConfigRootDir: this.workspace.path,
            }
          )
        : { manifests: [] };
    const scopeOtherManifestsIds = compact(scopeOtherManifests.map((m) => m.id));

    await this.aspectLoader.loadExtensionsByManifests(
      [...scopeOtherManifests, ...workspaceManifests],
      throwOnError,
      idsWithoutCore
    );
    // Try require components for potential plugins
    const pluginsWorkspaceComps = potentialPluginsIndexes.map((index) => {
      return workspaceComps[index];
    });
    // Do the require again now that the plugins defs already registered
    const pluginsWorkspaceAspects = await this.requireComponents(pluginsWorkspaceComps);
    const pluginsWorkspaceManifests = await this.aspectLoader.getManifestsFromRequireableExtensions(
      pluginsWorkspaceAspects,
      throwOnError
    );
    await this.aspectLoader.loadExtensionsByManifests(pluginsWorkspaceManifests, throwOnError);
    this.logger.debug(`${loggerPrefix} finish loading aspects`);
    return compact(scopeEnvsManifestsIds.concat(scopeOtherManifestsIds).concat(workspaceManifestsIds));
  }

  async resolveAspects(
    runtimeName?: string,
    componentIds?: ComponentID[],
    opts?: ResolveAspectsOptions
  ): Promise<AspectDefinition[]> {
    this.logger.debug(`workspace resolveAspects, runtimeName: ${runtimeName}, componentIds: ${componentIds}`);
    const defaultOpts: ResolveAspectsOptions = {
      excludeCore: false,
      requestedOnly: false,
      filterByRuntime: true,
    };
    const mergedOpts = { ...defaultOpts, ...opts };
    let missingPaths = false;
    const stringIds: string[] = [];
    const idsToResolve = componentIds ? componentIds.map((id) => id.toString()) : this.harmony.extensionsIds;
    const coreAspectsIds = this.aspectLoader.getCoreAspectIds();
    const userAspectsIds: string[] = difference(idsToResolve, coreAspectsIds);
    console.log('userAspectsIds', userAspectsIds)
    const componentIdsToResolve = await this.workspace.resolveMultipleComponentIds(userAspectsIds);
    const { workspaceIds, scopeIds } = await this.groupIdsByWorkspaceAndScope(componentIdsToResolve);
    console.log('scopeIds', scopeIds)
    const wsComponents = await this.workspace.getMany(workspaceIds);
    const aspectDefs = await this.aspectLoader.resolveAspects(wsComponents, async (component) => {
      const compStringId = component.id._legacy.toString();
      stringIds.push(compStringId);
      const localPath = this.workspace.getComponentPackagePath(component);
      const isExist = await fs.pathExists(localPath);
      if (!isExist) {
        missingPaths = true;
      }
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
    });

    let scopeAspectDefs: AspectDefinition[] = [];
    if (scopeIds.length) {
      scopeAspectDefs = await this.scope.resolveAspects(runtimeName, scopeIds, mergedOpts);
    }

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

    if (missingPaths) {
      await link(stringIds, false);
    }

    const allDefs = aspectDefs.concat(coreAspectDefs).concat(scopeAspectDefs);
    const ids = idsToResolve.map((idStr) => ComponentID.fromString(idStr).toStringWithoutVersion());
    const afterExclusion = mergedOpts.excludeCore
      ? allDefs.filter((def) => {
          const isCore = coreAspectDefs.find((coreId) => def.getId === coreId.getId);
          const id = ComponentID.fromString(def.getId || '');
          const isTarget = ids.includes(id.toStringWithoutVersion());
          if (isTarget) return true;
          return !isCore;
        })
      : allDefs;

    const uniqDefs = uniqBy(afterExclusion, (def) => `${def.aspectPath}-${def.runtimePath}`);
    let defs = uniqDefs;
    if (runtimeName && mergedOpts.filterByRuntime) {
      defs = defs.filter((def) => def.runtimePath);
    }

    if (componentIds && componentIds.length && mergedOpts.requestedOnly) {
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

  private async getAspectsGraphWithoutCore(components: Component[], isAspect?: ShouldLoadFunc) {
    const ids = components.map((component) => component.id);
    const coreAspectsStringIds = this.aspectLoader.getCoreAspectIds();
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
    // TODO: @gilad it causes many issues we need to find a better solution. removed for now.
    return this.workspace.buildOneGraphForComponents(ids, coreAspectsStringIds, isAspect);
  }

  private async requireComponents(components: Component[]): Promise<RequireableComponent[]> {
    let missingPaths = false;
    const stringIds: string[] = [];
    const resolveP = components.map(async (component) => {
      stringIds.push(component.id._legacy.toString());
      const localPath = this.workspace.getComponentPackagePath(component);
      const isExist = await fs.pathExists(localPath);
      if (!isExist) {
        missingPaths = true;
      }

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
    const resolved = await Promise.all(resolveP);
    // Make sure to link missing components
    if (missingPaths) {
      await link(stringIds, false);
    }
    return resolved;
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
