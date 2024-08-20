import { join, resolve, extname } from 'path';
import { NativeCompileCache } from '@teambit/toolbox.performance.v8-cache';
import esmLoader from '@teambit/node.utils.esm-loader';
// import findRoot from 'find-root';
import { readdirSync, existsSync } from 'fs-extra';
import { Graph, Node, Edge } from '@teambit/graph.cleargraph';
import { ComponentID } from '@teambit/component-id';
import LegacyScope from '@teambit/legacy/dist/scope/scope';
import { GLOBAL_SCOPE, DEFAULT_DIST_DIRNAME } from '@teambit/legacy/dist/constants';
import { MainRuntime } from '@teambit/cli';
import { ExtensionManifest, Harmony, Aspect, SlotRegistry, Slot } from '@teambit/harmony';
import { BitError } from '@teambit/bit-error';
import type { LoggerMain } from '@teambit/logger';
import { Component, FilterAspectsOptions } from '@teambit/component';
import { Logger, LoggerAspect } from '@teambit/logger';
import { RequireableComponent } from '@teambit/harmony.modules.requireable-component';
import { replaceFileExtToJs } from '@teambit/compilation.modules.babel-compiler';
import { EnvsAspect, EnvsMain } from '@teambit/envs';
import { LegacyGlobal, loadBit, takeLegacyGlobalsSnapshot } from '@teambit/bit';
import { ScopeAspect, ScopeMain } from '@teambit/scope';
import { GraphqlAspect, GraphqlMain } from '@teambit/graphql';
import mapSeries from 'p-map-series';
import { difference, compact, flatten, intersection, uniqBy, some, isEmpty, isObject } from 'lodash';
import { AspectDefinition, AspectDefinitionProps } from './aspect-definition';
import { PluginDefinition } from './plugin-definition';
import { AspectLoaderAspect } from './aspect-loader.aspect';
import { UNABLE_TO_LOAD_EXTENSION, UNABLE_TO_LOAD_EXTENSION_FROM_LIST } from './constants';
import { isEsmModule } from './is-esm-module';
import { CannotLoadExtension } from './exceptions';
import { getAspectDef, getCoreAspectPackageName } from './core-aspects';
import { Plugins } from './plugins';
import { aspectLoaderSchema } from './aspect-loader.graphql';

export type PluginDefinitionSlot = SlotRegistry<PluginDefinition[]>;

export type AspectDescriptor = {
  /**
   * name of the extension.
   */
  id: string;

  /**
   * icon of the extension.
   */
  icon?: string;
};

export type AspectResolver = (component: Component) => Promise<ResolvedAspect | undefined>;

export type ResolvedAspect = {
  aspectPath: string;
  runtimePath: string | null;
  aspectFilePath: string | null;
};

export type LoadExtByManifestContext = {
  seeders?: string[];
  neededFor?: string;
};

export type LoadExtByManifestOptions = {
  throwOnError?: boolean;
  hideMissingModuleError?: boolean;
  ignoreErrors?: boolean;
  /**
   * If this is enabled then we will show loading error only once for a given extension
   * (even if it was actually try to load it few times by different components for example)
   */
  unifyErrorsByExtId?: boolean;
};

type OnAspectLoadError = (err: Error, id: ComponentID) => Promise<boolean>;
export type OnAspectLoadErrorSlot = SlotRegistry<OnAspectLoadError>;

export type OnAspectLoadErrorHandler = (err: Error, component: Component) => Promise<boolean>;

export type OnLoadRequireableExtension = (
  requireableExtension: RequireableComponent,
  manifest: ExtensionManifest | Aspect
) => Promise<ExtensionManifest | Aspect>;
/**
 * A slot which run during loading the requirable extension (after first manifest calculation)
 */
export type OnLoadRequireableExtensionSlot = SlotRegistry<OnLoadRequireableExtension>;

