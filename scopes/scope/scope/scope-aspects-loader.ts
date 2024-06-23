import { GlobalConfigMain } from '@teambit/global-config';
import mapSeries from 'p-map-series';
import { Lane } from '@teambit/legacy/dist/scope/models';
import { existsSync } from 'fs-extra';
import { join } from 'path';
import {
  DEFAULT_DIST_DIRNAME,
  CFG_CAPSULES_SCOPES_ASPECTS_BASE_DIR,
  CFG_CAPSULES_GLOBAL_SCOPE_ASPECTS_BASE_DIR,
  CFG_USE_DATED_CAPSULES,
  CFG_CACHE_LOCK_ONLY_CAPSULES,
} from '@teambit/legacy/dist/constants';
import { Compiler, TranspileFileOutputOneFile } from '@teambit/compiler';
import { Capsule, IsolateComponentsOptions, IsolatorMain } from '@teambit/isolator';
import { AspectLoaderMain, AspectDefinition } from '@teambit/aspect-loader';
import { compact, uniq, difference, groupBy, defaultsDeep } from 'lodash';
import { MainRuntime } from '@teambit/cli';
import { RequireableComponent } from '@teambit/harmony.modules.requireable-component';
import { ExtensionManifest, Aspect } from '@teambit/harmony';
import { Component, ComponentID, LoadAspectsOptions, ResolveAspectsOptions } from '@teambit/component';
import { Logger } from '@teambit/logger';
import { EnvsMain } from '@teambit/envs';
import { NodeLinker } from '@teambit/dependency-resolver';
import { BitError } from '@teambit/bit-error';
import { ScopeMain } from './scope.main.runtime';

type ManifestOrAspect = ExtensionManifest | Aspect;

export type ScopeLoadAspectsOptions = LoadAspectsOptions & {
  useScopeAspectsCapsule?: boolean;
  packageManagerConfigRootDir?: string;
  workspaceName?: string;
};

export class ScopeAspectsLoader {
  constructor(
    private scope: ScopeMain,
    private aspectLoader: AspectLoaderMain,
    private envs: EnvsMain,
    private isolator: IsolatorMain,
    private logger: Logger,
    private globalConfig: GlobalConfigMain
  ) {}

  async loadAspects(
    ids: string[],
    throwOnError = false,
    neededFor?: string,
    lane?: Lane,
    opts?: ScopeLoadAspectsOptions
  ): Promise<string[]> {
    if (!ids.length) return [];
    // generate a random callId to be able to identify the call from the logs
    const callId = Math.floor(Math.random() * 1000);
    const loggerPrefix = `[${callId}] loadAspects,`;
    this.logger.info(`${loggerPrefix} loading ${ids.length} aspects.
ids: ${ids.join(', ')}
needed-for: ${neededFor || '<unknown>'}`);
    const grouped = await this.groupAspectIdsByEnvOfTheList(ids, lane);
    this.logger.info(`${loggerPrefix} getManifestsAndLoadAspects for grouped.envs, total ${grouped.envs?.length || 0}`);
    const envsManifestsIds = await this.getManifestsAndLoadAspects(grouped.envs, throwOnError, lane, opts);
    this.logger.info(
      `${loggerPrefix} getManifestsAndLoadAspects for grouped.other, total ${grouped.other?.length || 0}`
    );
    const otherManifestsIds = await this.getManifestsAndLoadAspects(grouped.other, throwOnError, lane, opts);
    this.logger.debug(`${loggerPrefix} finish loading aspects`);
    return envsManifestsIds.concat(otherManifestsIds);
  }

  /**
   * This function get's a list of aspect ids and return them grouped by whether any of them is the env of other from the list
   * @param ids
   */
  async groupAspectIdsByEnvOfTheList(ids: string[], lane?: Lane): Promise<{ envs?: string[]; other?: string[] }> {
    const components = await this.getNonLoadedAspects(ids, lane);
    const envsIds = uniq(
      components
        .map((component) => this.envs.getEnvId(component))
        .filter((envId) => !this.aspectLoader.isCoreEnv(envId))
    );
    const grouped = groupBy(ids, (id) => {
      if (envsIds.includes(id)) return 'envs';
      return 'other';
    });
    return grouped as { envs: string[]; other: string[] };
  }

