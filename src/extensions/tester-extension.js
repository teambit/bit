/** @flow */

import EnvExtension from './env-extension';
import BaseExtension from './base-extension';
import type { EnvExtensionProps, EnvLoadArgsProps, EnvExtensionOptions, EnvExtensionModel } from './env-extension';
import { Repository } from '../scope/objects';
import { Analytics } from '../analytics/analytics';

export type TesterExtensionOptions = EnvExtensionOptions;
export type TesterExtensionModel = EnvExtensionModel;
export const TESTER_ENV_TYPE = 'tester';

export default class TesterExtension extends EnvExtension {
  constructor(extensionProps: EnvExtensionProps) {
    extensionProps.envType = TESTER_ENV_TYPE;
    super(extensionProps);
    this.envType = extensionProps.envType;
  }

  toModelObject(): TesterExtensionModel {
    Analytics.addBreadCrumb('tester-extension', 'toModelObject');
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
    Analytics.addBreadCrumb('tester-extension', 'writeFilesToFs');
    return super.writeFilesToFs({ configDir, envType: this.envType });
  }

  /**
   * Loading from props (usually from bit.json)
   * @param {*} props
   */
  static async load(props: EnvLoadArgsProps): Promise<EnvExtensionProps> {
    Analytics.addBreadCrumb('tester-extension', 'load');
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
    Analytics.addBreadCrumb('tester-extension', 'loadFromModelObject');
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