export type MainAspect = {
  /**
   * path to the main aspect.
   */
  path: string;

  /**
   * version of the aspect.
   */
  version: string | undefined;

  /**
   * package name of the aspect
   */
  packageName: string | undefined;

  /**
   * reference to aspect manifest.
   */
  aspect: Aspect;

  /**
   * The name of the aspect (without the scope prefix)
   */
  name: string;

  /**
   * The name of the aspect
   */
  id: string;
};

export class AspectLoaderMain {
  private inMemoryConfiguredAspects: string[] = [];
  private failedToLoadExt = new Set<string>();
  private alreadyShownWarning = new Set<string>();

  constructor(
    private logger: Logger,
    private envs: EnvsMain,
    private harmony: Harmony,
    private onAspectLoadErrorSlot: OnAspectLoadErrorSlot,
    private onLoadRequireableExtensionSlot: OnLoadRequireableExtensionSlot,
    private pluginSlot: PluginDefinitionSlot
  ) {}

  getCoreAspectsPackagesAndIds(): Record<string, string> {
    const allCoreAspectsIds = this.getCoreAspectIds();
    const coreAspectsPackagesAndIds = {};

    allCoreAspectsIds.forEach((id) => {
      const packageName = getCoreAspectPackageName(id);
      coreAspectsPackagesAndIds[packageName] = id;
    });

    return coreAspectsPackagesAndIds;
  }

  private getCompiler(component: Component) {
    const env = this.envs.getEnv(component)?.env;
    return env?.getCompiler();
  }

  registerOnAspectLoadErrorSlot(onAspectLoadError: OnAspectLoadError) {
    this.onAspectLoadErrorSlot.register(onAspectLoadError);
  }

  registerOnLoadRequireableExtensionSlot(onLoadRequireableExtension: OnLoadRequireableExtension) {
    this.onLoadRequireableExtensionSlot.register(onLoadRequireableExtension);
  }

  /**
   * returns whether the aspect-load issue has been fixed.
   */
  async triggerOnAspectLoadError(err: Error, component: Component): Promise<boolean> {
    const entries = this.onAspectLoadErrorSlot.toArray(); // e.g. [ [ 'teambit.bit/compiler', [Function: bound onAspectLoadError] ] ]
    let isFixed = false;
    await mapSeries(entries, async ([, onAspectFailFunc]) => {
      const result = await onAspectFailFunc(err, component.id);
      if (result) isFixed = true;
    });

    return isFixed;
  }

  async getRuntimePath(component: Component, modulePath: string, runtime: string): Promise<string | null> {
    const runtimeFile = component.filesystem.files.find((file: any) => {
      return file.relative.includes(`.${runtime}.runtime`);
    });

    // @david we should add a compiler api for this.
    if (!runtimeFile) return null;
    try {
      const compiler = this.getCompiler(component);

      if (!compiler) {
        return join(modulePath, runtimeFile.relative);
      }

      const dist = compiler.getDistPathBySrcPath(runtimeFile.relative);
      return join(modulePath, dist);
    } catch (e) {
      this.logger.info(`got an error during get runtime path, probably the env is not loaded yet ${e}`);
      // TODO: we are manually adding the dist here and replace the file name to handle case when
      // we load aspects from scope, and their env in the same iteration, but we get into the aspect before its
      // env, so it's env doesn't exist yet
      // we should make sure to first load the env correctly before loading the aspect
      const distPath = join(modulePath, DEFAULT_DIST_DIRNAME, replaceFileExtToJs(runtimeFile.relative));
      return distPath;
    }
  }

  async getAspectFilePath(component: Component, modulePath: string): Promise<string | null> {
    const aspectFile = component.filesystem.files.find((file: any) => {
      return file.relative.includes(`.aspect.ts`) || file.relative.includes(`.aspect.js`);
    });

    // @david we should add a compiler api for this.
    if (!aspectFile) return null;
    try {
      const compiler = this.getCompiler(component);

      if (!compiler) {
        return join(modulePath, aspectFile.relative);
      }

      const dist = compiler.getDistPathBySrcPath(aspectFile.relative);
      return join(modulePath, dist);
    } catch (e) {
      this.logger.info(`got an error during get runtime path, probably the env is not loaded yet ${e}`);
      // TODO: we are manually adding the dist here and replace the file name to handle case when
      // we load aspects from scope, and their env in the same iteration, but we get into the aspect before its
      // env, so it's env doesn't exist yet
      // we should make sure to first load the env correctly before loading the aspect
      const distPath = join(modulePath, DEFAULT_DIST_DIRNAME, replaceFileExtToJs(aspectFile.relative));
      return distPath;
    }
  }

