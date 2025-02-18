import { realpathSync, existsSync } from 'fs';
import { Component } from '@teambit/component';
import esmLoader from '@teambit/node.utils.esm-loader';
import { Logger } from '@teambit/logger';
import pMapSeries from 'p-map-series';
import { setExitOnUnhandledRejection } from '@teambit/cli';
import { Aspect } from '@teambit/harmony';
import { PluginDefinition } from './plugin-definition';
import { isEsmModule } from './is-esm-module';
import { Plugin } from './plugin';
import { OnAspectLoadErrorHandler } from './aspect-loader.main.runtime';

export type PluginMap = { [filePath: string]: PluginDefinition };

export class Plugins {
  constructor(
    readonly component: Component,
    readonly plugins: Plugin[],
    private triggerOnAspectLoadError: OnAspectLoadErrorHandler,
    private logger: Logger
  ) {}

  // computeDependencies(runtime: string): Aspect[] {
  //   const inRuntime = this.getByRuntime(runtime);
  //   return inRuntime.flatMap((plugin) => {
  //     return plugin.def.dependencies;
  //   });
  // }

  getByRuntime(runtime: string) {
    return this.plugins.filter((plugin) => {
      return plugin.supportsRuntime(runtime);
    });
  }

  async load(runtime: string) {
    const plugins = this.getByRuntime(runtime);
    const aspect = Aspect.create({
      id: this.component.id.toString(),
    });
    aspect.addRuntime({
      provider: async () => {
        // await Promise.all(plugins.map(async (plugin) => this.registerPluginWithTryCatch(plugin, aspect)));
        await pMapSeries(plugins, async (plugin) => this.registerPluginWithTryCatch(plugin, aspect));
        // Return an empty object so haromny will have something in the extension instance
        // otherwise it will throw an error when trying to access the extension instance (harmony.get)
        return {};
      },
      runtime,
      // dependencies: this.computeDependencies(runtime)
      dependencies: [],
    });

    return aspect;
  }

  async loadModule(path: string) {
    const exists = existsSync(path);
    // We manually resolve the path to avoid issues with symlinks
    // the require.resolve and import inside the esmLoader will sometime uses cached resolved paths
    // which lead to errors about file not found as it's trying to load the file from the wrong path
    // In case the path not exists we don't need to resolve it (it will throw an error)
    const realPath = exists ? realpathSync(path) : path;
    const resolvedPathFromRealPath = require.resolve(realPath);
    const module = await esmLoader(realPath, true);
    const defaultModule = module.default;
    defaultModule.__path = path;
    defaultModule.__resolvedPath = resolvedPathFromRealPath;
    return defaultModule;
  }

  async registerPluginWithTryCatch(plugin: Plugin, aspect: Aspect) {
    try {
      setExitOnUnhandledRejection(false);
      const isModule = isEsmModule(plugin.path);
      const module = isModule ? await this.loadModule(plugin.path) : undefined;
      if (isModule && !module) {
        this.logger.consoleFailure(
          `failed to load plugin ${plugin.path}, make sure to use 'export default' to expose your plugin`
        );
        return undefined;
      }
      plugin.register(aspect, module);
      setExitOnUnhandledRejection(true);
    } catch (firstErr: any) {
      this.logger.warn(
        `failed loading plugin with pattern "${
          plugin.def.pattern
        }", in component ${this.component.id.toString()}, will try to fix and reload`,
        firstErr
      );
      const isFixed = await this.triggerOnAspectLoadError(firstErr, this.component);
      let errAfterReLoad;
      if (isFixed) {
        try {
          const isModule = isEsmModule(plugin.path);
          const module = isModule ? await this.loadModule(plugin.path) : undefined;
          this.logger.info(
            `the loading issue might be fixed now, re-loading plugin with pattern "${
              plugin.def.pattern
            }", in component ${this.component.id.toString()}`
          );
          return plugin.register(aspect, module);
        } catch (err: any) {
          setExitOnUnhandledRejection(true);
          this.logger.warn(
            `re-load of the plugin with pattern "${
              plugin.def.pattern
            }", in component ${this.component.id.toString()} failed as well`,
            err
          );
          errAfterReLoad = err;
        }
      }
      setExitOnUnhandledRejection(true);
      const error = errAfterReLoad || firstErr;
      throw error;
    }
  }

  has() {
    return Boolean(this.plugins.length);
  }

  static from(
    component: Component,
    defs: PluginDefinition[],
    triggerOnAspectLoadError: OnAspectLoadErrorHandler,
    logger: Logger,
    resolvePath?: (path: string) => string
  ) {
    const plugins = defs.flatMap((pluginDef) => {
      const files =
        typeof pluginDef.pattern === 'string'
          ? component.filesystem.byGlob([pluginDef.pattern])
          : component.filesystem.byRegex(pluginDef.pattern);

      return files.map((file) => {
        const resolvedPath = resolvePath ? resolvePath(file.relative) : file.path;
        return new Plugin(pluginDef, resolvedPath);
      });
    });

    return new Plugins(component, plugins, triggerOnAspectLoadError, logger);
  }

  /**
   * Get the plugin files from the component.
   */
  static files(component: Component, defs: PluginDefinition[], resolvePath?: (path: string) => string): string[] {
    const files = defs.flatMap((pluginDef) => {
      const matches =
        typeof pluginDef.pattern === 'string'
          ? component.filesystem.byGlob([pluginDef.pattern])
          : component.filesystem.byRegex(pluginDef.pattern);

      return matches.map((file) => {
        return resolvePath ? resolvePath(file.relative) : file.path;
      });
    });
    return files;
  }
}
