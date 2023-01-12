import mapSeries from 'p-map-series';
import { Lane } from '@teambit/legacy/dist/scope/models';
import { readdirSync, existsSync } from 'fs-extra';
import { resolve, join } from 'path';
import { DEFAULT_DIST_DIRNAME } from '@teambit/legacy/dist/constants';
import { Compiler } from '@teambit/compiler';
import { Capsule, IsolatorMain } from '@teambit/isolator';
import { AspectLoaderMain, AspectDefinition } from '@teambit/aspect-loader';
import { compact, uniq, uniqBy, difference, groupBy } from 'lodash';
import { MainRuntime } from '@teambit/cli';
import { RequireableComponent } from '@teambit/harmony.modules.requireable-component';
import { ExtensionManifest, Aspect } from '@teambit/harmony';
import { Component, ComponentID, ResolveAspectsOptions } from '@teambit/component';
import { ScopeMain } from '@teambit/scope';
import { Logger } from '@teambit/logger';
import { EnvsMain } from '@teambit/envs';

type ManifestOrAspect = ExtensionManifest | Aspect;

export type ScopeLoadAspectsOptions = {
  useScopeAspectsCapsule?: boolean;
};

export class ScopeAspectsLoader {
  private resolvedInstalledAspects: Map<string, string | null>;

  constructor(
    private scope: ScopeMain,
    private aspectLoader: AspectLoaderMain,
    private envs: EnvsMain,
    private isolator: IsolatorMain,
    private logger: Logger
  ) {}
  private parseLocalAspect(localAspects: string[]) {
    const dirPaths = localAspects.map((localAspect) => resolve(localAspect.replace('file://', '')));
    const nonExistsDirPaths = dirPaths.filter((path) => !existsSync(path));
    nonExistsDirPaths.forEach((path) => this.logger.warn(`no such file or directory: ${path}`));
    const existsDirPaths = dirPaths.filter((path) => existsSync(path));
    return existsDirPaths;
  }

  private findRuntime(dirPath: string, runtime: string) {
    const files = readdirSync(join(dirPath, 'dist'));
    return files.find((path) => path.includes(`${runtime}.runtime.js`));
  }

  private findAspectFile(dirPath: string) {
    const files = readdirSync(join(dirPath, 'dist'));
    return files.find((path) => path.includes(`.aspect.js`));
  }

  private async loadAspectFromPath(localAspects: string[]) {
    const dirPaths = this.parseLocalAspect(localAspects);
    const manifests = dirPaths.map((dirPath) => {
      const scopeRuntime = this.findRuntime(dirPath, 'scope');
      if (scopeRuntime) {
        // eslint-disable-next-line global-require, import/no-dynamic-require
        const module = require(join(dirPath, 'dist', scopeRuntime));
        return module.default || module;
      }
      // eslint-disable-next-line global-require, import/no-dynamic-require
      const module = require(dirPath);
      return module.default || module;
    });

    await this.aspectLoader.loadExtensionsByManifests(manifests, true);
  }

  private localAspects: string[] = [];

