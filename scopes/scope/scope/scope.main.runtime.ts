import mapSeries from 'p-map-series';
import semver from 'semver';
import multimatch from 'multimatch';
import type { AspectLoaderMain } from '@teambit/aspect-loader';
import { TaskResultsList, BuilderData, BuilderAspect } from '@teambit/builder';
import { readdirSync, existsSync } from 'fs-extra';
import { resolve, join } from 'path';
import { AspectLoaderAspect, AspectDefinition } from '@teambit/aspect-loader';
import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import type { ComponentMain, ComponentMap } from '@teambit/component';
import { Component, ComponentAspect, ComponentFactory, ComponentID, Snap, State } from '@teambit/component';
import type { GraphqlMain } from '@teambit/graphql';
import { GraphqlAspect } from '@teambit/graphql';
import { Harmony, Slot, SlotRegistry, ExtensionManifest, Aspect } from '@teambit/harmony';
import { Capsule, IsolatorAspect, IsolatorMain, IsolateComponentsOptions } from '@teambit/isolator';
import { LoggerAspect, LoggerMain, Logger } from '@teambit/logger';
import { ExpressAspect, ExpressMain } from '@teambit/express';
import type { UiMain } from '@teambit/ui';
import { UIAspect } from '@teambit/ui';
import { RequireableComponent } from '@teambit/harmony.modules.requireable-component';
import { BitId } from '@teambit/legacy-bit-id';
import { BitIds as ComponentsIds } from '@teambit/legacy/dist/bit-id';
import { ModelComponent, Lane } from '@teambit/legacy/dist/scope/models';
import { Repository } from '@teambit/legacy/dist/scope/objects';
import LegacyScope, { LegacyOnTagResult, OnTagFunc, OnTagOpts } from '@teambit/legacy/dist/scope/scope';
import { ComponentLog } from '@teambit/legacy/dist/scope/models/model-component';
import { loadScopeIfExist } from '@teambit/legacy/dist/scope/scope-loader';
import { PersistOptions } from '@teambit/legacy/dist/scope/types';
import { DEFAULT_DIST_DIRNAME } from '@teambit/legacy/dist/constants';
import LegacyGraph from '@teambit/legacy/dist/scope/graph/graph';
import { ExportPersist, PostSign } from '@teambit/legacy/dist/scope/actions';
import { getScopeRemotes } from '@teambit/legacy/dist/scope/scope-remotes';
import { Remotes } from '@teambit/legacy/dist/remotes';
import { isMatchNamespacePatternItem } from '@teambit/workspace.modules.match-pattern';
import { ConfigMain, ConfigAspect } from '@teambit/config';
import { Scope } from '@teambit/legacy/dist/scope';
import { Types } from '@teambit/legacy/dist/scope/object-registrar';
import { FETCH_OPTIONS } from '@teambit/legacy/dist/api/scope/lib/fetch';
import { ObjectList } from '@teambit/legacy/dist/scope/objects/object-list';
import { Http, DEFAULT_AUTH_TYPE, AuthData, getAuthDataFromHeader } from '@teambit/legacy/dist/scope/network/http/http';
import { buildOneGraphForComponentsUsingScope } from '@teambit/legacy/dist/scope/graph/components-graph';
import { remove } from '@teambit/legacy/dist/api/scope';
import { BitError } from '@teambit/bit-error';
import ConsumerComponent from '@teambit/legacy/dist/consumer/component';
import { resumeExport } from '@teambit/legacy/dist/scope/component-ops/export-scope-components';
import { ExtensionDataEntry } from '@teambit/legacy/dist/consumer/config';
import EnvsAspect, { EnvsMain } from '@teambit/envs';
import { Compiler } from '@teambit/compiler';
import { compact, uniq, slice, uniqBy, difference, groupBy } from 'lodash';
import { ComponentNotFound } from './exceptions';
import { ScopeAspect } from './scope.aspect';
import { scopeSchema } from './scope.graphql';
import { ScopeUIRoot } from './scope.ui-root';
import { PutRoute, FetchRoute, ActionRoute, DeleteRoute } from './routes';
import { ScopeComponentLoader } from './scope-component-loader';
import { ScopeCmd } from './scope-cmd';

type TagRegistry = SlotRegistry<OnTag>;

type ManifestOrAspect = ExtensionManifest | Aspect;

export type OnTagResults = { builderDataMap: ComponentMap<BuilderData>; pipeResults: TaskResultsList[] };
export type OnTag = (
  components: Component[],
  options: OnTagOpts,
  isolateOptions?: IsolateComponentsOptions
) => Promise<OnTagResults>;