  isAspectLoaded(id: string) {
    if (this.failedAspects.includes(id)) return true;
    try {
      return this.harmony.get(id);
    } catch (err: any) {
      return false;
    }
  }

  getDescriptor(id: string): AspectDescriptor | undefined {
    try {
      const instance = this.harmony.get<any>(id);
      const iconFn = instance.icon;

      const icon = iconFn ? iconFn.apply(instance) : undefined;

      return {
        id,
        icon,
      };
    } catch (err) {
      return undefined;
    }
  }

  /**
   * This is used when adding aspects to workspace.jsonc during the process (like in bit use command)
   * and we want to make sure that follow operation (like bit install) will recognize those aspects
   * but the harmony config is already in memory.
   * Probably a better to do it is to make sure we can re-load the config somehow
   * ideally by adding the config class in harmony a reload API
   * @param aspectId
   */
  addInMemoryConfiguredAspect(aspectId: string): void {
    this.inMemoryConfiguredAspects.push(aspectId);
  }

  /**
   * get all the configured aspects in the config file (workspace.jsonc / scope.jsonc)
   */
  getConfiguredAspects(): string[] {
    const configuredAspects = Array.from(this.harmony.config.raw.keys());
    const iMemoryConfiguredAspects = this.inMemoryConfiguredAspects;
    return configuredAspects.concat(iMemoryConfiguredAspects);
  }
  getNotLoadedConfiguredExtensions() {
    const configuredAspects = this.getConfiguredAspects();
    const harmonyExtensions = this.harmony.extensionsIds;
    const loadedExtensions = harmonyExtensions.filter((extId) => {
      return this.harmony.extensions.get(extId)?.loaded;
    });
    const extensionsToLoad = difference(configuredAspects, loadedExtensions);
    return extensionsToLoad;
  }

  loadDefinition(props: AspectDefinitionProps): AspectDefinition {
    return AspectDefinition.from(props);
  }

  private _coreAspects: Aspect[] = [];

  get coreAspects() {
    return this._coreAspects;
  }

  isCoreAspect(id: string) {
    const ids = this.getCoreAspectIds();
    return ids.includes(id);
  }

  setCoreAspects(aspects: Aspect[]) {
    this._coreAspects = aspects;
    return this;
  }

  getCoreAspectIds() {
    const ids = this.coreAspects.map((aspect) => aspect.id);
    return ids.concat(this._reserved);
  }

  /**
   * Get all the core envs ids which is still register in the bit manifest as core aspect
   */
  getCoreEnvsIds(): string[] {
    const envsIds = this.envs.getCoreEnvsIds();
    const allIds = this.getCoreAspectIds();
    return intersection(allIds, envsIds);
  }

  isCoreEnv(id: string): boolean {
    const ids = this.getCoreEnvsIds();
    return ids.includes(id);
  }

  private _reserved = ['teambit.harmony/bit', 'teambit.harmony/config'];

  getUserAspects(): string[] {
    const coreAspectIds = this.getCoreAspectIds();
    return difference(this.harmony.extensionsIds, coreAspectIds);
  }

  async getCoreAspectDefs(runtimeName?: string) {
    const defs = await Promise.all(
      this.coreAspects.map(async (aspect) => {
        const id = aspect.id;
        const rawDef = await getAspectDef(id, runtimeName);
        return this.loadDefinition(rawDef);
      })
    );

    return defs.filter((def) => def.runtimePath);
  }

