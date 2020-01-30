import { merge } from 'lodash';
import { ExtensionConfig } from './extension-config';
import { RawMap } from './types';

export default class Config {
  constructor(readonly extensions: ExtensionConfig[]) {}

  static createExtensionConfig(rawObject: RawMap) {
    return Object.keys(rawObject).map((value, key) => {
      return ExtensionConfig.fromObject({
        name: value,
        config: rawObject[key]
      });
    });
  }

  static fromObject(object: RawMap, defaultExtensions: RawMap) {
    const rawObject = merge(object, defaultExtensions);

    return new Config(this.createExtensionConfig(rawObject));
  }
}
