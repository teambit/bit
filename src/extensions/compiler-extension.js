/** @flow */

import EnvExtension from './env-extension';
import BaseExtension from './base-extension';
import type { EnvExtensionProps, EnvLoadArgsProps, EnvExtensionOptions, EnvExtensionModel } from './env-extension';
import { Repository } from '../scope/objects';
import { Analytics } from '../analytics/analytics';

export type CompilerExtensionOptions = EnvExtensionOptions;
export type CompilerExtensionModel = EnvExtensionModel;
export const COMPILER_ENV_TYPE = 'compiler';

export default class CompilerExtension extends EnvExtension {
  constructor(extensionProps: EnvExtensionProps) {
    extensionProps.envType = COMPILER_ENV_TYPE;
    super(extensionProps);
    this.envType = extensionProps.envType;
  }

  toModelObject(): CompilerExtensionModel {
    Analytics.addBreadCrumb('compiler-extension', 'toModelObject');
    const envModelObject: EnvExtensionModel = super.toModelObject();
    const modelObject = { ...envModelObject };
    return modelObject;
  }

  /**
   * Write the env files to the file system according to the template dir
   * used for ejecting env for imported component
   * @param {*} param0
   */
  async writeFilesToFs({ configDir }: { configDir: string }): Promise<string> {
    Analytics.addBreadCrumb('compiler-extension', 'writeFilesToFs');
    return super.writeFilesToFs({ configDir, envType: this.envType });
  }

  /**
   * Loading from props (usually from bit.json)
   * @param {*} props
   */
  // $FlowFixMe
  static async load(props: EnvLoadArgsProps): Promise<CompilerExtension> {
    Analytics.addBreadCrumb('compiler-extension', 'load');
    props.envType = COMPILER_ENV_TYPE;
    // Throw error if compiler not loaded
    props.throws = true;
    const envExtensionProps: EnvExtensionProps = await super.load(props);
    const extension: CompilerExtension = new CompilerExtension(envExtensionProps);
    if (extension.loaded) {
      const throws = true;
      await extension.init(throws);
    }
    return extension;
  }

  static async loadFromModelObject(
    modelObject: string | CompilerExtensionModel,
    repository: Repository
    // $FlowFixMe
  ): Promise<?CompilerExtension> {
    Analytics.addBreadCrumb('compiler-extension', 'loadFromModelObject');
    if (!modelObject) return undefined;
    const actualObject =
      typeof modelObject === 'string'
        ? { envType: COMPILER_ENV_TYPE, ...BaseExtension.transformStringToModelObject(modelObject) }
        : { envType: COMPILER_ENV_TYPE, ...modelObject };
    const envExtensionProps: EnvExtensionProps = await super.loadFromModelObject(actualObject, repository);
    const extension: CompilerExtension = new CompilerExtension(envExtensionProps);
    return extension;
  }
}