  async resolveAspects(components: Component[], resolver: AspectResolver): Promise<AspectDefinition[]> {
    const promises = components.map(async (component) => {
      const resolvedAspect = await resolver(component);
      if (!resolvedAspect) return undefined;
      return new AspectDefinition(
        resolvedAspect.aspectPath,
        resolvedAspect.aspectFilePath,
        resolvedAspect.runtimePath,
        component
      );
    });

    const aspectDefs = await Promise.all(promises);
    // return aspectDefs.filter((def) => def.runtimePath);
    return compact(aspectDefs);
  }

  private _mainAspect: MainAspect;

  get mainAspect() {
    return this._mainAspect;
  }

  setMainAspect(mainAspect: MainAspect) {
    this._mainAspect = mainAspect;
    return this;
  }

  private failedLoadAspect: string[] = [];

  get failedAspects() {
    return this.failedLoadAspect;
  }

  public resetFailedLoadAspects() {
    this.failedLoadAspect = [];
  }

  private addFailure(id: string): void {
    if (this.failedAspects.includes(id)) return;
    this.failedLoadAspect.push(id);
  }

  cloneManifest(manifest: any) {
    const cloned = Object.assign(Object.create(Object.getPrototypeOf(manifest)), manifest);
    cloned.provider = manifest.provider;
    cloned.addRuntime = manifest.addRuntime;
    cloned.getRuntime = manifest.getRuntime;
    return cloned;
  }

  /**
   * run "require" of the component code to get the manifest
   */
  async doRequire(
    requireableExtension: RequireableComponent,
    runSubscribers = true
  ): Promise<ExtensionManifest | Aspect> {
    const idStr = requireableExtension.component.id.toString();
    const aspect = await requireableExtension.require();
    const manifest = aspect.default || aspect;
    manifest.id = idStr;
    // It's important to clone deep the manifest here to prevent mutate dependencies of other manifests as they point to the same location in memory
    const cloned = this.cloneManifest(manifest);
    if (runSubscribers) return this.runOnLoadRequireableExtensionSubscribers(requireableExtension, cloned);
    return cloned;
  }

  /**
   * in case the extension failed to load, prefer to throw an error, unless `throwOnError` param
   * passed as `false`.
   * there are cases when throwing an error blocks the user from doing anything else. for example,
   * when a user develops an extension and deletes the node-modules, the extension on the workspace
   * cannot be loaded anymore until "bit compile" is running. however, if this function throws an
   * error, it'll throw for "bit compile" as well, which blocks the user.
   * for the CI, it is important to throw an error because errors on console can be ignored.
   * for now, when loading the extension from the workspace the throwOnError is passed as false.
   * when loading from the scope (CI) it should be true.
   *
   * the console printing here is done directly by "console.error" and not by the logger. the reason
   * is that the logger.console only prints when the loader started (which, btw, happens after
   * entering this function, so it can't work) and here we want it to be printed regardless of the
   * rules of starting the loader. e.g. if by mistake the CI got it as throwOnError=false, it's ok
   * to break the output by the console.error.
   *
   * @todo: this is not the final word however about throwing/non throwing errors here.
   * in some cases, such as "bit tag", it's better not to tag if an extension changes the model.
   */
  async loadRequireableExtensions(requireableExtensions: RequireableComponent[], throwOnError = false): Promise<void> {
    const manifests = await this.getManifestsFromRequireableExtensions(requireableExtensions, throwOnError);
    return this.loadExtensionsByManifests(manifests, undefined, { throwOnError });
  }

