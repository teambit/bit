import { Aspect } from '@teambit/harmony';
import { PluginDefinition } from './plugin-definition';

export class Plugin {
  constructor(readonly def: PluginDefinition, readonly path: string) {}

  // consider adding a more abstract type here to allow users to ask for dependencies.
  private _instance: undefined | unknown;

  /**
   * determines whether the plugin supports a certain runtime.
   */
  supportsRuntime(runtime: string) {
    return this.def.runtimes.includes(runtime);
  }

  register(sourceAspect: Aspect) {
    const object = this.require();
    this.def.register<unknown>(object, sourceAspect);
  }

  require() {
    // eslint-disable-next-line global-require, import/no-dynamic-require
    this._instance = require(this.path).default;
    return this._instance;
  }
}
