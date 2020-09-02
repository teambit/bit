import { TESTER_ENV_TYPE } from '../constants';
import EnvExtension from './env-extension';
import { EnvExtensionModel, EnvExtensionOptions, EnvExtensionProps } from './env-extension-types';

export type TesterExtensionOptions = EnvExtensionOptions;
export type TesterExtensionModel = EnvExtensionModel;

export default class TesterExtension extends EnvExtension {
  constructor(extensionProps: EnvExtensionProps) {
    extensionProps.envType = TESTER_ENV_TYPE;
    super(extensionProps);
    this.envType = extensionProps.envType;
  }

  toModelObject(): TesterExtensionModel {
    const envModelObject: EnvExtensionModel = super.toModelObject();
    const modelObject = { ...envModelObject };
    return modelObject;
  }
}