  async getManifestsFromRequireableExtensions(
    requireableExtensions: RequireableComponent[],
    throwOnError = false,
    runSubscribers = true
  ): Promise<Array<ExtensionManifest | Aspect>> {
    const manifestsP = mapSeries(requireableExtensions, async (requireableExtension) => {
      if (!requireableExtensions) return undefined;
      const idStr = requireableExtension.component.id.toString();
      try {
        return await this.doRequire(requireableExtension, runSubscribers);
      } catch (firstErr: any) {
        this.addFailure(idStr);
        this.logger.warn(`failed loading an aspect "${idStr}", will try to fix and reload`, firstErr);
        const isFixed = await this.triggerOnAspectLoadError(firstErr, requireableExtension.component);
        let errAfterReLoad;
        if (isFixed) {
          this.logger.info(`the loading issue might be fixed now, re-loading ${idStr}`);
          try {
            return await this.doRequire(requireableExtension);
          } catch (err: any) {
            this.logger.warn(`re-load of the aspect "${idStr}" failed as well`, err);
            errAfterReLoad = err;
          }
        }
        const error = errAfterReLoad || firstErr;
        this.handleExtensionLoadingError(error, idStr, throwOnError);
      }
      return undefined;
    });
    const manifests = await manifestsP;

    // Remove empty manifests as a result of loading issue
    return compact(manifests);
  }

  handleExtensionLoadingError(error: Error, idStr: string, throwOnError: boolean) {
    this.envs.addFailedToLoadExt(idStr);
    const errorMsg = error.message.split('\n')[0]; // show only the first line if the error is long (e.g. happens with MODULE_NOT_FOUND errors)
    const msg = UNABLE_TO_LOAD_EXTENSION(idStr, errorMsg);
    if (throwOnError) {
      // @ts-ignore
      this.logger.console(error);
      throw new CannotLoadExtension(idStr, error);
    }
    this.logger.error(msg, error);
    this.printWarningIfFirstTime(idStr, msg, this.logger.isLoaderStarted);
  }

  private printWarningIfFirstTime(envId: string, msg: string, showAsFailure: boolean) {
    if (!this.alreadyShownWarning.has(envId)) {
      this.alreadyShownWarning.add(envId);
      if (showAsFailure) {
        this.logger.consoleFailure(msg);
      } else {
        this.logger.consoleWarning(msg);
      }
    }
  }

  async runOnLoadRequireableExtensionSubscribers(
    requireableExtension: RequireableComponent,
    manifest: ExtensionManifest | Aspect
  ): Promise<ExtensionManifest | Aspect> {
    let updatedManifest = manifest;
    const entries = this.onLoadRequireableExtensionSlot.toArray();
    await mapSeries(entries, async ([, onLoadRequireableExtensionFunc]) => {
      updatedManifest = await onLoadRequireableExtensionFunc(requireableExtension, updatedManifest);
    });
    return updatedManifest;
  }

  getPluginDefs() {
    return flatten(this.pluginSlot.values());
  }

  getPlugins(component: Component, componentPath: string): Plugins {
    const defs = this.getPluginDefs();
    return this.getPluginsFromDefs(component, componentPath, defs);
  }

  async isEsmModule(path: string) {
    return isEsmModule(path);
  }

  async loadEsm(path: string) {
    NativeCompileCache.uninstall();
    return esmLoader(path);
  }

  getPluginsFromDefs(component: Component, componentPath: string, defs: PluginDefinition[]): Plugins {
    return Plugins.from(
      component,
      defs,
      this.triggerOnAspectLoadError.bind(this),
      this.logger,
      this.pluginFileResolver.call(this, component, componentPath)
    );
  }

  getPluginFiles(component: Component, componentPath: string): string[] {
    const defs = this.getPluginDefs();
    return Plugins.files(component, defs, this.pluginFileResolver.call(this, component, componentPath));
  }

  hasPluginFiles(component: Component): boolean {
    const defs = this.getPluginDefs();
    const files = Plugins.files(component, defs);
    return !isEmpty(files);
  }

  private searchDistFile(rootDir: string, relativePath: string, replaceNotFound = false) {
    const defaultDistDir = join(rootDir, 'dist');
    const fileExtension = extname(relativePath);
    const fileNames = ['ts', 'js', 'tsx', 'jsx'].map((ext) =>
      relativePath.replace(new RegExp(`${fileExtension}$`), `.${ext}`)
    );
    const defaultDistPath = fileNames.map((fileName) => join(defaultDistDir, fileName));
    const found = defaultDistPath.find((distPath) => existsSync(distPath));
    if (found) return found;
    if (!replaceNotFound) return null;
    const jsFileName = relativePath.replace(new RegExp(`${fileExtension}$`), `.js`);
    const finalPath = join(defaultDistDir, jsFileName);
    return finalPath;
  }

