import fs from 'fs-extra';
import { Aspect } from '@teambit/harmony';
import { PluginDefinition } from './plugin-definition';

export class Plugin {
  constructor(readonly def: PluginDefinition, readonly path: string) {}

  // consider adding a more abstract type here to allow users to ask for dependencies.
  private _instance: undefined | any;

  /**
   * determines whether the plugin supports a certain runtime.
   */
  supportsRuntime(runtime: string) {
    return this.def.runtimes.includes(runtime);
  }

  register(sourceAspect: Aspect, module?: unknown) {
    const object = module || this.require();
    this.def.register<unknown>(object, sourceAspect);
  }

  require() {
    // eslint-disable-next-line global-require, import/no-dynamic-require
    this._instance = require(this.path).default as any;
    this._instance.__path = this.path;
    this._instance.__resolvedPath = require.resolve(this.path);
    return this._instance;
  }
}
