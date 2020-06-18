import EnvExtension from './env-extension';
import { EnvExtensionProps, EnvExtensionOptions, EnvExtensionModel } from './env-extension-types';
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
    const envModelObject: EnvExtensionModel = super.toModelObject();
    const modelObject = { ...envModelObject };
    return modelObject;
  }
}
