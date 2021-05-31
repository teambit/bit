import { join } from 'path';
import { MainRuntime } from '@teambit/cli';
import { Component, ComponentID } from '@teambit/component';
import { ExtensionManifest, Harmony, Aspect, SlotRegistry, Slot } from '@teambit/harmony';
import type { LoggerMain } from '@teambit/logger';
import { Logger, LoggerAspect } from '@teambit/logger';
import { RequireableComponent } from '@teambit/harmony.modules.requireable-component';
import { EnvsAspect, EnvsMain } from '@teambit/envs';
import mapSeries from 'p-map-series';
import { difference } from 'ramda';
import { AspectDefinition, AspectDefinitionProps } from './aspect-definition';
import { AspectLoaderAspect } from './aspect-loader.aspect';
import { UNABLE_TO_LOAD_EXTENSION, UNABLE_TO_LOAD_EXTENSION_FROM_LIST } from './constants';
import { CannotLoadExtension } from './exceptions';
import { getAspectDef } from './core-aspects';

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
    private onAspectLoadErrorSlot: OnAspectLoadErrorSlot
  ) {}

  private getCompiler(component: Component) {
    const env = this.envs.getEnv(component)?.env;
    return env?.getCompiler();
  }

  registerOnAspectLoadErrorSlot(onAspectLoadError: OnAspectLoadError) {
    this.onAspectLoadErrorSlot.register(onAspectLoadError);
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
    const compiler = this.getCompiler(component);
    const dist = compiler.getDistPathBySrcPath(runtimeFile.relative);

    return join(modulePath, dist);
  }

  isAspectLoaded(id: string) {
    if (this.failedAspects.includes(id)) return true;
    try {
      return this.harmony.get(id);
    } catch (err) {
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
    const doRequire = async (requireableExtension: RequireableComponent, idStr: string) => {
      const aspect = await requireableExtension.require();
      const manifest = aspect.default || aspect;
      manifest.id = idStr;
      return manifest;
    };
    const manifestsP = requireableExtensions.map(async (requireableExtension) => {
      if (!requireableExtensions) return undefined;
      const idStr = requireableExtension.component.id.toString();
      try {
        return await doRequire(requireableExtension, idStr);
      } catch (e) {
        this.addFailure(idStr);
        const errorMsg = UNABLE_TO_LOAD_EXTENSION(idStr);
        this.logger.error(errorMsg, e);
        const isFixed = await this.triggerOnAspectLoadError(e, requireableExtension.component);
        let errAfterReLoad;
        if (isFixed) {
          this.logger.info(`the loading issue has been fixed, re-loading ${idStr}`);
          try {
            return await doRequire(requireableExtension, idStr);
          } catch (err) {
            this.logger.error('re-load of the aspect failed as well', err);
            errAfterReLoad = err;
          }
        }
        const error = errAfterReLoad || e;
        if (throwOnError) {
          this.logger.console(error);
          throw new CannotLoadExtension(idStr, error);
        }
        if (this.logger.isLoaderStarted) {
          this.logger.consoleFailure(errorMsg);
        } else {
          this.logger.console(errorMsg);
          this.logger.console(error.message);
        }
      }
      return undefined;
    });
    const manifests = await Promise.all(manifestsP);

    // Remove empty manifests as a result of loading issue
    const filteredManifests = manifests.filter((manifest) => manifest);
    return this.loadExtensionsByManifests(filteredManifests, throwOnError);
  }

  isAspect(manifest: any) {
    return manifest.addRuntime && manifest.getRuntime;
  }

  private prepareManifests(manifests: ExtensionManifest[]) {
    return manifests.map((manifest: any) => {
      if (this.isAspect(manifest)) return manifest;
      manifest.runtime = MainRuntime;
      if (!manifest.id) throw new Error('manifest must have static id');
      const aspect = Aspect.create({
        id: manifest.id,
      });
      aspect.addRuntime(manifest);
      return aspect;
    });
  }

  // TODO: change to use the new logger, see more info at loadExtensions function in the workspace
  async loadExtensionsByManifests(extensionsManifests: ExtensionManifest[], throwOnError = true) {
    try {
      const manifests = extensionsManifests.filter((manifest) => {
        const isValid = this.isAspect(manifest) || manifest.provider;
        if (!isValid) this.logger.warn(`${manifest.id} is invalid. please make sure the extension is valid.`);
        return isValid;
      });
      const preparedManifests = this.prepareManifests(manifests);
      await this.harmony.load(preparedManifests);
    } catch (e) {
      const ids = extensionsManifests.map((manifest) => manifest.id || 'unknown');
      // TODO: improve texts
      const warning = UNABLE_TO_LOAD_EXTENSION_FROM_LIST(ids);
      this.logger.warn(warning, e);
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
  static slots = [Slot.withType<OnAspectLoadError>()];

  static async provider(
    [loggerExt, envs]: [LoggerMain, EnvsMain],
    config,
    [onAspectLoadErrorSlot]: [OnAspectLoadErrorSlot],
    harmony: Harmony
  ) {
    const logger = loggerExt.createLogger(AspectLoaderAspect.id);
    const aspectLoader = new AspectLoaderMain(logger, envs, harmony, onAspectLoadErrorSlot);
    return aspectLoader;
  }
}

AspectLoaderAspect.addRuntime(AspectLoaderMain);