type RemoteEventMetadata = { auth?: AuthData; headers?: {} };
type RemoteEvent<Data> = (data: Data, metadata: RemoteEventMetadata, errors?: Array<string | Error>) => Promise<void>;
type OnPostPutData = { ids: ComponentID[]; lanes: Lane[] };
type OnPostDeleteData = { ids: ComponentID[] };
type OnPreFetchObjectData = { ids: string[]; fetchOptions: FETCH_OPTIONS };

type OnPostPut = RemoteEvent<OnPostPutData>;
type OnPostExport = RemoteEvent<OnPostPutData>;
type OnPostDelete = RemoteEvent<OnPostDeleteData>;
type OnPostObjectsPersist = RemoteEvent<undefined>;
type OnPreFetchObjects = RemoteEvent<OnPreFetchObjectData>;

export type OnPostPutSlot = SlotRegistry<OnPostPut>;
export type OnPostDeleteSlot = SlotRegistry<OnPostDelete>;
export type OnPostExportSlot = SlotRegistry<OnPostExport>;
export type OnPostObjectsPersistSlot = SlotRegistry<OnPostObjectsPersist>;
export type OnPreFetchObjectsSlot = SlotRegistry<OnPreFetchObjects>;

export type ScopeConfig = {
  httpTimeOut: number;
  description?: string;
  icon?: string;
  backgroundIconColor?: string;
};

export class ScopeMain implements ComponentFactory {
  componentLoader: ScopeComponentLoader;
  constructor(
    /**
     * private reference to the instance of Harmony.
     */
    private harmony: Harmony,
    /**
     * legacy scope
     */
    readonly legacyScope: LegacyScope,

    /**
     * component extension.
     */
    readonly componentExtension: ComponentMain,

    /**
     * slot registry for subscribing to build
     */

    readonly config: ScopeConfig,

    private tagRegistry: TagRegistry,

    private postPutSlot: OnPostPutSlot,

    private postDeleteSlot: OnPostDeleteSlot,

    private postExportSlot: OnPostExportSlot,

    private postObjectsPersist: OnPostObjectsPersistSlot,

    public preFetchObjects: OnPreFetchObjectsSlot,

    private isolator: IsolatorMain,

    private aspectLoader: AspectLoaderMain,

    private logger: Logger,

    private envs: EnvsMain
  ) {
    this.componentLoader = new ScopeComponentLoader(this, this.logger);
  }

  /**
   * name of the scope
   */
  get name(): string {
    return this.legacyScope.name;
  }

  get icon(): string | undefined {
    return this.config.icon;
  }

  get backgroundIconColor(): string | undefined {
    return this.config.backgroundIconColor;
  }

  get description(): string | undefined {
    return this.config.description;
  }

  get path(): string {
    return this.legacyScope.path;
  }

  get isLegacy(): boolean {
    return this.legacyScope.isLegacy;
  }

  /**
   * register to the tag slot.
   */
  onTag(tagFn: OnTag) {
    const host = this.componentExtension.getHost();
    const legacyOnTagFunc: OnTagFunc = async (
      legacyComponents: ConsumerComponent[],
      options: OnTagOpts,
      isolateOptions?: IsolateComponentsOptions
    ): Promise<LegacyOnTagResult[]> => {
      // Reload the aspects with their new version
      await this.reloadAspectsWithNewVersion(legacyComponents);
      const components = await host.getManyByLegacy(legacyComponents);
      const { builderDataMap } = await tagFn(components, options, isolateOptions);
      return this.builderDataMapToLegacyOnTagResults(builderDataMap);
    };
    this.legacyScope.onTag.push(legacyOnTagFunc);
    this.tagRegistry.register(tagFn);
  }

