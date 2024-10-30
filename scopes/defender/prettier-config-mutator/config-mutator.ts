import { cloneDeep } from 'lodash';
import { Options as PrettierOptions, Plugin } from 'prettier';

export type PrettierConfigTransformContext = {
  check: boolean;
};

export type PrettierConfigTransformer = (
  config: PrettierConfigMutator,
  context: PrettierConfigTransformContext
) => PrettierConfigMutator;

export class PrettierConfigMutator {
  constructor(public raw: PrettierOptions) {}

  clone(): PrettierConfigMutator {
    return new PrettierConfigMutator(cloneDeep(this.raw));
  }

  setKey(key: string, value: any) {
    this.raw[key] = value;
    return this;
  }

  addPlugin(plugin: Plugin | string) {
    if (!this.raw.plugins) {
      this.raw.plugins = [];
    }
    this.raw.plugins.push(plugin);
    return this;
  }
}
