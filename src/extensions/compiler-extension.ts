import EnvExtension from './env-extension';
import { EnvExtensionProps, EnvExtensionOptions, EnvExtensionModel } from './env-extension-types';
import { COMPILER_ENV_TYPE } from '../constants';

export type CompilerExtensionOptions = EnvExtensionOptions;
export type CompilerExtensionModel = EnvExtensionModel;

export default class CompilerExtension extends EnvExtension {
  constructor(extensionProps: EnvExtensionProps) {
    extensionProps.envType = COMPILER_ENV_TYPE;
    super(extensionProps);
    this.envType = extensionProps.envType;
  }

  toModelObject(): CompilerExtensionModel {
    const envModelObject: EnvExtensionModel = super.toModelObject();
    const modelObject = { ...envModelObject };
    return modelObject;
  }
}