  // We need to reload the aspects with their new version since:
  // during get many by legacy, we go load component which in turn go to getEnv
  // get env validates that the env written on the component is really exist by checking the envs slot registry
  // when we load here, it's env version in the aspect list already has the new version in case the env itself is being tagged
  // so we are search for the env in the registry with the new version number
  // but since the env only registered during the on load of the bit process (before the tag) it's version in the registry is only the old one
  // once we reload them we will have it registered with the new version as well
  async reloadAspectsWithNewVersion(components: ConsumerComponent[]): Promise<void> {
    const host = this.componentExtension.getHost();

    // Return only aspects that defined on components but not in the root config file (workspace.jsonc/scope.jsonc)
    const getUserAspectsIdsWithoutRootIds = (): string[] => {
      const allUserAspectIds = this.aspectLoader.getUserAspects();
      const rootIds = Object.keys(this.harmony.config.toObject());
      const diffIds = difference(allUserAspectIds, rootIds);
      return diffIds;
    };

    // Based on the list of components to be tagged return those who are loaded to harmony with their used version
    const getAspectsByPreviouslyUsedVersion = async (): Promise<string[]> => {
      const harmonyIds = getUserAspectsIdsWithoutRootIds();
      const aspectsIds: string[] = [];
      const aspectsP = components.map(async (component) => {
        const newId = await host.resolveComponentId(component.id);
        if (
          component.previouslyUsedVersion &&
          component.version &&
          component.previouslyUsedVersion !== component.version
        ) {
          const newIdWithPreviouslyUsedVersion = newId.changeVersion(component.previouslyUsedVersion);
          if (harmonyIds.includes(newIdWithPreviouslyUsedVersion.toString())) {
            aspectsIds.push(newId.toString());
          }
        }
      });
      await Promise.all(aspectsP);
      return aspectsIds;
    };

    const idsToLoad = await getAspectsByPreviouslyUsedVersion();
    await host.loadAspects(idsToLoad, false);
  }

  getManyByLegacy(components: ConsumerComponent[]): Promise<Component[]> {
    return mapSeries(components, async (component) => this.getFromConsumerComponent(component));
  }

  clearCache() {
    this.logger.debug('clearing the components and the legacy cache');
    this.componentLoader.clearCache();
    this.legacyScope.objects.clearCache();
  }

  builderDataMapToLegacyOnTagResults(builderDataComponentMap: ComponentMap<BuilderData>): LegacyOnTagResult[] {
    const builderDataToLegacyExtension = (component: Component, builderData: BuilderData) => {
      const existingBuilder = component.state.aspects.get(BuilderAspect.id)?.legacy;
      const builderExtension = existingBuilder || new ExtensionDataEntry(undefined, undefined, BuilderAspect.id);
      builderExtension.data = builderData;
      return builderExtension;
    };
    return builderDataComponentMap.toArray().map(([component, builderData]) => ({
      id: component.id._legacy,
      builderData: builderDataToLegacyExtension(component, builderData),
    }));
  }

  /**
   * register to the post-export slot.
   */
  onPostPut(postPutFn: OnPostPut) {
    this.postPutSlot.register(postPutFn);
    return this;
  }

  /**
   * register to the post-delete slot.
   */
  onPostDelete(postDeleteFn: OnPostDelete) {
    this.postDeleteSlot.register(postDeleteFn);
    return this;
  }

  /**
   * register to the post-export slot.
   */
  registerOnPostExport(postExportFn: OnPostExport) {
    this.postExportSlot.register(postExportFn);
    return this;
  }

  registerOnPreFetchObjects(preFetchObjectsFn: OnPreFetchObjects) {
    this.preFetchObjects.register(preFetchObjectsFn);
    return this;
  }

  registerOnPostObjectsPersist(postObjectsPersistFn: OnPostObjectsPersist) {
    this.postObjectsPersist.register(postObjectsPersistFn);
    return this;
  }

  /**
   * Will fetch a list of components into the current scope.
   * This will only fetch the object and won't write the files to the actual FS
   *
   * @param {ComponentsIds} ids list of ids to fetch
   */
  fetch(ids: ComponentsIds) {} // eslint-disable-line @typescript-eslint/no-unused-vars

  /**
   * This function will get a component and sealed it's current state into the scope
   *
   * @param {Component[]} components A list of components to seal with specific persist options (such as message and version number)
   * @param {PersistOptions} persistGeneralOptions General persistence options such as verbose
   */
  persist(components: Component[], options: PersistOptions) {} // eslint-disable-line @typescript-eslint/no-unused-vars

  async delete(
    { ids, force, lanes }: { ids: string[]; force: boolean; lanes: boolean },
    headers?: Record<string, any>
  ) {
    const authData = getAuthDataFromHeader(headers?.authorization);
    const result = await remove({
      path: this.path,
      ids,
      force,
      lanes,
    });

    const fns = this.postDeleteSlot.values();
    const metadata = { auth: authData, headers };
    const componentIds = lanes ? [] : ids.map((id) => ComponentID.fromString(id));
    await mapSeries(fns, async (fn) => {
      try {
        await fn({ ids: componentIds }, metadata);
      } catch (err: any) {
        this.logger.error('failed to run delete slot', err);
      }
    });
    return result;
  }

