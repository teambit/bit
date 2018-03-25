/** @flow */

import EnvExtension from './env-extension';
import type { EnvExtensionProps, EnvLoadArgsProps } from './env-extension';

export default class CompilerExtension extends EnvExtension {
  constructor(extensionProps: EnvExtensionProps) {
    extensionProps.envType = 'Compiler';
    super(extensionProps);
    this.envType = extensionProps.envType;
  }

  static async load(props: EnvLoadArgsProps): Promise<EnvExtensionProps> {
    const envExtensionProps: EnvExtensionProps = await super.load(props);
    const extension: CompilerExtension = new CompilerExtension(envExtensionProps);
    if (extension.loaded) {
      await extension.init();
    }
    return extension;
  }
}
