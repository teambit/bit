import { join } from 'path';
import { BitId } from '@teambit/legacy-bit-id';
import LegacyScope from '@teambit/legacy/dist/scope/scope';
import { GLOBAL_SCOPE, DEFAULT_DIST_DIRNAME } from '@teambit/legacy/dist/constants';
import { MainRuntime } from '@teambit/cli';
import { ExtensionManifest, Harmony, Aspect, SlotRegistry, Slot } from '@teambit/harmony';
import type { LoggerMain } from '@teambit/logger';
import { ComponentID, Component } from '@teambit/component';
import { Logger, LoggerAspect } from '@teambit/logger';
import { RequireableComponent } from '@teambit/harmony.modules.requireable-component';
import { replaceFileExtToJs } from '@teambit/compilation.modules.babel-compiler';
import { EnvsAspect, EnvsMain } from '@teambit/envs';
import { loadBit } from '@teambit/bit';
import { ScopeAspect, ScopeMain } from '@teambit/scope';
import mapSeries from 'p-map-series';
import { difference, compact, flatten, intersection } from 'lodash';
import { AspectDefinition, AspectDefinitionProps } from './aspect-definition';
import { PluginDefinition } from './plugin-definition';
import { AspectLoaderAspect } from './aspect-loader.aspect';
import { UNABLE_TO_LOAD_EXTENSION, UNABLE_TO_LOAD_EXTENSION_FROM_LIST } from './constants';
import { CannotLoadExtension } from './exceptions';
import { getAspectDef } from './core-aspects';
import { Plugins } from './plugins';

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

export type AspectResolver = (component: Component) => Promise<ResolvedAspect>;

export type ResolvedAspect = {
  aspectPath: string;
  runtimePath: string | null;
};

