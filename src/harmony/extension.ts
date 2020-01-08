import { ProviderFn } from './extension.provider';

export type ExtensionProps<Conf, Deps> = {
  name: string;
  // TODO: fix that type
  dependencies: any[];
  config: Conf;
  provider: ProviderFn<Conf, Deps>;
};

export default class Extension<Conf = {}, Deps = []> {
  constructor(
    readonly name: string,
    readonly dependencies: Deps,
    readonly config: Conf,
    readonly provider: ProviderFn<Conf, Deps>
  ) {}

  private _instance = null;

  get instance() {
    return this._instance;
  }

  async run(dependencies: any[]) {
    if (!this.instance) {
      // @ts-ignore TODO: doron please fix (:
      const instance = await this.provider(this.config, dependencies);
      this._instance = instance;
      return instance;
    }

    return Promise.resolve(this.instance);
  }

  static instantiate<Conf = {}, Deps = []>(props: ExtensionProps<Conf, Deps>): Extension<Conf, Deps> {
    return Object.assign(Object.create(Extension.prototype), props);
  }
}