  async toObjectList(types: Types): Promise<ObjectList> {
    const objects = await this.legacyScope.objects.list(types);
    return ObjectList.fromBitObjects(objects);
  }

  // TODO: temporary compiler workaround - discuss this with david.
  private toJs(str: string) {
    if (str.endsWith('.ts')) return str.replace('.ts', '.js');
    return str;
  }

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

  async loadAspects(ids: string[], throwOnError = false, neededFor?: ComponentID): Promise<string[]> {
    this.logger.info(`loadAspects, loading ${ids.length} aspects.
ids: ${ids.join(', ')}
needed-for: ${neededFor?.toString() || '<unknown>'}`);
    const grouped = await this.groupAspectIdsByEnvOfTheList(ids);
    const envsManifestsIds = await this.getManifestsAndLoadAspects(grouped.envs, throwOnError);
    const otherManifestsIds = await this.getManifestsAndLoadAspects(grouped.other, throwOnError);
    return envsManifestsIds.concat(otherManifestsIds);
  }

  /**
   * This function get's a list of aspect ids and return them grouped by whether any of them is the env of other from the list
   * @param ids
   */
  async groupAspectIdsByEnvOfTheList(ids: string[]): Promise<{ envs: string[]; other: string[] }> {
    const components = await this.getNonLoadedAspects(ids);
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

  private async getManifestsAndLoadAspects(ids: string[], throwOnError = false): Promise<string[]> {
    const scopeManifests = await this.getManifestsGraphRecursively(ids, [], throwOnError);
    await this.aspectLoader.loadExtensionsByManifests(scopeManifests);
    return compact(scopeManifests.map((manifest) => manifest.id));
  }

  async getManifestsGraphRecursively(
    ids: string[],
    visited: string[] = [],
    throwOnError = false,
    opts: {
      packageManagerConfigRootDir?: string;
    } = {}
  ): Promise<ManifestOrAspect[]> {
    ids = uniq(ids);
    const nonVisitedId = ids.filter((id) => !visited.includes(id));
    if (!nonVisitedId.length) {
      return [];
    }
    const components = await this.getNonLoadedAspects(nonVisitedId);
    visited.push(...nonVisitedId);
    const manifests = await this.requireAspects(components, throwOnError, opts);
    const depsToLoad: Array<ExtensionManifest | Aspect> = [];
    await mapSeries(manifests, async (manifest) => {
      depsToLoad.push(...(manifest.dependencies || []));
      // @ts-ignore
      (manifest._runtimes || []).forEach((runtime) => {
        depsToLoad.push(...(runtime.dependencies || []));
      });
      const depIds = depsToLoad.map((d) => d.id).filter((id) => id) as string[];
      const loaded = await this.getManifestsGraphRecursively(depIds, visited, throwOnError);
      manifests.push(...loaded);
    });
    return manifests;
  }

  private async getNonLoadedAspects(ids: string[]): Promise<Component[]> {
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
    const componentIds = await this.resolveMultipleComponentIds(aspectIds);
    if (!componentIds || !componentIds.length) return [];
    const components = await this.import(componentIds, { reFetchUnBuiltVersion: false });

    return components;
  }

  private async resolveLocalAspects(ids: string[], runtime?: string) {
    const dirs = this.parseLocalAspect(ids);

    return dirs.map((dir) => {
      const runtimeManifest = runtime ? this.findRuntime(dir, runtime) : undefined;
      return new AspectDefinition(
        dir,
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
          dedupe: false,
          packageManagerConfigRootDir: opts?.packageManagerConfigRootDir,
        },
      },
      this.legacyScope
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
    return `${this.path}-aspects`;
  }

  private async resolveUserAspects(runtimeName?: string, userAspectsIds?: ComponentID[]): Promise<AspectDefinition[]> {
    if (!userAspectsIds || !userAspectsIds.length) return [];
    const components = await this.getMany(userAspectsIds);
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
        installOptions: { copyPeerToRuntimeOnRoot: true, dedupe: false },
        host: this,
      },
      this.legacyScope
    );
    const capsules = network.seedersCapsules;
    const aspectDefs = await this.aspectLoader.resolveAspects(components, async (component) => {
      const capsule = capsules.getCapsule(component.id);
      if (!capsule) throw new Error(`failed loading aspect: ${component.id.toString()}`);
      const localPath = capsule.path;

      return {
        aspectPath: localPath,
        runtimePath: runtimeName ? await this.aspectLoader.getRuntimePath(component, localPath, runtimeName) : null,
      };
    });
    return aspectDefs;
  }

