/** @flow */

import EnvExtension from './env-extension';
import BaseExtension from './base-extension';
import type { EnvExtensionProps, EnvLoadArgsProps, EnvExtensionOptions } from './env-extension';

export type CompilerExtensionOptions = EnvExtensionOptions;

export default class CompilerExtension extends EnvExtension {
  constructor(extensionProps: EnvExtensionProps) {
    extensionProps.envType = 'Compiler';
    super(extensionProps);
    this.envType = extensionProps.envType;
  }

  static async load(props: EnvLoadArgsProps): Promise<EnvExtensionProps> {
    props.envType = 'Compiler';
    const envExtensionProps: EnvExtensionProps = await super.load(props);
    const extension: CompilerExtension = new CompilerExtension(envExtensionProps);
    if (extension.loaded) {
      await extension.init();
    }
    return extension;
  }

  static loadFromModelObject(modelObject): EnvExtensionProps {
    let actualObject;
    if (typeof modelObject === 'string') {
      actualObject = BaseExtension.transformStringToModelObject(modelObject);
    } else {
      actualObject = { ...modelObject };
    }
    actualObject.envType = 'Compiler';
    const envExtensionProps: EnvExtensionProps = super.loadFromModelObject(actualObject);
    const extension: CompilerExtension = new CompilerExtension(envExtensionProps);
    return extension;
  }
}