  pluginFileResolver(component: Component, rootDir: string) {
    return (relativePath: string) => {
      const replaceNotFound = relativePath.endsWith('.ts') || relativePath.endsWith('.tsx');

      try {
        const compiler = this.getCompiler(component);
        if (!compiler) {
          const distFile = this.searchDistFile(rootDir, relativePath, replaceNotFound);
          return distFile || join(rootDir, relativePath);
        }

        const dist = compiler.getDistPathBySrcPath(relativePath);
        return join(rootDir, dist);
      } catch (err) {
        // This might happen for example when loading an env from the global scope, and the env of the env / aspect is not a core one
        this.logger.info(
          `pluginFileResolver: got an error during get compiler for component ${component.id.toString()}, probably the env is not loaded yet ${err}`
        );
        const distFile = this.searchDistFile(rootDir, relativePath, replaceNotFound);
        return distFile || join(rootDir, relativePath);
      }
    };
  }

  isAspect(manifest: any) {
    return !!(manifest.addRuntime && manifest.getRuntime);
  }

  isValidAspect(manifest: any): boolean {
    return this.isAspect(manifest) || manifest.provider;
  }

  isAspectComponent(component: Component): boolean {
    return this.envs.isUsingAspectEnv(component);
  }

  /**
   * get or create a global scope, import the non-core aspects, load bit from that scope, create
   * capsules for the aspects and load them from the capsules.
   */
  async loadAspectsFromGlobalScope(
    aspectIds: string[]
  ): Promise<{ components: Component[]; globalScopeHarmony: Harmony; legacyGlobalsSnapshot: LegacyGlobal[] }> {
    const globalScope = await LegacyScope.ensure(GLOBAL_SCOPE, 'global-scope');
    await globalScope.ensureDir();
    const legacyGlobalsSnapshot = takeLegacyGlobalsSnapshot();
    const globalScopeHarmony = await loadBit(globalScope.path);
    const scope = globalScopeHarmony.get<ScopeMain>(ScopeAspect.id);
    const aspectLoader = globalScopeHarmony.get<AspectLoaderMain>(AspectLoaderAspect.id);
    const ids = aspectIds.map((id) => ComponentID.fromString(id));
    const hasVersions = ids.every((id) => id.hasVersion());
    const useCache = hasVersions; // if all components has versions, try to use the cached aspects
    await scope.import(ids, { useCache, reason: 'to load aspects from global scope' });
    const components = await scope.getMany(ids, true);

    // don't use `await scope.loadAspectsFromCapsules(components, true);`
    // it won't work for globalScope because `this !== scope.aspectLoader` (this instance
    // is not the same as the aspectLoader instance Scope has)
    const resolvedAspects = await scope.getResolvedAspects(components, { workspaceName: 'global-scope' });
    try {
      await aspectLoader.loadRequireableExtensions(resolvedAspects, true);
    } catch (err: any) {
      if (err?.error?.code === 'MODULE_NOT_FOUND') {
        const resolvedAspectsAgain = await scope.getResolvedAspects(components, {
          skipIfExists: false,
          workspaceName: 'global-scope',
        });
        await aspectLoader.loadRequireableExtensions(resolvedAspectsAgain, true);
      } else {
        throw err;
      }
    }

    return { components, globalScopeHarmony, legacyGlobalsSnapshot };
  }

