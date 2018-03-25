/** @flow */

import BaseExtension from './base-extension';
import type { BaseExtensionProps, BaseLoadArgsProps } from './base-extension';

type EnvType = 'Compiler' | 'Tester';

type EnvExtensionExtraProps = {
  envType: EnvType
};

export type EnvLoadArgsProps = BaseLoadArgsProps & EnvExtensionExtraProps;

export type EnvExtensionProps = BaseExtensionProps & EnvExtensionExtraProps;

export default class EnvExtension extends BaseExtension {
  envType: EnvType;

  constructor(extensionProps: EnvExtensionProps) {
    super(extensionProps);
    this.envType = extensionProps.envType;
  }

  static async load(props: EnvLoadArgsProps): Promise<EnvExtensionProps> {
    const baseExtensionProps: BaseExtensionProps = await super.load(props);
    const envExtensionProps: EnvExtensionProps = { envType: props.envType, ...baseExtensionProps };
    return envExtensionProps;
  }
}
