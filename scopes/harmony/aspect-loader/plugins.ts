import { Component } from '@teambit/component';
import { Aspect } from '@teambit/harmony';
import { PluginDefinition } from './plugin-definition';
import { Plugin } from './plugin';

export type PluginMap = { [filePath: string]: PluginDefinition };

export class Plugins {
  constructor(readonly component: Component, readonly plugins: Plugin[]) {}

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

  load(runtime: string) {
    const plugins = this.getByRuntime(runtime);
    const aspect = Aspect.create({
      id: this.component.id.toString(),
    });

    aspect.addRuntime({
      provider: async () => {
        plugins.forEach((plugin) => {
          plugin.register();
        });
      },
      runtime,
      // dependencies: this.computeDependencies(runtime)
      dependencies: [],
    });

    return aspect;
  }

  has() {
    return Boolean(this.plugins.length);
  }

  static from(component: Component, defs: PluginDefinition[], resolvePath?: (path: string) => string) {
    const plugins = defs.flatMap((pluginDef) => {
      const files =
        typeof pluginDef.pattern === 'string'
          ? component.filesystem.byGlob([pluginDef.pattern])
          : component.filesystem.byRegex(pluginDef.pattern);

      return files.map((file) => {
        return new Plugin(pluginDef, resolvePath ? resolvePath(file.relative) : file.path);
      });
    });

    return new Plugins(component, plugins);
  }
}
