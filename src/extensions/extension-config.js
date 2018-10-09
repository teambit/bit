/** @flow */

import R from 'ramda';

const bitConfigPrefix = '__';

export type ExtensionOptions = {
  core?: boolean,
  disabled?: boolean
};

export default class ExtensionConfig {
  // Config as defined in bit.json.
  // might contain:
  // * bit configs - like disabled
  // * extension configs - like reporter
  // * files decelerations - like .babelrc path
  _rawConfig: ?Object;
  // Configs of the extension relevant to bit (like disabled)
  _bitConfig: ?ExtensionOptions;
  // The raw config we passed to the extension itself
  _extensionRawConfig: ?Object;
  // The config we got back from the getConfig of the extension (same as raw by default)
  _extensionDynamicConfig: ?Object;

  constructor({
    rawConfig,
    bitConfig,
    extensionRawConfig,
    extensionDynamicConfig
  }: {
    rawConfig?: ?Object,
    bitConfig?: ?Object,
    extensionRawConfig?: ?Object,
    extensionDynamicConfig?: ?Object
  }) {
    this._rawConfig = rawConfig;
    this._bitConfig = bitConfig;
    this._extensionRawConfig = extensionRawConfig;
    this._extensionDynamicConfig = extensionDynamicConfig;
  }

  get extensionRawConfig() {
    const conf = this._extensionRawConfig;
    if (conf) {
      return conf;
    }
    if (this._rawConfig) {
      this._extensionRawConfig = _getExtensionConfigFromRaw(this._rawConfig);
      return this._extensionRawConfig;
    }
    return {};
  }

  get extensionDynamicConfig() {
    return this._extensionDynamicConfig || this.extensionRawConfig;
  }

  set extensionDynamicConfig(config: Object) {
    this._extensionDynamicConfig = config;
  }

  get bitConfig() {
    const conf = this._bitConfig;
    if (conf) {
      return conf;
    }
    if (this._rawConfig) {
      this._bitConfig = _getBitConfigFromRaw(this._rawConfig);
      return this._bitConfig;
    }
    return {};
  }

  get disabled() {
    return this._bitConfig && this._bitConfig.disabled;
  }

  get core() {
    return this._bitConfig && this._bitConfig.core;
  }

  static fromRawConfig(rawConfig: Object): ExtensionConfig {
    const bitConfig = _getBitConfigFromRaw(rawConfig);
    const extensionRawConfig = _getExtensionConfigFromRaw(rawConfig);
    const extensionConfig = new ExtensionConfig({ rawConfig, bitConfig, extensionRawConfig });
    return extensionConfig;
  }

  static fromModels(config: Object): ExtensionConfig {}

  toBitJsonObject() {
    return {
      ...this.extensionRawConfig,
      ...this.bitConfig
    };
  }
}

const _isKeyStartsWithSignWrapper = sign => (val, key) => key.startWith(sign);
const _isKeyNotStartsWithSignWrapper = sign => (val, key) => !key.startWith(sign);

const _getBitConfigFromRaw = (rawConfig: Object): Object => {
  return R.pickBy(_isKeyStartsWithSignWrapper(bitConfigPrefix), rawConfig);
};

const _getExtensionConfigFromRaw = (rawConfig: Object): Object => {
  return R.pickBy(_isKeyNotStartsWithSignWrapper(bitConfigPrefix), rawConfig);
};
