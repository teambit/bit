/** @flow */

import EnvExtension from './env-extension';
import BaseExtension from './base-extension';
import type { EnvExtensionProps, EnvLoadArgsProps, EnvExtensionOptions, EnvExtensionModel } from './env-extension';
import { Repository } from '../scope/objects';
import ConsumerComponent from '../consumer/component';
import { COMPONENT_ORIGINS } from '../constants';
import ConsumerBitJson from '../consumer/bit-json/consumer-bit-json';
import ComponentBitJson from '../consumer/bit-json';
import { Analytics } from '../analytics/analytics';

export type TesterExtensionOptions = EnvExtensionOptions;
export type TesterExtensionModel = EnvExtensionModel;
export const TesterEnvType = 'Tester';

export default class TesterExtension extends EnvExtension {
  constructor(extensionProps: EnvExtensionProps) {
    extensionProps.envType = TesterEnvType;
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
  async writeFilesToFs({
    bitDir,
    ejectedEnvsDirectory
  }: {
    bitDir: string,
    ejectedEnvsDirectory: string
  }): Promise<string> {
    Analytics.addBreadCrumb('tester-extension', 'writeFilesToFs');
    return super.writeFilesToFs({ bitDir, ejectedEnvsDirectory, envType: this.envType });
  }

  /**
   * Loading from props (usually from bit.json)
   * @param {*} props
   */
  static async load(props: EnvLoadArgsProps): Promise<EnvExtensionProps> {
    Analytics.addBreadCrumb('tester-extension', 'load');
    props.envType = TesterEnvType;
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
        ? { envType: TesterEnvType, ...BaseExtension.transformStringToModelObject(modelObject) }
        : { envType: TesterEnvType, ...modelObject };
    const envExtensionProps: EnvExtensionProps = await super.loadFromModelObject(actualObject, repository);
    const extension: TesterExtension = new TesterExtension(envExtensionProps);
    return extension;
  }

  /**
   * Load the tester from the correct place
   * If a component has a bit.json with tester defined take it
   * Else if a component is not authored take if from the models
   * Else, for authored component check if the tester has been changed
   *
   */
  static async loadFromCorrectSource({
    consumerPath,
    scopePath,
    componentOrigin,
    componentFromModel,
    consumerBitJson,
    componentBitJson
  }: {
    consumerPath: string,
    scopePath: string,
    componentOrigin: string,
    componentFromModel: ConsumerComponent,
    consumerBitJson: ConsumerBitJson,
    componentBitJson: ?ComponentBitJson
  }): Promise<?TesterExtension> {
    Analytics.addBreadCrumb('tester-extension', 'loadFromCorrectSource');
    if (componentBitJson) {
      if (componentBitJson.hasTester()) {
        // $FlowFixMe
        return componentBitJson.loadTester(consumerPath, scopePath);
      }
      return undefined;
    }
    if (componentOrigin !== COMPONENT_ORIGINS.AUTHORED) {
      if (componentFromModel && componentFromModel.tester) {
        return componentFromModel.tester;
      }
      return undefined;
    }
    // TODO: Gilad - think about this case - if someone else imported the component
    // and changed the tester
    // and the original project import the new version with the new tester
    // we want to load if from the models and not from the bit.json
    if (consumerBitJson.hasTester()) {
      // $FlowFixMe
      return consumerBitJson.loadTester(consumerPath, scopePath);
    }
    return undefined;
  }
}