  private async getManifestsAndLoadAspects(
    ids: string[] = [],
    throwOnError = false,
    lane?: Lane,
    opts?: ScopeLoadAspectsOptions
  ): Promise<string[]> {
    const { manifests: scopeManifests, potentialPluginsIds } = await this.getManifestsGraphRecursively(
      ids,
      [],
      throwOnError,
      lane,
      opts
    );
    await this.aspectLoader.loadExtensionsByManifests(scopeManifests);
    const { manifests: scopePluginsManifests } = await this.getManifestsGraphRecursively(
      potentialPluginsIds,
      [],
      throwOnError,
      lane,
      opts
    );
    await this.aspectLoader.loadExtensionsByManifests(scopePluginsManifests);
    const allManifests = scopeManifests.concat(scopePluginsManifests);
    return compact(allManifests.map((manifest) => manifest.id));
  }

  async getManifestsGraphRecursively(
    ids: string[],
    visited: string[] = [],
    throwOnError = false,
    lane?: Lane,
    opts: {
      packageManagerConfigRootDir?: string;
      workspaceName?: string;
    } = {}
  ): Promise<{ manifests: ManifestOrAspect[]; potentialPluginsIds: string[] }> {
    ids = uniq(ids);
    this.logger.debug(`getManifestsGraphRecursively, ids:\n${ids.join('\n')}`);
    const nonVisitedId = ids.filter((id) => !visited.includes(id));
    if (!nonVisitedId.length) {
      return { manifests: [], potentialPluginsIds: [] };
    }
    const components = await this.getNonLoadedAspects(nonVisitedId, lane);
    // Removing this part for now as it's not needed for now
    // If you see a case where it's needed, please consult Gilad.
    // Adding all the envs ids to the array to support case when one (or more) of the aspects has custom aspect env
    // const customEnvsIds = components
    //   .map((component) => this.envs.getEnvId(component))
    //   .filter((envId) => !this.aspectLoader.isCoreEnv(envId));
    // // In case there is custom env we need to load it right away, otherwise we will fail during the require aspects
    // await this.getManifestsAndLoadAspects(customEnvsIds, undefined, lane);
    visited.push(...nonVisitedId);
    const manifests = await this.requireAspects(components, throwOnError, opts);
    const potentialPluginsIds = compact(
      manifests.map((manifest, index) => {
        if (this.aspectLoader.isValidAspect(manifest)) return undefined;
        // return index;
        return components[index].id.toString();
      })
    );

    const depsToLoad: Array<ExtensionManifest | Aspect> = [];
    await mapSeries(manifests, async (manifest) => {
      depsToLoad.push(...(manifest.dependencies || []));
      // @ts-ignore
      (manifest._runtimes || []).forEach((runtime) => {
        depsToLoad.push(...(runtime.dependencies || []));
      });
      const depIds = depsToLoad.map((d) => d.id).filter((id) => id) as string[];
      this.logger.debug(
        `getManifestsGraphRecursively, id: ${manifest.id || '<unknown>'}, found ${depIds.length}: ${depIds.join(', ')}`
      );
      const { manifests: loaded } = await this.getManifestsGraphRecursively(depIds, visited, throwOnError, lane);
      manifests.push(...loaded);
    });

    return { manifests, potentialPluginsIds };
  }

  private async getNonLoadedAspects(ids: string[], lane?: Lane): Promise<Component[]> {
    const notLoadedIds = ids.filter((id) => !this.aspectLoader.isAspectLoaded(id));
    if (!notLoadedIds.length) return [];
    const coreAspectsStringIds = this.aspectLoader.getCoreAspectIds();
    const idsWithoutCore: string[] = difference(ids, coreAspectsStringIds);
    const aspectIds = idsWithoutCore.filter((id) => !id.startsWith('file://'));
    // TODO: use diff instead of filter twice
    const localAspects = ids.filter((id) => id.startsWith('file://'));
    this.scope.localAspects = uniq(this.scope.localAspects.concat(localAspects));
    // load local aspects for debugging purposes.
    await this.aspectLoader.loadAspectFromPath(localAspects);
    const componentIds = await this.scope.resolveMultipleComponentIds(aspectIds);
    if (!componentIds || !componentIds.length) return [];
    await this.scope.import(componentIds, {
      reFetchUnBuiltVersion: false,
      lane,
      reason: 'for loading aspects from the scope',
    });
    const components = await this.scope.getMany(componentIds);

    return components;
  }

