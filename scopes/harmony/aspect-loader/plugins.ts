import path from 'path';
import { Component } from '@teambit/component';
import { Aspect } from '@teambit/harmony';
import { Logger } from '@teambit/logger';
import chalk from 'chalk';
import { PluginDefinition } from './plugin-definition';
import { Plugin } from './plugin';
import { OnAspectLoadErrorHandler } from './aspect-loader.main.runtime';

export class Plugins {
  constructor(
    readonly component: Component,
    readonly plugins: Plugin[],
    private triggerOnAspectLoadError: OnAspectLoadErrorHandler,
    private logger: Logger
  ) {}

  private static pluginCache: Map<string, Plugin[]> = new Map();
  private static nonPluginComponentsCache: Set<string> = new Set();

  getByRuntime(runtime: string) {
    return this.plugins.filter((plugin) => {
      return plugin?.supportsRuntime(runtime);
    });
  }

  async load(runtime: string) {
    const plugins = this?.getByRuntime(runtime);
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
        return {};
      },
      runtime,
      dependencies: [],
    });

    return aspect;
  }

  async registerPluginWithTryCatch(plugin: Plugin, aspect: Aspect) {
    let isPluginLoadedSuccessfully = false;

    try {
      plugin.register(aspect);
      isPluginLoadedSuccessfully = true;
    } catch (firstErr: any) {
      const isFixed = await this.triggerOnAspectLoadError(firstErr, this.component);
      if (isFixed) {
        try {
          plugin.register(aspect);
          isPluginLoadedSuccessfully = true;
        } catch (err: any) {
          this.logger.warn(`Error: ${err} while loading plugin file`);
        }
      }
    }

    if (!isPluginLoadedSuccessfully) {
      this.logger.error('Plugin loading failed after all attempts.');
      throw new Error('Plugin loading failed after all attempts.');
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
  ): Plugins {
    const componentId = component.id.toString();

    if (this.nonPluginComponentsCache.has(componentId)) {
      return new Plugins(component, [], triggerOnAspectLoadError, logger);
    }

    const plugins = defs.flatMap((pluginDef) => {
      const cachedPlugins = Plugins.pluginCache.get(pluginDef.pattern.toString());
      if (cachedPlugins) {
        return cachedPlugins;
      }

      const files = Plugins.getFileMatches(component, pluginDef);
      if (files.length > 0) {
        const loadedPlugins = files.map((file) => {
          let resolvedPath = file.path;
          if (resolvePath) {
            resolvedPath = resolvePath(file.relative);
          }
          if (component.filesystem.files.some((f) => f.relative === '.bit-capsule-ready')) {
            resolvedPath = path.join(resolvedPath, 'dist');
          }
          return new Plugin(pluginDef, resolvedPath);
        });
        Plugins.pluginCache.set(pluginDef.pattern.toString(), loadedPlugins);
        return loadedPlugins;
      }

      return [];
    });

    if (!plugins.length) {
      this.nonPluginComponentsCache.add(componentId);
      const warningMessage = this.constructNoPluginFileWarningMessage(component);
      logger.consoleWarning(warningMessage);
    }

    return new Plugins(component, plugins, triggerOnAspectLoadError, logger);
  }

  static files(
    component: Component,
    defs: PluginDefinition[],
    logger: Logger,
    resolvePath?: (path: string) => string
  ): string[] {
    return defs.flatMap((pluginDef) => {
      const matches = this.getFileMatches(component, pluginDef);
      return matches.map((file) => (resolvePath ? resolvePath(file.relative) : file.path));
    });
  }

  private static getFileMatches(component: Component, pluginDef: PluginDefinition): any[] {
    return typeof pluginDef.pattern === 'string'
      ? component.filesystem.byGlob([pluginDef.pattern])
      : component.filesystem.byRegex(pluginDef.pattern);
  }

  private static constructNoPluginFileWarningMessage(component: Component): string {
    return `plugin file from env with id: ${chalk.blue(component.id.toString())} could not be loaded.
Ensure the env has a plugin file with the correct file pattern.
Example: ${chalk.cyan('*.bit-env.*')}
Run: ${chalk.cyan('bit plugins --patterns')} to see all available plugin patterns.`;
  }
}
