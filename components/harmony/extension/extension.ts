import { ProviderFn } from '../types';
import { Harmony } from '../harmony';
import { ExtensionManifest } from './extension-manifest';
import { ExtensionInstantiationException } from '../exceptions/extension-init-error';
import { RuntimeDefinition } from '../runtimes';

export type ExtensionProps = {
  name: string;
  // TODO: changes from any to something meaningful
  dependencies: any[];
  provider: ProviderFn;
};

/**
 * harmony's extension definition. this can be used to define and extend `Harmony` applications.
 */
export class Extension {
  constructor(
    /**
     * manifest of the extension.
     */
    readonly manifest: ExtensionManifest
  ) {}

  private _instance = null;

  private _loaded = false;

  /**
   * returns the instance of the extension
   */
  get instance() {
    return this._instance;
  }

  get name() {
    const metadata = Reflect.getMetadata('harmony:name', this.manifest);
    return metadata || this.manifest.id || this.manifest.name;
  }

  get id() {
    return this.name;
  }

  get dependencies(): Extension[] {
    const metadata = Reflect.getMetadata('harmony:dependencies', this.manifest);
    return metadata || this.manifest.dependencies || [];
  }

  get provider() {
    const metadata = Reflect.getMetadata('harmony:provider', this.manifest);
    return metadata || this.manifest.provider;
  }

  get files() {
    return this.manifest.files;
  }

  /**
   * returns an indication of the extension already loaded (the provider run)
   * We don't rely on the instance since an extension provider might return null
   */
  get loaded() {
    return this._loaded;
  }

  toString(): string {
    return JSON.stringify(this.name);
  }

  private buildSlotRegistries(slots: ((registerFn: () => void) => any)[], context: Harmony) {
    return slots.map((slot) => {
      return slot(() => {
        return context.current;
      });
    });
  }

  get declareRuntime() {
    return this.manifest.declareRuntime;
  }

  getRuntime(runtime: RuntimeDefinition) {
    return this.manifest.getRuntime(runtime);
  }

  getRuntimes() {
    return this.manifest.getRuntimes();
  }

  getSlots(extensionRuntime: any) {
    if (extensionRuntime.slots && extensionRuntime.slots.length) {
      return extensionRuntime.slots;
    }

    return this.manifest.slots || [];
  }

  getConfig(context: Harmony, extensionRuntime: any) {
    const defaultConfig = extensionRuntime.defaultConfig || this.manifest.defaultConfig || {};
    const config = context.config.get(this.name) || {};
    return Object.assign({}, defaultConfig, config);
  }

  /**
   * initiate Harmony in run-time.
   */
  async __run(dependencies: any[], context: Harmony, runtime: RuntimeDefinition) {
    const name = this.name;
    context.initExtension(name);
    const extensionRuntime = this.getRuntime(runtime);

    if (!extensionRuntime) {
      return undefined;
    }

    // @ts-ignore
    const registries = this.buildSlotRegistries(this.getSlots(extensionRuntime), context);
    const config = this.getConfig(context, extensionRuntime);

    if (!this.loaded) {
      console.log('extensionRuntime.provider', extensionRuntime.provider);
      if (extensionRuntime.provider)
        this._instance = await extensionRuntime.provider(dependencies, config, registries, context);
      else {
        try {
          // @ts-ignore
          this._instance = new extensionRuntime.manifest(...dependencies);
        } catch (err: any) {
          throw new ExtensionInstantiationException(err.toString());
        }
      }
      // @ts-ignore adding the extension ID to the instance.
      // this._instance.id = this.manifest.name;
      // @ts-ignore adding the extension ID to the instance.
      // this._instance.config = config;
      this._loaded = true;
      return this._instance;
    }

    context.endExtension();
    return Promise.resolve(this.instance);
  }
}