  async getResolvedAspects(
    components: Component[],
    opts?: { skipIfExists?: boolean; packageManagerConfigRootDir?: string; workspaceName?: string }
  ): Promise<RequireableComponent[]> {
    if (!components || !components.length) return [];
    const isolateOpts = this.getIsolateOpts(opts);
    const network = await this.isolator.isolateComponents(
      components.map((c) => c.id),
      // includeFromNestedHosts - to support case when you are in a workspace, trying to load aspect defined in the workspace.jsonc but not part of the workspace
      isolateOpts,
      this.scope.legacyScope
    );

    const capsules = network.seedersCapsules;

    return capsules.map((capsule) => {
      return new RequireableComponent(
        capsule.component,
        async () => {
          // eslint-disable-next-line global-require, import/no-dynamic-require
          const plugins = this.aspectLoader.getPlugins(capsule.component, capsule.path);
          if (plugins.has()) {
            await this.compileIfNoDist(capsule, capsule.component);
            return plugins.load(MainRuntime.name);
          }
          // eslint-disable-next-line global-require, import/no-dynamic-require
          const aspect = require(capsule.path);
          const scopeRuntime = await this.aspectLoader.getRuntimePath(capsule.component, capsule.path, 'scope');
          const mainRuntime = await this.aspectLoader.getRuntimePath(capsule.component, capsule.path, MainRuntime.name);
          const runtimePath = scopeRuntime || mainRuntime;
          // eslint-disable-next-line global-require, import/no-dynamic-require
          if (runtimePath) require(runtimePath);
          // eslint-disable-next-line global-require, import/no-dynamic-require
          return aspect;
        },
        capsule
      );
    });
  }

  private async compileIfNoDist(capsule: Capsule, component: Component) {
    let compiler: Compiler | undefined;
    try {
      const env = this.envs.getEnv(component);
      compiler = env.env.getCompiler();
    } catch (err: any) {
      this.logger.info(
        `compileIfNoDist: failed loading compiler for ${component.id.toString()} in capsule ${capsule.path}, error: ${
          err.message
        }`
      );
    }
    const distDir = compiler?.distDir || DEFAULT_DIST_DIRNAME;
    const distExists = existsSync(join(capsule.path, distDir));
    if (distExists) return;
    if (!compiler) {
      throw new BitError(`unable to compile aspect/env ${component.id.toString()}, no compiler found`);
    }

    const compiledCode = (
      await Promise.all(
        component.filesystem.files.flatMap(async (file) => {
          // @ts-ignore - we know it's not null, we have throw error above if yes
          if (!compiler.isFileSupported(file.path)) {
            return [
              {
                outputText: file.contents.toString('utf8'),
                outputPath: file.path,
              },
            ] as TranspileFileOutputOneFile[];
          }
          // @ts-ignore - we know it's not null, we have throw error above if yes
          if (compiler.transpileFile) {
            // @ts-ignore - we know it's not null, we have throw error above if yes
            return compiler.transpileFile(file.contents.toString('utf8'), {
              filePath: file.path,
              componentDir: capsule.path,
            });
          }

          return [];
        })
      )
    ).flat();

    await Promise.all(
      compact(compiledCode).map((compiledFile) => {
        // @ts-ignore - we know it's not null, we have throw error above if yes
        const path = compiler.getDistPathBySrcPath(compiledFile.outputPath);
        return capsule?.outputFile(path, compiledFile.outputText);
      })
    );
  }

  private async tryCompile(requirableAspect: RequireableComponent) {
    if (requirableAspect.capsule) return this.compileIfNoDist(requirableAspect.capsule, requirableAspect.component);
    return undefined;
  }

