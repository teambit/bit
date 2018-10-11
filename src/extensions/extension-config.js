/** @flow */

import R from 'ramda';
import * as Types from './types';
import ExtensionPropTypes from './extension-prop-types';
import type { DefaultProps, PropsSchema } from './extension-prop-types';

const ExtensionPropTypesIsntance = new ExtensionPropTypes({ types: Types });
const bitConfigPrefix = '__';

export type ExtensionOptions = {
  core?: boolean,
  disabled?: boolean
};

export default class ExtensionConfig {
  // Config as defined in bit.json.
  // might contain:
  // * bit configs - like disabled
  // * extension configs - like reporter or files
  _rawConfig: ?Object;
  // Configs of the extension relevant to bit (like disabled)
  _bitConfig: ?ExtensionOptions;
  rawProps: ?Object;
  props: ?Object;

  constructor({
    rawConfig,
    bitConfig,
    rawProps,
    props
  }: {
    rawConfig?: ?Object,
    bitConfig?: ?Object,
    rawProps?: ?Object,
    props?: ?Object
  }) {
    this._rawConfig = rawConfig;
    this._bitConfig = bitConfig;
    this.rawProps = rawProps;
    this.props = props || undefined;
  }

  // get extensionRawConfig() {
  //   const conf = this._extensionRawConfig;
  //   if (conf) {
  //     return conf;
  //   }
  //   if (this._rawConfig) {
  //     this._extensionRawConfig = _getExtensionConfigFromRaw(this._rawConfig);
  //     return this._extensionRawConfig;
  //   }
  //   return {};
  // }

  // get extensionDynamicConfig() {
  //   return this._extensionDynamicConfig || this.extensionRawConfig;
  // }

  // set extensionDynamicConfig(config: Object) {
  //   this._extensionDynamicConfig = config;
  // }

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

  static fromRawConfig(rawConfig: Object): ExtensionConfig {
    const bitConfig = _getBitConfigFromRaw(rawConfig);
    const rawProps = _getRawPropsFromRawConfig(rawConfig);
    const extensionConfig = new ExtensionConfig({ rawConfig, bitConfig, rawProps });
    return extensionConfig;
  }

  static fromModels(config: Object): ExtensionConfig {}

  loadProps(propsSchema: PropsSchema, defaultProps: DefaultProps) {
    const props = _getPropsFromRaw(this.rawProps, propsSchema, defaultProps);
    this.props = props;
  }

  toBitJsonObject() {
    return {
      ...this.extensionRawConfig,
      ...this.bitConfig
    };
  }
}

const _isKeyStartsWithSignWrapper = sign => (val, key) => key.startsWith(sign);
const _isKeyNotStartsWithSignWrapper = sign => (val, key) => !key.startsWith(sign);

const _getBitConfigFromRaw = (rawConfig: Object): Object => {
  return R.pickBy(_isKeyStartsWithSignWrapper(bitConfigPrefix), rawConfig);
};

const _getRawPropsFromRawConfig = (rawConfig: Object): Object => {
  const rawProps = R.pickBy(_isKeyNotStartsWithSignWrapper(bitConfigPrefix), rawConfig);
  return rawProps;
};

const _getPropsFromRaw = (rawProps: Object, propsSchema: PropsSchema, defaultProps: DefaultProps): Object => {
  const props = ExtensionPropTypesIsntance.parseRaw(rawProps, propsSchema, defaultProps);
  return props;
};
