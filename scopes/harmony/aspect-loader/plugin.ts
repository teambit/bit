import { realpathSync, existsSync } from 'fs';
import { Aspect } from '@teambit/harmony';
import { PluginDefinition } from './plugin-definition';

export class Plugin {
  constructor(
    readonly def: PluginDefinition,
    readonly path: string
  ) {}

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
    const mod = require(this.path);
    this._instance = mod.default as any;
    this._instance.__path = this.path;
    const exists = existsSync(this.path);
    // In case the path not exists we don't need to resolve it (it will throw an error)
    const realPath = exists ? realpathSync(this.path) : this.path;
    const resolvedPathFromRealPath = require.resolve(realPath);
    this._instance.__resolvedPath = resolvedPathFromRealPath;
    return this._instance;
  }
}