  async resolveAspects(runtimeName?: string, componentIds?: ComponentID[]): Promise<AspectDefinition[]> {
    const userAspectsIds = componentIds || (await this.resolveMultipleComponentIds(this.aspectLoader.getUserAspects()));
    const withoutLocalAspects = userAspectsIds.filter((aspectId) => {
      return !this.localAspects.find((localAspect) => {
        return localAspect.includes(aspectId.fullName.replace('/', '.'));
      });
    });
    const userAspectsDefs = await this.resolveUserAspects(runtimeName, withoutLocalAspects);
    const localResolved = await this.resolveLocalAspects(this.localAspects, runtimeName);
    const coreAspects = await this.aspectLoader.getCoreAspectDefs(runtimeName);

    const allDefs = userAspectsDefs.concat(coreAspects).concat(localResolved);
    const uniqDefs = uniqBy(allDefs, (def) => `${def.aspectPath}-${def.runtimePath}`);
    let defs = uniqDefs;
    if (runtimeName) {
      defs = defs.filter((def) => def.runtimePath);
    }
    return defs;
  }

  async getLegacyGraph(ids?: ComponentID[]): Promise<LegacyGraph> {
    if (!ids || ids.length < 1) ids = (await this.list()).map((comp) => comp.id) || [];
    const legacyIds = ids.map((id) => {
      let bitId = id._legacy;
      // The resolve bitId in scope will remove the scope name in case it's the same as the scope
      // We restore it back to use it correctly in the legacy code.
      if (!bitId.hasScope()) {
        bitId = bitId.changeScope(this.legacyScope?.name);
      }
      return bitId;
    });

    const legacyGraph = await buildOneGraphForComponentsUsingScope(legacyIds, this.legacyScope);
    return legacyGraph;
  }

  /**
   * import components into the scope.
   */
  async import(
    ids: ComponentID[],
    {
      useCache = true,
      throwIfNotExist = false,
      reFetchUnBuiltVersion = true,
      lane,
    }: {
      /**
       * if the component exists locally, don't go to the server to search for updates.
       */
      useCache?: boolean;
      throwIfNotExist?: boolean;
      /**
       * if the Version objects exists locally, but its `buildStatus` is Pending or Failed, reach the remote to find
       * whether the version was already built there.
       */
      reFetchUnBuiltVersion?: boolean;
      /**
       * if the component is on a lane, provide the lane object. the component will be fetched from the lane-scope and
       * not from the component-scope.
       */
      lane?: Lane;
    } = {}
  ): Promise<Component[]> {
    const legacyIds = ids.map((id) => {
      const legacyId = id._legacy;
      if (legacyId.scope === this.name) return legacyId.changeScope(null);
      return legacyId;
    });

    const withoutOwnScopeAndLocals = legacyIds.filter((id) => {
      return id.scope !== this.name && id.hasScope();
    });
    const lanes = lane ? [lane] : undefined;
    await this.legacyScope.import(
      ComponentsIds.fromArray(withoutOwnScopeAndLocals),
      useCache,
      reFetchUnBuiltVersion,
      lanes
    );

    return this.getMany(ids, throwIfNotExist);
  }

  async get(id: ComponentID): Promise<Component | undefined> {
    return this.componentLoader.get(id);
  }

  async getFromConsumerComponent(consumerComponent: ConsumerComponent): Promise<Component> {
    return this.componentLoader.getFromConsumerComponent(consumerComponent);
  }

  /**
   * get a component from a remote without importing it
   */
  async getRemoteComponent(id: ComponentID): Promise<Component> {
    return this.componentLoader.getRemoteComponent(id);
  }

  /**
   * get a component from a remote without importing it
   */
  async getManyRemoteComponents(ids: ComponentID[]): Promise<Component[]> {
    return this.componentLoader.getManyRemoteComponents(ids);
  }

  /**
   * list all components in the scope.
   */
  async list(
    filter?: { offset: number; limit: number; namespaces?: string[] },
    includeCache = false,
    includeFromLanes = false
  ): Promise<Component[]> {
    const patternsWithScope =
      (filter?.namespaces && filter?.namespaces.map((pattern) => `**/${pattern || '**'}`)) || undefined;
    const componentsIds = await this.listIds(includeCache, includeFromLanes, patternsWithScope);

    return this.getMany(
      filter && filter.limit ? slice(componentsIds, filter.offset, filter.offset + filter.limit) : componentsIds
    );
  }

  /**
   * for now, list of invalid components are mostly useful for the workspace.
   * in the future, this can return components that failed to load in the scope due to objects file
   * corruption or similar issues.
   */
  async listInvalid() {
    return [];
  }

