/** @flow */
import AbstractError from '../../error/abstract-error';

export default class ExtensionInvalidConfig extends AbstractError {
  configKey: string;
  configType: string;

  constructor(configKey: string, configType: string) {
    super();
    this.configKey = configKey;
    this.configType = configType;
  }
}
