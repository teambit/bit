import Harmony from './harmony';

export type ProviderFn<Conf = {}, Deps = []> = (config: Conf, deps: Deps, harmony: Harmony) => any;

export interface ProviderClass<Conf = {}, Deps = {}> {
  provide(config: Conf, deps: Deps): any;
}

export type ExtensionProvider<Conf = {}, Deps = {}> = {
  name: string | symbol;
  deps: [];
  provider: ProviderFn<Conf>;
};

export type constructor<T> = {
  new (...args: any[]): T;
};
