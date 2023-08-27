import path from 'path';
import chalk from 'chalk';
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
  private static checkedComponents: Set<string> = new Set();

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

  async registerPluginWithTryCatch(plugin: Plugin, aspect: Aspect) {
    try {
      return plugin.register(aspect);
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
        this.logger.info(
          `the loading issue might be fixed now, re-loading plugin with pattern "${
            plugin.def.pattern
          }", in component ${this.component.id.toString()}`
        );
        try {
          return plugin.register(aspect);
        } catch (err: any) {
          this.logger.warn(
            `re-load of the plugin with pattern "${
              plugin.def.pattern
            }", in component ${this.component.id.toString()} failed as well`,
            err
          );
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
  ): Plugins {
    const plugins = defs.flatMap((pluginDef) => {
      const files = this.getFileMatches(component, pluginDef);

      if (files.length === 0 && !Plugins.checkedComponents.has(component.id.toString())) {
        logger.consoleWarning(this.constructWarningMessage(component));
        Plugins.checkedComponents.add(component.id.toString());
      }

      return files.map((file) => {
        return new Plugin(pluginDef, resolvePath ? resolvePath(file.relative) : file.path);
      });
    });

    return new Plugins(component, plugins, triggerOnAspectLoadError, logger);
  }

  /**
   * Get the plugin files from the component.
   */

  static files(
    component: Component,
    defs: PluginDefinition[],
    logger: Logger,
    resolvePath?: (path: string) => string
  ): string[] {
    const files = defs.flatMap((pluginDef) => {
      const matches = this.getFileMatches(component, pluginDef);

      const warningMessage = this.constructWarningMessage(component);
      if (matches.length === 0 && warningMessage && !Plugins.checkedComponents.has(component.id.toString())) {
        logger.consoleWarning(warningMessage);
        Plugins.checkedComponents.add(component.id.toString());
      }

      return matches.map((file) => {
        return resolvePath ? resolvePath(file.relative) : file.path;
      });
    });
    return files;
  }

  private static getFileMatches(component: Component, pluginDef: PluginDefinition): any[] {
    return typeof pluginDef.pattern === 'string'
      ? component.filesystem.byGlob([pluginDef.pattern])
      : component.filesystem.byRegex(pluginDef.pattern);
  }

  private static isImportedComponent(component: Component): boolean {
    return path.isAbsolute(component.filesystem.files[0]?.path || '');
  }

  private static constructWarningMessage(component: Component): string | undefined {
    if (this.isImportedComponent(component)) {
      return (
        `env with id: ${chalk.blue(component.id.toString())} could not be loaded.\n` +
        'Ensure the env has a plugin file with the correct file pattern.' +
        `\nExample: ${chalk.cyan('*.bit-env.*')}\n` +
        `Run: ${chalk.cyan('bit plugins --patterns')} to see all available plugin patterns.`
      );
    }
    return undefined;
  }
}