  async requireAspects(
    components: Component[],
    throwOnError = false,
    opts: { packageManagerConfigRootDir?: string; workspaceName?: string } = {}
  ): Promise<Array<ExtensionManifest | Aspect>> {
    const requireableExtensions = await this.getResolvedAspects(components, opts);
    if (!requireableExtensions) {
      return [];
    }
    let error: any;
    let erroredId = '';
    const requireWithCatch = async (requireableAspects: RequireableComponent[]) => {
      error = undefined;
      try {
        const manifests = await mapSeries(requireableAspects, async (requireableExtension) => {
          try {
            return await this.aspectLoader.doRequire(requireableExtension);
          } catch (err: any) {
            erroredId = requireableExtension.component.id.toString();
            if (err.code === 'MODULE_NOT_FOUND') {
              try {
                await this.tryCompile(requireableExtension);
                return await this.aspectLoader.doRequire(requireableExtension);
              } catch (newErr: any) {
                error = newErr;
                throw newErr;
              }
            }
            error = err;
            throw err;
          }
        });
        return manifests;
      } catch (err) {
        return null;
      }
    };
    const manifests = await requireWithCatch(requireableExtensions);
    if (!error) {
      return compact(manifests);
    }
    if (error.code === 'MODULE_NOT_FOUND') {
      this.logger.warn(
        `failed loading aspects from capsules due to MODULE_NOT_FOUND error, re-creating the capsules and trying again`
      );
      const resolvedAspectsAgain = await this.getResolvedAspects(components, {
        ...opts,
        skipIfExists: false,
      });
      const manifestAgain = await requireWithCatch(resolvedAspectsAgain);
      if (!error) {
        return compact(manifestAgain);
      }
    }

    this.aspectLoader.handleExtensionLoadingError(error, erroredId, throwOnError);
    return [];
  }

  shouldUseDatedCapsules(): boolean {
    const globalConfig = this.globalConfig.getSync(CFG_USE_DATED_CAPSULES);
    // @ts-ignore
    return globalConfig === true || globalConfig === 'true';
  }

  shouldCacheLockFileOnly(): boolean {
    const globalConfig = this.globalConfig.getSync(CFG_CACHE_LOCK_ONLY_CAPSULES);
    // @ts-ignore
    return globalConfig === true || globalConfig === 'true';
  }

  getAspectCapsulePath() {
    const defaultPath = `${this.scope.path}-aspects`;
    if (this.scope.isGlobalScope) {
      return this.globalConfig.getSync(CFG_CAPSULES_GLOBAL_SCOPE_ASPECTS_BASE_DIR) || defaultPath;
    }
    return this.globalConfig.getSync(CFG_CAPSULES_SCOPES_ASPECTS_BASE_DIR) || defaultPath;
  }

  shouldUseHashForCapsules(): boolean {
    if (this.scope.isGlobalScope) {
      return !this.globalConfig.getSync(CFG_CAPSULES_GLOBAL_SCOPE_ASPECTS_BASE_DIR);
    }
    return !this.globalConfig.getSync(CFG_CAPSULES_SCOPES_ASPECTS_BASE_DIR);
  }

  getAspectsPackageManager(): string | undefined {
    return this.scope.aspectsPackageManager;
  }

  getAspectsNodeLinker(): NodeLinker | undefined {
    return this.scope.aspectsNodeLinker;
  }

  private async resolveUserAspects(
    runtimeName?: string,
    userAspectsIds?: ComponentID[],
    opts?: ResolveAspectsOptions
  ): Promise<AspectDefinition[]> {
    if (!userAspectsIds || !userAspectsIds.length) return [];
    const components = await this.scope.getMany(userAspectsIds);
    const isolateOpts = this.getIsolateOpts(opts);
    const network = await this.isolator.isolateComponents(userAspectsIds, isolateOpts, this.scope.legacyScope);

    const capsules = network.seedersCapsules;
    const aspectDefs = await this.aspectLoader.resolveAspects(components, async (component) => {
      const capsule = capsules.getCapsule(component.id);
      if (!capsule) throw new Error(`failed loading aspect: ${component.id.toString()}`);
      const localPath = capsule.path;
      const runtimePath = runtimeName
        ? await this.aspectLoader.getRuntimePath(component, localPath, runtimeName)
        : null;
      const aspectFilePath = await this.aspectLoader.getAspectFilePath(component, localPath);

      this.logger.debug(
        `scope resolveUserAspects, resolving id: ${component.id.toString()}, localPath: ${localPath}, runtimePath: ${runtimePath}`
      );

      return {
        id: capsule.component.id,
        aspectPath: localPath,
        aspectFilePath,
        runtimePath,
      };
    });
    return aspectDefs;
  }