  filterAspectDefs(
    allDefs: AspectDefinition[],
    componentIds: ComponentID[],
    runtimeName: string | undefined,
    filterOpts: FilterAspectsOptions = {}
  ) {
    const coreIds = this.getCoreAspectIds();
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

  getAspectIdFromAspectFile(aspectFilePath: string): string | undefined {
    try {
      // eslint-disable-next-line global-require, import/no-dynamic-require
      const module = aspectFilePath ? require(aspectFilePath) : undefined;
      let manifest = module.default || module;
      if (this.isAspect(manifest)) {
        return manifest.id;
      }
      if (isObject(manifest)) {
        if (isEmpty(manifest)) {
          this.logger.warn(
            `getAspectIdFromAspectFile - aspect at ${aspectFilePath} missing exports. couldn't calculate the manifest`
          );
          return undefined;
        }
        if (Object.keys(manifest).length > 1) {
          this.logger.warn(
            `getAspectIdFromAspectFile - aspect at ${aspectFilePath} exports too many keys. couldn't calculate the manifest`
          );
          return undefined;
        }
        manifest = Object.values(manifest)[0];
        if (this.isAspect(manifest)) {
          return manifest.id;
        }
      }
      this.logger.warn(`getAspectIdFromAspectFile - aspect at ${aspectFilePath} is not a valid aspect`);
      return undefined;
    } catch (err) {
      this.logger.warn(`getAspectIdFromAspectFile - couldn't require the aspect file ${aspectFilePath}. err: ${err}`);
      return undefined;
    }
  }

  private prepareManifests(manifests: Array<ExtensionManifest | Aspect>): Aspect[] {
    return manifests.map((manifest: any) => {
      if (this.isAspect(manifest)) return manifest as Aspect;
      manifest.runtime = MainRuntime;
      if (!manifest.id) throw new Error('manifest must have static id');
      const aspect = Aspect.create({
        id: manifest.id,
      });
      aspect.addRuntime(manifest);
      return aspect;
    });
  }

  /**
   * register a plugin.
   */
  registerPlugins(pluginDefs: PluginDefinition[]) {
    this.pluginSlot.register(pluginDefs);
  }

  async loadExtensionsByManifests(
    extensionsManifests: Array<ExtensionManifest | Aspect>,
    context: LoadExtByManifestContext = {
      seeders: [],
    },
    options: LoadExtByManifestOptions = {
      throwOnError: true,
      hideMissingModuleError: false,
      ignoreErrors: false,
      unifyErrorsByExtId: true,
    }
  ) {
    const neededFor = context.neededFor;
    const seeders = context.seeders || [];
    const defaultLoadExtByManifestOptions = {
      throwOnError: true,
      hideMissingModuleError: false,
      ignoreErrors: false,
      unifyErrorsByExtId: true,
    };
    const mergedOptions = { ...defaultLoadExtByManifestOptions, ...options };
    try {
      const manifests = extensionsManifests.filter((manifest) => {
        const isValid = this.isValidAspect(manifest);
        if (!isValid) this.logger.warn(`${manifest.id} is invalid. please make sure the extension is valid.`);
        return isValid;
      });
      const preparedManifests = this.prepareManifests(manifests);
      // don't let harmony load all aspects. if seeders were sent, find their manifests, check for their static
      // dependencies, and load only them.
      const getOnlyDeclaredDependenciesManifests = () => {
        if (!seeders.length || seeders.length === preparedManifests.length) {
          return preparedManifests;
        }
        const manifestGraph = this.generateManifestGraph(preparedManifests);
        const nodes = seeders.map((seeder) => manifestGraph.successors(seeder)).flat();
        const seederNodes = compact(seeders.map((seeder) => manifestGraph.node(seeder)));
        const allNodes = [...nodes, ...seederNodes];
        const nodesUniq = uniqBy(allNodes, 'id');
        return nodesUniq.map((n) => n.attr);
      };
      const relevantManifests = getOnlyDeclaredDependenciesManifests();
      // @ts-ignore TODO: fix this
      await this.harmony.load(relevantManifests);
    } catch (e: any) {
      const ids = extensionsManifests.map((manifest) => manifest.id || 'unknown');
      if (mergedOptions.unifyErrorsByExtId) {
        const needToPrint = some(ids, (id) => !this.failedToLoadExt.has(id));
        if (!needToPrint) return;
        ids.forEach((id) => {
          this.failedToLoadExt.add(id);
          this.envs.addFailedToLoadExt(id);
          const parsedId = ComponentID.tryFromString(id);
          if (parsedId) {
            this.failedToLoadExt.add(parsedId.fullName);
            this.envs.addFailedToLoadExt(parsedId.fullName);
          }
        });
      }
      if (mergedOptions.ignoreErrors) return;
      if ((e.code === 'MODULE_NOT_FOUND' || e.code === 'ERR_MODULE_NOT_FOUND') && mergedOptions.hideMissingModuleError)
        return;
      // TODO: improve texts
      const errorMsg = e.message.split('\n')[0];
      const warning = UNABLE_TO_LOAD_EXTENSION_FROM_LIST(ids, errorMsg, neededFor);
      this.logger.error(warning, e);
      if (this.logger.isLoaderStarted) {
        if (mergedOptions.throwOnError) throw new BitError(warning);
        this.logger.consoleFailure(warning);
      } else {
        this.logger.consoleWarning(warning);
        this.logger.consoleWarning(e);
      }
      if (mergedOptions.throwOnError) {
        throw e;
      }
    }
  }

  private generateManifestGraph(manifests: Aspect[]) {
    const graph = new Graph<Aspect, string>();
    manifests.forEach((manifest) => graph.setNode(new Node(manifest.id, manifest)));
    manifests.forEach((manifest) => {
      const deps = manifest.getRuntime(MainRuntime)?.dependencies?.map((dep) => dep.id);
      deps?.forEach((dep) => {
        if (graph.node(dep)) {
          graph.setEdge(new Edge(manifest.id, dep, 'dep'));
        }
      });
    });
    return graph;
  }

  public async loadAspectFromPath(localAspects: string[]) {
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

    await this.loadExtensionsByManifests(manifests, undefined, { throwOnError: true });
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

  public async resolveLocalAspects(ids: string[], runtime?: string): Promise<AspectDefinition[]> {
    const dirs = this.parseLocalAspect(ids);

    return dirs.map((dir) => {
      const srcRuntimeManifest = runtime ? this.findRuntime(dir, runtime) : undefined;
      const srcAspectFilePath = runtime ? this.findAspectFile(dir) : undefined;
      const aspectFilePath = srcAspectFilePath ? join(dir, 'dist', srcAspectFilePath) : null;
      const runtimeManifest = srcRuntimeManifest ? join(dir, 'dist', srcRuntimeManifest) : null;
      const aspectId = aspectFilePath ? this.getAspectIdFromAspectFile(aspectFilePath) : undefined;

      return new AspectDefinition(dir, aspectFilePath, runtimeManifest, undefined, aspectId, true);
    });
  }

  private findAspectFile(dirPath: string) {
    const files = readdirSync(join(dirPath, 'dist'));
    return files.find((path) => path.includes(`.aspect.js`));
  }

  static runtime = MainRuntime;
  static dependencies = [LoggerAspect, EnvsAspect, GraphqlAspect];
  static slots = [
    Slot.withType<OnAspectLoadError>(),
    Slot.withType<OnLoadRequireableExtension>(),
    Slot.withType<PluginDefinition[]>(),
  ];

  static async provider(
    [loggerExt, envs, graphql]: [LoggerMain, EnvsMain, GraphqlMain],
    config,
    [onAspectLoadErrorSlot, onLoadRequireableExtensionSlot, pluginSlot]: [
      OnAspectLoadErrorSlot,
      OnLoadRequireableExtensionSlot,
      PluginDefinitionSlot
    ],
    harmony: Harmony
  ) {
    const logger = loggerExt.createLogger(AspectLoaderAspect.id);
    const aspectLoader = new AspectLoaderMain(
      logger,
      envs,
      harmony,
      onAspectLoadErrorSlot,
      onLoadRequireableExtensionSlot,
      pluginSlot
    );

    graphql.register(aspectLoaderSchema(aspectLoader));
    aspectLoader.registerPlugins([envs.getEnvPlugin()]);

    return aspectLoader;
  }
}

AspectLoaderAspect.addRuntime(AspectLoaderMain);

export default AspectLoaderMain;