  /**
   * get ids of all scope components.
   * @param includeCache whether or not include components that their scope-name is different than the current scope-name
   */
  async listIds(includeCache = false, includeFromLanes = false, patterns?: string[]): Promise<ComponentID[]> {
    const allModelComponents = await this.legacyScope.list();
    const filterByCacheAndLanes = (modelComponent: ModelComponent) => {
      const cacheFilter = includeCache ? true : this.exists(modelComponent);
      const lanesFilter = includeFromLanes ? true : modelComponent.hasHead();

      return cacheFilter && lanesFilter;
    };
    const modelComponentsToList = allModelComponents.filter(filterByCacheAndLanes);
    let ids = modelComponentsToList.map((component) =>
      ComponentID.fromLegacy(component.toBitIdWithLatestVersion(), component.scope || this.name)
    );
    if (patterns && patterns.length > 0) {
      ids = ids.filter((id) =>
        patterns?.some((pattern) => isMatchNamespacePatternItem(id.toStringWithoutVersion(), pattern).match)
      );
    }
    this.logger.debug(`scope listIds: componentsIds after filter scope: ${JSON.stringify(ids, undefined, 2)}`);
    return ids;
  }

  /**
   * Check if a specific id exist in the scope
   * @param componentId
   */
  async hasId(componentId: ComponentID, includeCache = false): Promise<boolean> {
    if (!includeCache && componentId.scope !== this.name) return false;
    const opts = {
      includeOrphaned: true,
      includeVersion: true,
    };

    return this.legacyScope.hasId(componentId._legacy, opts);
  }

  async hasIdNested(componentId: ComponentID, includeCache = false): Promise<boolean> {
    return this.hasId(componentId, includeCache);
  }

  /**
   * determine whether a component exists in the scope.
   */
  exists(modelComponent: ModelComponent) {
    return modelComponent.scope === this.name;
  }

  async getMany(ids: ComponentID[], throwIfNotExist = false): Promise<Component[]> {
    const idsWithoutEmpty = compact(ids);
    const componentsP = mapSeries(idsWithoutEmpty, async (id: ComponentID) => {
      return throwIfNotExist ? this.getOrThrow(id) : this.get(id);
    });
    const components = await componentsP;
    return compact(components);
  }

  /**
   * load components from a scope and load their aspects
   */
  async loadMany(ids: ComponentID[]): Promise<Component[]> {
    const components = await mapSeries(ids, (id) => this.load(id));
    return compact(components);
  }

  /**
   * get a component and throw an exception if not found.
   * @param id component id
   */
  async getOrThrow(id: ComponentID): Promise<Component> {
    const component = await this.get(id);
    if (!component) throw new ComponentNotFound(id);
    return component;
  }

  /**
   * returns a specific state of a component.
   * @param id component ID.
   * @param hash state hash.
   */
  async getState(id: ComponentID, hash: string): Promise<State> {
    return this.componentLoader.getState(id, hash);
  }

  async getSnap(id: ComponentID, hash: string): Promise<Snap> {
    return this.componentLoader.getSnap(id, hash);
  }

  async getLogs(id: ComponentID, shortHash = false, startsFrom?: string): Promise<ComponentLog[]> {
    return this.legacyScope.loadComponentLogs(id._legacy, shortHash, startsFrom);
  }

  /**
   * resolve a component ID.
   * @param id component ID.
   */
  async resolveComponentId(id: string | ComponentID | BitId): Promise<ComponentID> {
    const idStr = id.toString();
    const component = await this.legacyScope.loadModelComponentByIdStr(idStr);
    const getIdToCheck = () => {
      if (component) return idStr; // component exists in the scope with the scope-name.
      if (idStr.startsWith(`${this.name}/`)) {
        // component with the full name doesn't exist in the scope, it might be locally tagged
        return idStr.replace(`${this.name}/`, '');
      }
      return idStr;
    };
    const IdToCheck = getIdToCheck();
    const legacyId = id instanceof BitId ? id : await this.legacyScope.getParsedId(IdToCheck);
    if (!legacyId.scope) return ComponentID.fromLegacy(legacyId, this.name);
    return ComponentID.fromLegacy(legacyId);
  }

  async resolveMultipleComponentIds(ids: Array<string | ComponentID | BitId>) {
    return Promise.all(ids.map(async (id) => this.resolveComponentId(id)));
  }