  async resolveAspects(
    runtimeName?: string,
    componentIds?: ComponentID[],
    opts?: ResolveAspectsOptions
  ): Promise<AspectDefinition[]> {
    const originalStringIds = componentIds?.map((id) => id.toString());
    this.logger.debug(`scope resolveAspects, runtimeName: ${runtimeName}, componentIds: ${originalStringIds}`);

    const defaultOpts: ResolveAspectsOptions = {
      excludeCore: false,
      requestedOnly: false,
      filterByRuntime: true,
    };
    const mergedOpts = { ...defaultOpts, ...opts };
    const coreAspectsIds = this.aspectLoader.getCoreAspectIds();
    let userAspectsIds: ComponentID[];
    // let requestedCoreStringIds;
    if (componentIds && componentIds.length) {
      const groupedByIsCore = groupBy(componentIds, (id) => coreAspectsIds.includes(id.toString()));
      userAspectsIds = groupedByIsCore.false || [];
      // requestedCoreStringIds = groupedByIsCore.true?.map((id) => id.toStringWithoutVersion()) || [];
    } else {
      userAspectsIds = await this.scope.resolveMultipleComponentIds(this.aspectLoader.getUserAspects());
    }
    const localResolved = await this.aspectLoader.resolveLocalAspects(this.scope.localAspects, runtimeName);

    const withoutLocalAspects = userAspectsIds.filter((aspectId) => {
      return !localResolved.find((localAspect) => {
        return localAspect.id === aspectId.toStringWithoutVersion();
      });
    });
    const userAspectsDefs = await this.resolveUserAspects(runtimeName, withoutLocalAspects, opts);
    const coreAspectsDefs = await this.aspectLoader.getCoreAspectDefs(runtimeName);

    const allDefs = userAspectsDefs.concat(coreAspectsDefs).concat(localResolved);
    // const userAspectsIdsWithoutVersion = userAspectsIds.map((aspectId) => aspectId.toStringWithoutVersion());
    // const userAspectsIdsWithoutVersionAndCoreRequested = userAspectsIdsWithoutVersion.concat(requestedCoreStringIds);
    const filteredDefs = this.aspectLoader.filterAspectDefs(
      allDefs,
      componentIds || userAspectsIds,
      runtimeName,
      mergedOpts
    );
    return filteredDefs;
  }

  getIsolateOpts(opts?: {
    skipIfExists?: boolean;
    packageManagerConfigRootDir?: string;
    workspaceName?: string;
  }): IsolateComponentsOptions {
    const overrideOpts = {
      skipIfExists: opts?.skipIfExists ?? true,
      installOptions: {
        packageManagerConfigRootDir: opts?.packageManagerConfigRootDir,
      },
      context: {
        workspaceName: opts?.workspaceName,
      },
    };
    const isolateOpts = defaultsDeep(overrideOpts, this.getDefaultIsolateOpts());
    return isolateOpts;
  }

  getDefaultIsolateOpts() {
    const useHash = this.shouldUseHashForCapsules();
    const useDatedDirs = this.shouldUseDatedCapsules();
    const cacheLockFileOnly = this.shouldCacheLockFileOnly();
    const nodeLinker = this.getAspectsNodeLinker();

    const opts = {
      datedDirId: this.scope.name,
      baseDir: this.getAspectCapsulePath(),
      useHash,
      packageManager: this.getAspectsPackageManager(),
      nodeLinker,
      useDatedDirs,
      cacheLockFileOnly,
      skipIfExists: true,
      seedersOnly: true,
      includeFromNestedHosts: true,
      host: this.scope,
      installOptions: {
        copyPeerToRuntimeOnRoot: true,
        useNesting: true,
        copyPeerToRuntimeOnComponents: true,
        installPeersFromEnvs: true,
      },
      context: {
        aspects: true,
      },
    };
    return opts;
  }
}
