import { difference } from 'ramda';
import { Harmony, ExtensionManifest } from '@teambit/harmony';
import { MainRuntime } from '@teambit/cli';
import { LoggerAspect, Logger } from '@teambit/logger';
import type { LoggerMain } from '@teambit/logger';
import { RequireableComponent } from '@teambit/utils.requireable-component';
import { Component } from '@teambit/component';
import { AspectDefinition } from './aspect-definition';
import { AspectLoaderAspect } from './aspect-loader.aspect';
import { UNABLE_TO_LOAD_EXTENSION_FROM_LIST, UNABLE_TO_LOAD_EXTENSION } from './constants';
import { CannotLoadExtension } from './exceptions';

export type AspectDescriptor = {
  /**
   * name of the extension.
   */
  id: string;

  /**
   * icon of the extension.
   */
  icon: string;
};

export type AspectResolver = (component: Component) => Promise<ResolvedAspect>;

export type ResolvedAspect = {
  aspectPath: string;
  runtimesPath: string;
};

export class AspectLoaderMain {
  constructor(private logger: Logger, private harmony: Harmony) {}

  static runtime = MainRuntime;
  static dependencies = [LoggerAspect];

  getDescriptor(id: string): AspectDescriptor {
    const instance = this.harmony.get<any>(id);
    const iconFn = instance.icon;
    const defaultIcon = `
      <svg width="50" height="50" xmlns="http://www.w3.org/2000/svg">
          <circle cx="25" cy="25" r="20"/>
      </svg>`;

    const icon = iconFn ? iconFn() : defaultIcon;

    return {
      id,
      icon,
    };
  }

  static async provider([loggerExt]: [LoggerMain], config, slots, harmony: Harmony) {
    const logger = loggerExt.createLogger(AspectLoaderAspect.id);
    return new AspectLoaderMain(logger, harmony);
  }

  getNotLoadedConfiguredExtensions() {
    const configuredAspects = Array.from(this.harmony.config.raw.keys());
    const loadedExtensions = this.harmony.extensionsIds;
    const extensionsToLoad = difference(configuredAspects, loadedExtensions);
    return extensionsToLoad;
  }

  async resolveAspects(components: Component[], resolver: AspectResolver): Promise<AspectDefinition[]> {
    const promises = components.map(async (component) => {
      const resolvedAspect = await resolver(component);
      return new AspectDefinition(component, resolvedAspect.aspectPath, resolvedAspect.runtimesPath);
    });

    const aspectDefs = await Promise.all(promises);
    return aspectDefs.filter((def) => def.runtimePath);
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
    const manifestsP = requireableExtensions.map(async (requireableExtension) => {
      if (!requireableExtensions) return undefined;
      const id = requireableExtension.component.id.toString();
      try {
        // TODO: @gilad compile before or skip running on bit compile? we need to do this properly
        const aspect = await requireableExtension.require();
        const manifest = aspect.default || aspect;
        // manifest.id = id;
        return manifest;
      } catch (e) {
        const errorMsg = UNABLE_TO_LOAD_EXTENSION(id);
        this.logger.consoleFailure(errorMsg);
        this.logger.error(errorMsg, e);
        if (throwOnError) {
          // console.log(e);
          throw new CannotLoadExtension(id, e);
        }
        this.logger.console(e);
      }
      return undefined;
    });
    const manifests = await Promise.all(manifestsP);

    // Remove empty manifests as a result of loading issue
    const filteredManifests = manifests.filter((manifest) => manifest);
    return this.loadExtensionsByManifests(filteredManifests, throwOnError);
  }

  // TODO: change to use the new logger, see more info at loadExtensions function in the workspace
  async loadExtensionsByManifests(extensionsManifests: ExtensionManifest[], throwOnError = true) {
    try {
      await this.harmony.load(extensionsManifests);
    } catch (e) {
      const ids = extensionsManifests.map((manifest) => manifest.id || 'unknown');
      // TODO: improve texts
      const warning = UNABLE_TO_LOAD_EXTENSION_FROM_LIST(ids);
      this.logger.warn(warning, e);
      this.logger.consoleFailure(warning);
      if (throwOnError) {
        throw e;
      }
    }
  }
}

AspectLoaderAspect.addRuntime(AspectLoaderMain);