type OnAspectLoadError = (err: Error, id: ComponentID) => Promise<boolean>;
export type OnAspectLoadErrorSlot = SlotRegistry<OnAspectLoadError>;

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
  constructor(
    private logger: Logger,
    private envs: EnvsMain,
    private harmony: Harmony,
    private onAspectLoadErrorSlot: OnAspectLoadErrorSlot,
    private onLoadRequireableExtensionSlot: OnLoadRequireableExtensionSlot,
    private pluginSlot: PluginDefinitionSlot
  ) {}

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

  isAspectLoaded(id: string) {
    if (this.failedAspects.includes(id)) return true;
    try {
      return this.harmony.get(id);
    } catch (err: any) {
      return false;
    }
  }

  getDescriptor(id: string): AspectDescriptor {
    const instance = this.harmony.get<any>(id);
    const iconFn = instance.icon;

    const icon = iconFn ? iconFn.apply(instance) : undefined;

    return {
      id,
      icon,
    };
  }

  getNotLoadedConfiguredExtensions() {
    const configuredAspects = Array.from(this.harmony.config.raw.keys());
    const loadedExtensions = this.harmony.extensionsIds;
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
      return new AspectDefinition(resolvedAspect.aspectPath, resolvedAspect.runtimePath, component);
    });

    const aspectDefs = await Promise.all(promises);
    // return aspectDefs.filter((def) => def.runtimePath);
    return aspectDefs;
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
  async doRequire(requireableExtension: RequireableComponent): Promise<ExtensionManifest | Aspect> {
    const idStr = requireableExtension.component.id.toString();
    const aspect = await requireableExtension.require();
    const manifest = aspect.default || aspect;
    manifest.id = idStr;
    // It's important to clone deep the manifest here to prevent mutate dependencies of other manifests as they point to the same location in memory
    const cloned = this.cloneManifest(manifest);
    const newManifest = await this.runOnLoadRequireableExtensionSubscribers(requireableExtension, cloned);
    return newManifest;
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
    return this.loadExtensionsByManifests(manifests, throwOnError);
  }

  async getManifestsFromRequireableExtensions(
    requireableExtensions: RequireableComponent[],
    throwOnError = false
  ): Promise<Array<ExtensionManifest | Aspect>> {
    const manifestsP = mapSeries(requireableExtensions, async (requireableExtension) => {
      if (!requireableExtensions) return undefined;
      const idStr = requireableExtension.component.id.toString();
      try {
        return await this.doRequire(requireableExtension);
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
    const errorMsg = error.message.split('\n')[0]; // show only the first line if the error is long (e.g. happens with MODULE_NOT_FOUND errors)
    const msg = UNABLE_TO_LOAD_EXTENSION(idStr, errorMsg);
    if (throwOnError) {
      // @ts-ignore
      this.logger.console(error);
      throw new CannotLoadExtension(idStr, error);
    }
    this.logger.error(msg, error);
    if (this.logger.isLoaderStarted) {
      this.logger.consoleFailure(msg);
    } else {
      this.logger.console(msg);
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
    return Plugins.from(component, defs, (relativePath) => {
      const compiler = this.getCompiler(component);
      if (!compiler) {
        return join(componentPath, relativePath);
      }

      const dist = compiler.getDistPathBySrcPath(relativePath);
      return join(componentPath, dist);
    });
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
  ): Promise<{ components: Component[]; globalScopeHarmony: Harmony }> {
    const globalScope = await LegacyScope.ensure(GLOBAL_SCOPE, 'global-scope');
    await globalScope.ensureDir();
    const globalScopeHarmony = await loadBit(globalScope.path);
    const scope = globalScopeHarmony.get<ScopeMain>(ScopeAspect.id);
    // @todo: Gilad make this work
    // const ids = await scope.resolveMultipleComponentIds(aspectIds);
    const ids = aspectIds.map((id) => ComponentID.fromLegacy(BitId.parse(id, true)));
    const hasVersions = ids.every((id) => id.hasVersion());
    const useCache = hasVersions; // if all components has versions, try to use the cached aspects
    const components = await scope.import(ids, { useCache, throwIfNotExist: true });

    // don't use `await scope.loadAspectsFromCapsules(components, true);`
    // it won't work for globalScope because `this !== scope.aspectLoader` (this instance
    // is not the same as the aspectLoader instance Scope has)
    const resolvedAspects = await scope.getResolvedAspects(components);
    try {
      await this.loadRequireableExtensions(resolvedAspects, true);
    } catch (err: any) {
      if (err?.error.code === 'MODULE_NOT_FOUND') {
        const resolvedAspectsAgain = await scope.getResolvedAspects(components, { skipIfExists: false });
        await this.loadRequireableExtensions(resolvedAspectsAgain, true);
      } else {
        throw err;
      }
    }

    return { components, globalScopeHarmony };
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
    return this;
  }

  // TODO: change to use the new logger, see more info at loadExtensions function in the workspace
  async loadExtensionsByManifests(extensionsManifests: Array<ExtensionManifest | Aspect>, throwOnError = true) {
    try {
      const manifests = extensionsManifests.filter((manifest) => {
        const isValid = this.isValidAspect(manifest);
        if (!isValid) this.logger.warn(`${manifest.id} is invalid. please make sure the extension is valid.`);
        return isValid;
      });
      const preparedManifests = this.prepareManifests(manifests);
      // @ts-ignore TODO: fix this
      await this.harmony.load(preparedManifests);
    } catch (e: any) {
      const ids = extensionsManifests.map((manifest) => manifest.id || 'unknown');
      // TODO: improve texts
      const warning = UNABLE_TO_LOAD_EXTENSION_FROM_LIST(ids);
      this.logger.error(warning, e);
      if (this.logger.isLoaderStarted) {
        this.logger.consoleFailure(warning);
      } else {
        this.logger.console(warning);
        this.logger.console(e);
      }
      if (throwOnError) {
        throw e;
      }
    }
  }

  static runtime = MainRuntime;
  static dependencies = [LoggerAspect, EnvsAspect];
  static slots = [
    Slot.withType<OnAspectLoadError>(),
    Slot.withType<OnLoadRequireableExtension>(),
    Slot.withType<PluginDefinition[]>(),
  ];

  static async provider(
    [loggerExt, envs]: [LoggerMain, EnvsMain],
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

    return aspectLoader;
  }
}

AspectLoaderAspect.addRuntime(AspectLoaderMain);

export default AspectLoaderMain;