  /**
   * @deprecated use `this.idsByPattern` instead for consistency, which supports also negation and list of patterns.
   */
  async byPattern(patterns: string[], scope = '**'): Promise<Component[]> {
    const patternsWithScope = patterns.map((pattern) => `${scope}/${pattern || '**'}`);

    const ids = await this.listIds(true, false, patternsWithScope);

    const components = await this.getMany(ids);
    return components;
  }

  /**
   * get component-ids matching the given pattern. a pattern can have multiple patterns separated by a comma.
   * it uses multimatch (https://www.npmjs.com/package/multimatch) package for the matching algorithm, which supports
   * (among others) negate character "!" to exclude ids. See the package page for more supported characters.
   */
  async idsByPattern(pattern: string, throwForNoMatch = true): Promise<ComponentID[]> {
    if (!pattern.includes('*') && !pattern.includes(',')) {
      // if it's not a pattern but just id, resolve it without multimatch to support specifying id without scope-name
      const id = await this.resolveComponentId(pattern);
      const exists = await this.hasId(id, true);
      if (exists) return [id];
      if (throwForNoMatch) throw new BitError(`unable to find "${pattern}" in the scope`);
      return [];
    }
    const ids = await this.listIds(true);
    return this.filterIdsFromPoolIdsByPattern(pattern, ids, throwForNoMatch);
  }

  filterIdsFromPoolIdsByPattern(pattern: string, ids: ComponentID[], throwForNoMatch = true) {
    const patterns = pattern.split(',').map((p) => p.trim());
    // check also as legacyId.toString, as it doesn't have the defaultScope
    const idsToCheck = (id: ComponentID) => [id.toStringWithoutVersion(), id._legacy.toStringWithoutVersion()];
    const idsFiltered = ids.filter((id) => multimatch(idsToCheck(id), patterns).length);
    if (throwForNoMatch && !idsFiltered.length) {
      throw new BitError(`unable to find any matching for "${pattern}" pattern`);
    }
    return idsFiltered;
  }

  async getExactVersionBySemverRange(id: ComponentID, range: string): Promise<string | undefined> {
    const modelComponent = await this.legacyScope.getModelComponent(id._legacy);
    const versions = modelComponent.listVersions();
    return semver.maxSatisfying<string>(versions, range, { includePrerelease: true })?.toString();
  }

  async resumeExport(exportId: string, remotes: string[]): Promise<string[]> {
    return resumeExport(this.legacyScope, exportId, remotes);
  }

  async resolveId(id: string): Promise<ComponentID> {
    const legacyId = await this.legacyScope.getParsedId(id);
    return ComponentID.fromLegacy(legacyId);
  }

  // TODO: add new API for this
  async _legacyRemotes(): Promise<Remotes> {
    return getScopeRemotes(this.legacyScope);
  }

  /**
   * list all component ids from a remote-scope
   */
  async listRemoteScope(scopeName: string): Promise<ComponentID[]> {
    const remotes = await this._legacyRemotes();
    const remote = await remotes.resolve(scopeName, this.legacyScope);
    const results = await remote.list();
    return results.map(({ id }) => ComponentID.fromLegacy(id));
  }

  /**
   * get a component and load its aspect
   */
  async load(id: ComponentID): Promise<Component | undefined> {
    const component = await this.get(id);
    if (!component) return undefined;
    const aspectIds = component.state.aspects.ids;
    // load components from type aspects as aspects.
    if (this.aspectLoader.isAspectComponent(component)) {
      aspectIds.push(component.id.toString());
    }
    await this.loadAspects(aspectIds, true, id);

    return component;
  }

  async loadComponentsAspect(component: Component) {
    const aspectIds = component.state.aspects.ids;
    await this.loadAspects(aspectIds, true, component.id);
  }

  async isModified(): Promise<boolean> {
    return false;
  }

  async write() {
    // no-op (it's relevant for the workspace only)
  }

  /**
   * declare the slots of scope extension.
   */
  static slots = [
    Slot.withType<OnTag>(),
    Slot.withType<OnPostPut>(),
    Slot.withType<OnPostDelete>(),
    Slot.withType<OnPostExport>(),
    Slot.withType<OnPostObjectsPersist>(),
    Slot.withType<OnPreFetchObjects>(),
  ];
  static runtime = MainRuntime;

  static dependencies = [
    ComponentAspect,
    UIAspect,
    GraphqlAspect,
    CLIAspect,
    IsolatorAspect,
    AspectLoaderAspect,
    ExpressAspect,
    LoggerAspect,
    EnvsAspect,
    ConfigAspect,
  ];

