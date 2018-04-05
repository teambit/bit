/** @flow */

import BaseExtension from './base-extension';
import Scope from '../scope/scope';
import type { BaseExtensionProps, BaseLoadArgsProps, BaseExtensionOptions } from './base-extension';

type EnvType = 'Compiler' | 'Tester';

type EnvExtensionExtraProps = {
  envType: EnvType
};

export type EnvExtensionOptions = BaseExtensionOptions;

export type EnvLoadArgsProps = BaseLoadArgsProps & EnvExtensionExtraProps;

export type EnvExtensionProps = BaseExtensionProps & EnvExtensionExtraProps;

export default class EnvExtension extends BaseExtension {
  envType: EnvType;

  constructor(extensionProps: EnvExtensionProps) {
    super(extensionProps);
    this.envType = extensionProps.envType;
  }

  install(scope: Scope, opts: { verbose: boolean }) {
    const installOpts = { ids: [this.name], type: this.envType.toLower(), ...opts };
    const installResult = scope.installEnvironment(installOpts);
    this.reload();
    return installResult;
  }

  /**
   * Return the play action
   */
  get play(): ?Function {
    if (this.script && this.script.play && typeof this.script.play === 'function') {
      return this.script.play;
    }
  }

  /**
   * return old actions (to support old compilers / testers which uses run / compile functions)
   */
  get oldAction(): ?Function {
    if (this.script && this.script.run && typeof this.script.run === 'function') {
      return this.script.run;
    }
    if (this.script && this.script.compile && typeof this.script.compile === 'function') {
      return this.script.compile;
    }
    return undefined;
  }

  static async load(props: EnvLoadArgsProps): Promise<EnvExtensionProps> {
    const baseExtensionProps: BaseExtensionProps = await super.load(props);
    const envExtensionProps: EnvExtensionProps = { envType: props.envType, ...baseExtensionProps };
    return envExtensionProps;
  }

  static loadFromModelObject(modelObject): EnvExtensionProps {
    const baseExtensionProps: BaseExtensionProps = super.loadFromModelObject(modelObject);
    const envExtensionProps: EnvExtensionProps = { envType: modelObject.envType, ...baseExtensionProps };
    return envExtensionProps;
  }
}
