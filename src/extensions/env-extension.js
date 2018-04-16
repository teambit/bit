/** @flow */

import path from 'path';
import R from 'ramda';
import format from 'string-format';
import BaseExtension from './base-extension';
import Scope from '../scope/scope';
import type { BaseExtensionProps, BaseLoadArgsProps, BaseExtensionOptions, BaseExtensionModel } from './base-extension';
import { CompilerEnvType } from './compiler-extension';
import { TesterEnvType } from './tester-extension';
import BitId from '../bit-id/bit-id';
import ExtensionFile from './extension-file';
import type { ExtensionFileModel } from './extension-file';
import Repository from '../scope/repository';
import { pathJoinLinux } from '../utils';

// Couldn't find a good way to do this with consts
// see https://github.com/facebook/flow/issues/627
// I would expect something like:
// type EnvType = CompilerEnvType | TesterEnvType would work
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
   * Return the action
   */
  get action(): ?Function {
    if (this.script && this.script.action && typeof this.script.action === 'function') {
      return this.script.action;
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
    // Skip the installation in case of using specific file
    // options.file usually used for develop your extension
    if (this.options.file) {
      return;
    }
    const installOpts = { ids: [{ componentId: BitId.parse(this.name), type: this.envType.toLowerCase() }], ...opts };
    const installResult = await scope.installEnvironment(installOpts);
    this.setExtensionPathInScope(scope.getPath());
    await this.reload();
    return installResult;
  }

  toModelObject(): EnvExtensionModel {
    const baseObject: BaseExtensionModel = super.toModelObject();
    const files = this.files.map(file => file.toModelObject());
    const modelObject = { files, ...baseObject };
    return modelObject;
  }

  // TODO: Gilad - change the return type
  toBitJsonObject(ejectedCompilerDirectory: string): Compilers {
    const files = {};
    this.files.forEach((file) => {
      const relativePath = pathJoinLinux(ejectedCompilerDirectory, file.name);
      files[file.name] = `./${relativePath}`;
    });
    const envVal = {
      rawConfig: this.dynamicConfig,
      options: this.options,
      files
    };
    return {
      [this.name]: envVal
    };
  }

  /**
   * Write the env files to the file system according to the template dir
   * used for ejecting env for imported component
   * @param {*} param0
   */
  async writeFilesToFs({
    bitDir,
    ejectedEnvsDirectory,
    envType
  }: {
    bitDir: string,
    ejectedEnvsDirectory: string,
    envType: EnvType
  }): Promise<string> {
    const resolvedEjectedEnvsDirectory = format(ejectedEnvsDirectory, { envType });
    const newBase = path.join(bitDir, resolvedEjectedEnvsDirectory);
    const writeP = this.files.map((file) => {
      file.updatePaths({ newBase, newRelative: file.name });
      return file.write();
    });
    await Promise.all(writeP);
    return resolvedEjectedEnvsDirectory;
  }

  /**
   * Loading from props (usually from bit.json)
   * @param {*} props
   */
  static async load(props: EnvLoadArgsProps): Promise<EnvExtensionProps> {
    const baseExtensionProps: BaseExtensionProps = await super.load(props);
    const files = await ExtensionFile.loadFromBitJsonObject(props.files, props.consumerPath, props.bitJsonPath);
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
