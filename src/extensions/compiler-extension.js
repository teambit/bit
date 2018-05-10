/** @flow */

import EnvExtension from './env-extension';
import BaseExtension from './base-extension';
import type { EnvExtensionProps, EnvLoadArgsProps, EnvExtensionOptions, EnvExtensionModel } from './env-extension';
import { Repository } from '../scope/objects';
import ConsumerComponent from '../consumer/component';
import { COMPONENT_ORIGINS } from '../constants';
import ConsumerBitJson from '../consumer/bit-json/consumer-bit-json';
import ComponentBitJson from '../consumer/bit-json';
import type { ComponentOrigin } from '../consumer/bit-map/component-map';

export type CompilerExtensionOptions = EnvExtensionOptions;
export type CompilerExtensionModel = EnvExtensionModel;
export const CompilerEnvType = 'Compiler';

export default class CompilerExtension extends EnvExtension {
  constructor(extensionProps: EnvExtensionProps) {
    extensionProps.envType = CompilerEnvType;
    super(extensionProps);
    this.envType = extensionProps.envType;
  }

  toModelObject(): CompilerExtensionModel {
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
    return super.writeFilesToFs({ bitDir, ejectedEnvsDirectory, envType: this.envType });
  }

  /**
   * Loading from props (usually from bit.json)
   * @param {*} props
   */
  static async load(props: EnvLoadArgsProps): Promise<CompilerExtension> {
    props.envType = CompilerEnvType;
    const envExtensionProps: EnvExtensionProps = await super.load(props);
    const extension: CompilerExtension = new CompilerExtension(envExtensionProps);
    if (extension.loaded) {
      await extension.init();
    }
    return extension;
  }

  static async loadFromModelObject(
    modelObject: string | CompilerExtensionModel,
    repository: Repository
  ): Promise<?CompilerExtension> {
    if (!modelObject) return undefined;
    const actualObject =
      typeof modelObject === 'string'
        ? { envType: CompilerEnvType, ...BaseExtension.transformStringToModelObject(modelObject) }
        : { envType: CompilerEnvType, ...modelObject };
    const envExtensionProps: EnvExtensionProps = await super.loadFromModelObject(actualObject, repository);
    const extension: CompilerExtension = new CompilerExtension(envExtensionProps);
    return extension;
  }

  /**
   * Load the compiler from the correct place
   * If a component has a bit.json with compiler defined take it
   * Else if a component is not authored take if from the models
   * Else, for authored component check if the compiler has been changed
   *
   */
  static async loadFromCorrectSource({
    consumerPath,
    scopePath,
    componentOrigin,
    componentFromModel,
    consumerBitJson,
    componentBitJson,
    context
  }: {
    consumerPath: string,
    scopePath: string,
    componentOrigin: ComponentOrigin,
    componentFromModel: ConsumerComponent,
    consumerBitJson: ConsumerBitJson,
    componentBitJson: ?ComponentBitJson,
    context?: Object
  }): Promise<?CompilerExtension> {
    if (componentBitJson && componentBitJson.hasCompiler()) {
      return componentBitJson.loadCompiler(consumerPath, scopePath, context);
    }
    if (componentOrigin !== COMPONENT_ORIGINS.AUTHORED) {
      if (componentFromModel && componentFromModel.compiler) {
        return componentFromModel.compiler;
      }
      return undefined;
    }
    // TODO: Gilad - think about this case - if someone else imported the component
    // and changed the compiler
    // and the original project import the new version with the new compiler
    // we want to load if from the models and not from the bit.json
    if (consumerBitJson.hasCompiler()) {
      return consumerBitJson.loadCompiler(consumerPath, scopePath, context);
    }
    return undefined;
  }
}
