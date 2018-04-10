/** @flow */

import EnvExtension from './env-extension';
import BaseExtension from './base-extension';
import type { EnvExtensionProps, EnvLoadArgsProps, EnvExtensionOptions, EnvExtensionModel } from './env-extension';
import { Repository } from '../scope/objects';
import ConsumerComponent from '../consumer/component';
import { COMPONENT_ORIGINS } from '../constants';
import ConsumerBitJson from '../consumer/bit-json/consumer-bit-json';
import ComponentBitJson from '../consumer/bit-json';

export type CompilerExtensionOptions = EnvExtensionOptions;
export type CompilerExtensionModel = EnvExtensionModel;

export default class CompilerExtension extends EnvExtension {
  constructor(extensionProps: EnvExtensionProps) {
    extensionProps.envType = 'Compiler';
    super(extensionProps);
    this.envType = extensionProps.envType;
  }

  toModelObject(): CompilerExtensionModel {
    const envModelObject: EnvExtensionModel = super.toModelObject();
    const modelObject = { ...envModelObject };
    return modelObject;
  }

  /**
   * Loading from props (usually from bit.json)
   * @param {*} props
   */
  static async load(props: EnvLoadArgsProps): Promise<EnvExtensionProps> {
    props.envType = 'Compiler';
    const envExtensionProps: EnvExtensionProps = await super.load(props);
    const extension: CompilerExtension = new CompilerExtension(envExtensionProps);
    if (extension.loaded) {
      await extension.init();
    }
    return extension;
  }

  static async loadFromModelObject(
    modelObject: CompilerExtensionModel,
    repository: Repository
  ): Promise<CompilerExtension> {
    let actualObject;
    if (typeof modelObject === 'string') {
      actualObject = BaseExtension.transformStringToModelObject(modelObject);
    } else {
      actualObject = { ...modelObject };
    }
    actualObject.envType = 'Compiler';
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
  static async loadFromCorrectSource(
    consumerPath: string,
    scopePath: string,
    componentOrigin: string,
    componentFromModel: ConsumerComponent,
    consumerBitJson: ConsumerBitJson,
    componentBitJson: ?ComponentBitJson
  ): Promise<?CompilerExtension> {
    if (componentBitJson && componentBitJson.hasCompiler()) {
      return componentBitJson.loadCompiler(consumerPath, scopePath);
    }
    if (componentOrigin !== COMPONENT_ORIGINS.AUTHORED) {
      return componentFromModel.compiler;
    }
    // TODO: Gilad - think about this case - if someone else imported the component
    // and changed the compiler
    // and the original project import the new version with the new compiler
    // we want to load if from the models and not from the bit.json
    if (consumerBitJson.hasCompiler()) {
      return consumerBitJson.loadCompiler(consumerPath, scopePath);
    }
    return undefined;
  }
}