  static defaultConfig: ScopeConfig = {
    httpTimeOut: 600000,
  };

  static async provider(
    [componentExt, ui, graphql, cli, isolator, aspectLoader, express, loggerMain, envs, configMain]: [
      ComponentMain,
      UiMain,
      GraphqlMain,
      CLIMain,
      IsolatorMain,
      AspectLoaderMain,
      ExpressMain,
      LoggerMain,
      EnvsMain,
      ConfigMain
    ],
    config: ScopeConfig,
    [tagSlot, postPutSlot, postDeleteSlot, postExportSlot, postObjectsPersistSlot, preFetchObjectsSlot]: [
      TagRegistry,
      OnPostPutSlot,
      OnPostDeleteSlot,
      OnPostExportSlot,
      OnPostObjectsPersistSlot,
      OnPreFetchObjectsSlot
    ],
    harmony: Harmony
  ) {
    const bitConfig: any = harmony.config.get('teambit.harmony/bit');
    const legacyScope = await loadScopeIfExist(bitConfig?.cwd);
    if (!legacyScope) {
      return undefined;
    }

    const logger = loggerMain.createLogger(ScopeAspect.id);
    const scope = new ScopeMain(
      harmony,
      legacyScope,
      componentExt,
      config,
      tagSlot,
      postPutSlot,
      postDeleteSlot,
      postExportSlot,
      postObjectsPersistSlot,
      preFetchObjectsSlot,
      isolator,
      aspectLoader,
      logger,
      envs
    );
    cli.registerOnStart(async (hasWorkspace: boolean) => {
      if (hasWorkspace) return;
      await scope.loadAspects(aspectLoader.getNotLoadedConfiguredExtensions());
    });
    cli.register(new ScopeCmd());

    const onPutHook = async (ids: string[], lanes: Lane[], authData?: AuthData): Promise<void> => {
      logger.debug(`onPutHook, started. (${ids.length} components)`);
      scope.componentLoader.clearCache();
      const componentIds = await scope.resolveMultipleComponentIds(ids);
      const fns = postPutSlot.values();
      const data = {
        ids: componentIds,
        lanes,
      };
      const metadata = { auth: authData };
      await Promise.all(fns.map(async (fn) => fn(data, metadata)));
      logger.debug(`onPutHook, completed. (${ids.length} components)`);
    };

    const getAuthData = (): AuthData | undefined => {
      const token = Http.getToken();
      return token ? { type: DEFAULT_AUTH_TYPE, credentials: token } : undefined;
    };

    const onPostExportHook = async (ids: BitId[], lanes: Lane[]): Promise<void> => {
      logger.debug(`onPostExportHook, started. (${ids.length} components)`);
      const componentIds = await scope.resolveMultipleComponentIds(ids);
      const fns = postExportSlot.values();
      const data = {
        ids: componentIds,
        lanes,
      };
      const metadata = { auth: getAuthData() };
      await Promise.all(fns.map(async (fn) => fn(data, metadata)));
      logger.debug(`onPostExportHook, completed. (${ids.length} components)`);
    };

    const onPostObjectsPersistHook = async (): Promise<void> => {
      logger.debug(`onPostObjectsPersistHook, started`);
      const fns = postObjectsPersistSlot.values();
      const metadata = { auth: getAuthData() };
      await Promise.all(fns.map(async (fn) => fn(undefined, metadata)));
      logger.debug(`onPostObjectsPersistHook, completed`);
    };

    ExportPersist.onPutHook = onPutHook;
    PostSign.onPutHook = onPutHook;
    Scope.onPostExport = onPostExportHook;
    Repository.onPostObjectsPersist = onPostObjectsPersistHook;

    configMain?.registerPreAddingAspectsSlot?.(async (compIds) => {
      const loadedIds = await scope.loadAspects(compIds, true);
      // find the full component-ids including versions in the load-aspects results.
      // we need it for bit-use to be added to the config file.
      return compIds.map((compId) => {
        const loaded = loadedIds.find((loadedId) => loadedId.startsWith(`${compId}@`));
        return loaded || compId;
      });
    });

    express.register([
      new PutRoute(scope, postPutSlot),
      new FetchRoute(scope, logger),
      new ActionRoute(scope),
      new DeleteRoute(scope),
    ]);
    // @ts-ignore - @ran to implement the missing functions and remove it
    ui.registerUiRoot(new ScopeUIRoot(scope));
    graphql.register(scopeSchema(scope));
    componentExt.registerHost(scope);

    return scope;
  }
}

ScopeAspect.addRuntime(ScopeMain);
