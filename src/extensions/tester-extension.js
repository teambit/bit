/** @flow */

import EnvExtension from './env-extension';
import BaseExtension from './base-extension';
import type { EnvExtensionProps, EnvLoadArgsProps, EnvExtensionOptions, EnvExtensionModel } from './env-extension';
import { Repository } from '../scope/objects';
import logger from '../logger/logger';
import { TESTER_ENV_TYPE } from '../constants';

export type TesterExtensionOptions = EnvExtensionOptions;
export type TesterExtensionModel = EnvExtensionModel;

export default class TesterExtension extends EnvExtension {
  constructor(extensionProps: EnvExtensionProps) {
    extensionProps.envType = TESTER_ENV_TYPE;
    super(extensionProps);
    this.envType = extensionProps.envType;
  }

  toModelObject(): TesterExtensionModel {
    logger.debug('tester-extension', 'toModelObject');
    const envModelObject: EnvExtensionModel = super.toModelObject();
    const modelObject = { ...envModelObject };
    return modelObject;
  }

  /**
   * Loading from props (usually from bit.json)
   * @param {*} props
   */
  static async load(props: EnvLoadArgsProps): Promise<EnvExtensionProps> {
    logger.debug('tester-extension', 'load');
    props.envType = TESTER_ENV_TYPE;
    // Throw error if tester not loaded
    props.throws = true;
    const envExtensionProps: EnvExtensionProps = await super.load(props);
    const extension: TesterExtension = new TesterExtension(envExtensionProps);
    if (extension.loaded) {
      const throws = true;
      await extension.init(throws);
    }
    // $FlowFixMe
    return extension;
  }

  static async loadFromModelObject(
    modelObject: string | TesterExtensionModel,
    repository: Repository
    // $FlowFixMe
  ): Promise<?TesterExtension> {
    logger.debug('tester-extension', 'loadFromModelObject');
    if (!modelObject) return undefined;
    const actualObject =
      typeof modelObject === 'string'
        ? { envType: TESTER_ENV_TYPE, ...BaseExtension.transformStringToModelObject(modelObject) }
        : { envType: TESTER_ENV_TYPE, ...modelObject };
    const envExtensionProps: EnvExtensionProps = await super.loadFromModelObject(actualObject, repository);
    const extension: TesterExtension = new TesterExtension(envExtensionProps);
    return extension;
  }
}