  async loadAspects(ids: string[], throwOnError = false, neededFor?: string, lane?: Lane): Promise<string[]> {
    if (!ids.length) return [];
    // generate a random callId to be able to identify the call from the logs
    const callId = Math.floor(Math.random() * 1000);
    const loggerPrefix = `[${callId}] loadAspects,`;
    this.logger.info(`${loggerPrefix} loading ${ids.length} aspects.
ids: ${ids.join(', ')}
needed-for: ${neededFor || '<unknown>'}`);
    const grouped = await this.groupAspectIdsByEnvOfTheList(ids, lane);
    this.logger.info(`${loggerPrefix} getManifestsAndLoadAspects for grouped.envs, total ${grouped.envs?.length || 0}`);
    const envsManifestsIds = await this.getManifestsAndLoadAspects(grouped.envs, throwOnError, lane);
    this.logger.info(
      `${loggerPrefix} getManifestsAndLoadAspects for grouped.other, total ${grouped.other?.length || 0}`
    );
    const otherManifestsIds = await this.getManifestsAndLoadAspects(grouped.other, throwOnError, lane);
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

  private async getManifestsAndLoadAspects(ids: string[] = [], throwOnError = false, lane?: Lane): Promise<string[]> {
    const { manifests: scopeManifests, potentialPluginsIds } = await this.getManifestsGraphRecursively(
      ids,
      [],
      throwOnError,
      lane
    );
    await this.aspectLoader.loadExtensionsByManifests(scopeManifests);
    const { manifests: scopePluginsManifests } = await this.getManifestsGraphRecursively(
      potentialPluginsIds,
      [],
      throwOnError,
      lane
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
    } = {}
  ): Promise<{ manifests: ManifestOrAspect[]; potentialPluginsIds: string[] }> {
    ids = uniq(ids);
    this.logger.debug(`getManifestsGraphRecursively, ids:\n${ids.join('\n')}`);
    const nonVisitedId = ids.filter((id) => !visited.includes(id));
    if (!nonVisitedId.length) {
      return { manifests: [], potentialPluginsIds: [] };
    }
    const components = await this.getNonLoadedAspects(nonVisitedId, lane);
    // Adding all the envs ids to the array to support case when one (or more) of the aspects has custom aspect env
    const customEnvsIds = components
      .map((component) => this.envs.getEnvId(component))
      .filter((envId) => !this.aspectLoader.isCoreEnv(envId));
    // In case there is custom env we need to load it right away, otherwise we will fail during the require aspects
    await this.getManifestsAndLoadAspects(customEnvsIds, undefined, lane);
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
    this.localAspects = this.localAspects.concat(localAspects);
    // load local aspects for debugging purposes.
    await this.loadAspectFromPath(localAspects);
    const componentIds = await this.scope.resolveMultipleComponentIds(aspectIds);
    if (!componentIds || !componentIds.length) return [];
    const components = await this.scope.import(componentIds, {
      reFetchUnBuiltVersion: false,
      preferDependencyGraph: true,
      lane,
    });

    return components;
  }

  private async resolveLocalAspects(ids: string[], runtime?: string) {
    const dirs = this.parseLocalAspect(ids);

    return dirs.map((dir) => {
      const runtimeManifest = runtime ? this.findRuntime(dir, runtime) : undefined;
      const aspectFilePath = runtime ? this.findAspectFile(dir) : undefined;
      return new AspectDefinition(
        dir,
        aspectFilePath ? join(dir, 'dist', aspectFilePath) : null,
        runtimeManifest ? join(dir, 'dist', runtimeManifest) : null,
        undefined,
        undefined,
        true
      );
    });
  }

  async getResolvedAspects(
    components: Component[],
    opts?: { skipIfExists?: boolean; packageManagerConfigRootDir?: string }
  ): Promise<RequireableComponent[]> {
    if (!components || !components.length) return [];
    const network = await this.isolator.isolateComponents(
      components.map((c) => c.id),
      // includeFromNestedHosts - to support case when you are in a workspace, trying to load aspect defined in the workspace.jsonc but not part of the workspace
      {
        baseDir: this.getAspectCapsulePath(),
        skipIfExists: opts?.skipIfExists ?? true,
        seedersOnly: true,
        includeFromNestedHosts: true,
        installOptions: {
          copyPeerToRuntimeOnRoot: true,
          packageManagerConfigRootDir: opts?.packageManagerConfigRootDir,
          useNesting: true,
          copyPeerToRuntimeOnComponents: true,
          installPeersFromEnvs: true,
        },
      },
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
    const env = this.envs.getEnv(component);
    const compiler: Compiler = env.env.getCompiler();
    const distDir = compiler?.distDir || DEFAULT_DIST_DIRNAME;
    const distExists = existsSync(join(capsule.path, distDir));
    if (distExists) return;

    const compiledCode = component.filesystem.files.flatMap((file) => {
      if (!compiler.isFileSupported(file.path)) {
        return [
          {
            outputText: file.contents.toString('utf8'),
            outputPath: file.path,
          },
        ];
      }

      if (compiler.transpileFile) {
        return compiler.transpileFile(file.contents.toString('utf8'), {
          filePath: file.path,
          componentDir: capsule.path,
        });
      }

      return [];
    });

    await Promise.all(
      compact(compiledCode).map((compiledFile) => {
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
    opts: { packageManagerConfigRootDir?: string } = {}
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

  getAspectCapsulePath() {
    return `${this.scope.path}-aspects`;
  }

  private async resolveUserAspects(runtimeName?: string, userAspectsIds?: ComponentID[]): Promise<AspectDefinition[]> {
    if (!userAspectsIds || !userAspectsIds.length) return [];
    const components = await this.scope.getMany(userAspectsIds);
    const network = await this.isolator.isolateComponents(
      userAspectsIds,
      {
        baseDir: this.getAspectCapsulePath(),
        skipIfExists: true,
        // for some reason this needs to be false, otherwise tagging components in some workspaces
        // result in error during Preview task:
        // "No matching version found for <some-component-on-the-workspace>"
        seedersOnly: true,
        includeFromNestedHosts: true,
        installOptions: {
          copyPeerToRuntimeOnRoot: true,
          useNesting: true,
          copyPeerToRuntimeOnComponents: true,
          installPeersFromEnvs: true,
        },
        host: this.scope,
      },
      this.scope.legacyScope
    );

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
    let userAspectsIds;
    let requestedCoreStringIds;
    if (componentIds && componentIds.length) {
      const groupedByIsCore = groupBy(componentIds, (id) => coreAspectsIds.includes(id.toString()));
      userAspectsIds = groupedByIsCore.false || [];
      requestedCoreStringIds = groupedByIsCore.true?.map((id) => id.toStringWithoutVersion()) || [];
    } else {
      userAspectsIds = await this.scope.resolveMultipleComponentIds(this.aspectLoader.getUserAspects());
    }

    const withoutLocalAspects = userAspectsIds.filter((aspectId) => {
      return !this.localAspects.find((localAspect) => {
        return localAspect.includes(aspectId.fullName.replace('/', '.'));
      });
    });
    const userAspectsDefs = await this.resolveUserAspects(runtimeName, withoutLocalAspects);
    const localResolved = await this.resolveLocalAspects(this.localAspects, runtimeName);
    const coreAspectsDefs = await this.aspectLoader.getCoreAspectDefs(runtimeName);

    const allDefs = userAspectsDefs.concat(coreAspectsDefs).concat(localResolved);
    let afterExclusion = allDefs;
    if (mergedOpts.excludeCore) {
      const userAspectsIdsWithoutVersion = userAspectsIds.map((aspectId) => aspectId.toStringWithoutVersion());
      const userAspectsIdsWithoutVersionAndCoreRequested = userAspectsIdsWithoutVersion.concat(requestedCoreStringIds);
      afterExclusion = allDefs.filter((def) => {
        const id = ComponentID.fromString(def.getId || '');
        const isTarget = userAspectsIdsWithoutVersionAndCoreRequested.includes(id.toStringWithoutVersion());
        // If it's core, but requested explicitly, keep it
        if (isTarget) return true;
        const isCore = coreAspectsDefs.find((coreId) => def.getId === coreId.getId);
        return !isCore;
      });
    }

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
}