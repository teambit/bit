/** @flow */

import R from 'ramda';
import BaseExtension from './base-extension';
import Scope from '../scope/scope';
import type { BaseExtensionProps, BaseLoadArgsProps, BaseExtensionOptions, BaseExtensionModel } from './base-extension';
import BitId from '../bit-id/bit-id';
import ExtensionFile from './extension-file';
import type { ExtensionFileModel } from './extension-file';
import Repository from '../scope/repository';

type EnvType = 'Compiler' | 'Tester';

type EnvExtensionExtraProps = {
  envType: EnvType,
  files?: ExtensionFile[]
};

export type EnvExtensionOptions = BaseExtensionOptions;

export type EnvLoadArgsProps = BaseLoadArgsProps & EnvExtensionExtraProps;

export type EnvExtensionProps = BaseExtensionProps & EnvExtensionExtraProps;

export type EnvExtensionModel = BaseExtensionModel & {
  files: ExtensionFileModel[]
};
export default class EnvExtension extends BaseExtension {
  envType: EnvType;
  files: ExtensionFile[];

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

  constructor(extensionProps: EnvExtensionProps) {
    super(extensionProps);
    this.envType = extensionProps.envType;
    this.files = extensionProps.files;
  }

  async install(scope: Scope, opts: { verbose: boolean }) {
    const installOpts = { ids: [{ componentId: BitId.parse(this.name), type: this.envType.toLowerCase() }], ...opts };
    const installResult = await scope.installEnvironment(installOpts);
    this.setExtensionPathInScope(scope.getPath());
    this.reload();
    return installResult;
  }

  toModelObject(): EnvExtensionModel {
    const baseObject: BaseExtensionModel = super.toModelObject();
    const files = this.files.map(file => file.toModelObject());
    const modelObject = { files, ...baseObject };
    return modelObject;
  }

  /**
   * Loading from props (usually from bit.json)
   * @param {*} props
   */
  static async load(props: EnvLoadArgsProps): Promise<EnvExtensionProps> {
    const baseExtensionProps: BaseExtensionProps = await super.load(props);
    const files = await ExtensionFile.loadFromBitJsonObject(props.files, props.consumerPath);
    const envExtensionProps: EnvExtensionProps = { envType: props.envType, files, ...baseExtensionProps };
    return envExtensionProps;
  }

  static async loadFromModelObject(modelObject: EnvExtensionModel, repository: Repository): Promise<EnvExtensionProps> {
    const baseExtensionProps: BaseExtensionProps = super.loadFromModelObject(modelObject);
    let files = [];
    if (modelObject.files && !R.isEmpty(modelObject.files)) {
      const loadFilesP = modelObject.files.map(file => ExtensionFile.loadFromExtensionFileModel(file, repository));
      files = await Promise.all(loadFilesP);
    }
    const envExtensionProps: EnvExtensionProps = { envType: modelObject.envType, files, ...baseExtensionProps };
    return envExtensionProps;
  }
}
