import { ProviderFn } from './types';
import Harmony from './harmony';
import { AnyExtension } from './types';

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
export default class Extension<Conf = {}> {
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

  /**
   * returns the instance of the extension
   */
  get instance() {
    return this._instance;
  }

  /**
   * initiate Harmony in run-time.
   */
  async run(dependencies: any[], harmony: Harmony) {
    if (!this.instance) {
      // @ts-ignore TODO: doron please fix (:
      const instance = await this.provider(this.config, dependencies, harmony);
      this._instance = instance;
      return instance;
    }

    return Promise.resolve(this.instance);
  }

  static instantiate<Conf = {}, Deps = []>(props: ExtensionProps<Conf>): Extension<Conf> {
    return Object.assign(Object.create(Extension.prototype), props);
  }
}
