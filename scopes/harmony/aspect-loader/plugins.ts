import { Component } from '@teambit/component';
import { Logger } from '@teambit/logger';
import { Aspect } from '@teambit/harmony';
import { PluginDefinition } from './plugin-definition';
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
        await Promise.all(
          plugins.map(async (plugin) => {
            return this.registerPluginWithTryCatch(plugin, aspect);
          })
        );
      },
      runtime,
      // dependencies: this.computeDependencies(runtime)
      dependencies: [],
    });

    return aspect;
  }

  async registerPluginWithTryCatch(plugin: Plugin, aspect: Aspect) {
    try {
      return plugin.register(aspect);
    } catch (firstErr: any) {
      this.logger.warn(`failed loading plugin with pattern "${plugin.def.pattern}", in component ${this.component.id.toString()}, will try to fix and reload`, firstErr);
      const isFixed = await this.triggerOnAspectLoadError(firstErr, this.component);
      let errAfterReLoad;
      if (isFixed) {
        this.logger.info(`the loading issue might be fixed now, re-loading plugin with pattern "${plugin.def.pattern}", in component ${this.component.id.toString()}`);
        try {
          return plugin.register(aspect);
        } catch (err: any) {
          this.logger.warn(`re-load of the plugin with pattern "${plugin.def.pattern}", in component ${this.component.id.toString()} failed as well`, err);
          errAfterReLoad = err;
        }
      }
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
        return new Plugin(pluginDef, resolvePath ? resolvePath(file.relative) : file.path);
      });
    });

    return new Plugins(component, plugins, triggerOnAspectLoadError, logger);
  }
}
