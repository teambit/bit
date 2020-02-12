import { ProviderFn } from './types';
import Harmony from './harmony';
import { AnyExtension } from './index';

export type ExtensionProps<Conf> = {
  name: string;
  // TODO: changes from any to something meaningful
  dependencies: any[];
  config: Conf;
  provider: ProviderFn<Conf>;
};

/**
 * harmony's extension definition. this can be used to define and extend `Harmony` applications.
 */
export class Extension<Conf = {}> {
  constructor(
    /**
     * extension name.
     */
    readonly name: string,

    /**
     * list of extension dependencies which composed from references to `Extension` objects.
     */
    readonly dependencies: AnyExtension[],

    /**
     * default extension config. Can be from any type.
     */
    readonly config: Conf,

    /**
     * extension provider is a function of config, dependencies and an instance of `Harmony`
     * which returns the extension instance.
     */
    readonly provider: ProviderFn<Conf>
  ) {}

  private _instance = null;

  private _loaded = false;

  /**
   * returns the instance of the extension
   */
  get instance() {
    return this._instance;
  }

  /**
   * returns an indication of the extension already loaded (the provider run)
   * We don't rely on the instance since an extension provider might return null
   */
  get loaded() {
    return this._loaded;
  }

  /**
   * initiate Harmony in run-time.
   */
  async run<Conf>(dependencies: any[], harmony: Harmony<Conf>, config?: Conf) {
    if (!this.loaded) {
      // @ts-ignore TODO: doron please fix (:
      const instance = await this.provider(config || this.config, dependencies, harmony);
      this._instance = instance;
      this._loaded = true;
      return instance;
    }

    return Promise.resolve(this.instance);
  }

  static instantiate<Conf = {}, Deps = []>(props: ExtensionProps<Conf>): Extension<Conf> {
    return Object.assign(Object.create(Extension.prototype), props);
  }
}
