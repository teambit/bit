/** @flow */

import R from 'ramda';
import path from 'path';
import format from 'string-format';
import BaseExtension from './base-extension';
import type Scope from '../scope/scope';
import type { BaseExtensionProps, BaseLoadArgsProps, BaseExtensionOptions, BaseExtensionModel } from './base-extension';
import BitId from '../bit-id/bit-id';
import ExtensionFile from './extension-file';
import type { ExtensionFileModel, ExtensionFileSerializedModel } from './extension-file';
import { Repository } from '../scope/objects';
import { pathJoinLinux } from '../utils';
import removeFilesAndEmptyDirsRecursively from '../utils/fs/remove-files-and-empty-dirs-recursively';
import type { PathOsBased } from '../utils/path';
import type { EnvExtensionObject } from '../consumer/bit-json/abstract-bit-json';
import { ComponentWithDependencies } from '../scope';
import { Analytics } from '../analytics/analytics';
import ExtensionGetDynamicPackagesError from './exceptions/extension-get-dynamic-packages-error';
import type CompilerExtension from './compiler-extension';
import type TesterExtension from './tester-extension';
import { COMPONENT_ORIGINS, COMPILER_ENV_TYPE, TESTER_ENV_TYPE } from '../constants';
import type { ComponentOrigin } from '../consumer/bit-map/component-map';
import type ConsumerComponent from '../consumer/component';
import type ConsumerBitJson from '../consumer/bit-json/consumer-bit-json';
import type ComponentBitJson from '../consumer/bit-json';
import logger from '../logger/logger';
import { Dependencies } from '../consumer/component/dependencies';
import ConfigDir from '../consumer/bit-map/config-dir';
import ExtensionGetDynamicConfigError from './exceptions/extension-get-dynamic-config-error';
import installExtensions from '../scope/extensions/install-extensions';
import DataToPersist from '../consumer/component/sources/data-to-persist';
import RemovePath from '../consumer/component/sources/remove-path';
import type Consumer from '../consumer/consumer';

// Couldn't find a good way to do this with consts
// see https://github.com/facebook/flow/issues/627
// I would expect something like:
// type EnvType = CompilerEnvType | TesterEnvType would work
export type EnvType = 'compiler' | 'tester';

type EnvExtensionExtraProps = {
  envType: EnvType,
  dynamicPackageDependencies?: ?Object
};

export type EnvExtensionOptions = BaseExtensionOptions;

export type EnvLoadArgsProps = BaseLoadArgsProps &
  EnvExtensionExtraProps & {
    bitJsonPath: PathOsBased,
    files: string[]
  };

export type EnvExtensionProps = BaseExtensionProps & EnvExtensionExtraProps & { files: ExtensionFile[] };

export type EnvExtensionModel = BaseExtensionModel & {
  files?: ExtensionFileModel[]
};
export type EnvExtensionSerializedModel = BaseExtensionModel & {
  files?: ExtensionFileSerializedModel[]
};

export default class EnvExtension extends BaseExtension {
  envType: EnvType;
  dynamicPackageDependencies: ?Object;
  files: ExtensionFile[];
  dataToPersist: DataToPersist;

  /**
   * Return the action
   */
  get action(): ?Function {
    if (this.script && this.script.action && typeof this.script.action === 'function') {
      return this.script.action;
    }
    return undefined;
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
    this.dynamicPackageDependencies = extensionProps.dynamicPackageDependencies;
    this.files = extensionProps.files;
  }

  async install(scope: Scope, opts: { verbose: boolean }, context?: Object): Promise<?(ComponentWithDependencies[])> {
    Analytics.addBreadCrumb('env-extension', 'install env extension');
    logger.debug('env-extension - install env extension');

    // Skip the installation in case of using specific file
    // options.file usually used for develop your extension
    if (this.options.file) {
      return undefined;
    }
    const dependentId = R.path(['dependentId'], context);
    const installOpts = {
      ids: [{ componentId: BitId.parse(this.name, true), type: this.envType.toLowerCase() }], // @todo: make sure it always has a scope name
      dependentId,
      scope,
      ...opts
    };
    const installResult = await installExtensions(installOpts);
    this.setExtensionPathInScope(scope.getPath());
    await this.reload(scope.getPath(), context);
    return installResult;
  }

  toModelObject(): EnvExtensionModel {
    logger.debug('env-extension', 'toModelObject');
    const baseObject: BaseExtensionModel = super.toModelObject();
    const files = this.files.map(file => file.toModelObject());
    const modelObject = { files, ...baseObject };
    return modelObject;
  }

  toObject(): Object {
    logger.debug('env-extension', 'toObject');
    const baseObject: Object = super.toObject();
    const files = this.files;
    const object = { ...baseObject, files };
    return object;
  }

  /**
   * Get a bit.json representation of the env instance
   * @param {string} ejectedEnvDirectory - The base path of where the env config files are stored
   * $FlowFixMe seems to be an issue opened for this https://github.com/facebook/flow/issues/4953
   */
  toBitJsonObject(ejectedEnvDirectory: string): { [string]: EnvExtensionObject } {
    logger.debug('env-extension', 'toBitJsonObject');
    const files = {};
    this.files.forEach((file) => {
      const relativePath = pathJoinLinux(ejectedEnvDirectory, file.relative);
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

  populateDataToPersist({
    configDir,
    envType,
    deleteOldFiles,
    consumer,
    verbose = false
  }: {
    configDir: string,
    envType: EnvType,
    deleteOldFiles: boolean,
    consumer: ?Consumer,
    verbose: boolean
  }): Promise<string> {
    const resolvedEjectedEnvsDirectory = format(configDir, { ENV_TYPE: envType });
    const filePathsToRemove = [];

    this.files.forEach((file) => {
      if (deleteOldFiles) {
        const pathToDelete = consumer ? consumer.getPathRelativeToConsumer(file.path) : file.path;
        filePathsToRemove.push(pathToDelete);
      }
      file.updatePaths({ newBase: resolvedEjectedEnvsDirectory, newRelative: file.relative });
      file.verbose = verbose;
    });
    this.dataToPersist = new DataToPersist();
    this.files.forEach((file) => {
      const cloned = file.clone();
      cloned.verbose = verbose;
      this.dataToPersist.addFile(cloned);
    });
    filePathsToRemove.map(file => this.dataToPersist.removePath(new RemovePath(file, true)));
    return resolvedEjectedEnvsDirectory;
  }

  /**
   * Delete env files from file system
   */
  async removeFilesFromFs(
    dependencies: Dependencies,
    configDir: ConfigDir,
    envType: EnvType,
    consumerPath: PathOsBased
  ): Promise<boolean> {
    Analytics.addBreadCrumb('env-extension', 'removeFilesFromFs');
    const filePaths = this.files.map(file => file.path);
    const relativeSourcePaths = dependencies.getSourcesPaths();
    if (!this.context) throw new Error('env-extension.removeFilesFromFs, this.context is missing');
    const componentDir = this.context.componentDir;
    const configDirResolved = configDir.getResolved({ componentDir, envType });
    const configDirPath = configDirResolved.dirPath;
    const absoluteEnvsDirectory = path.isAbsolute(configDirPath)
      ? configDirPath
      : path.join(consumerPath, configDirPath);
    const linkPaths = relativeSourcePaths.map(relativePath => path.join(absoluteEnvsDirectory, relativePath));
    return removeFilesAndEmptyDirsRecursively([...filePaths, ...linkPaths]);
  }

  async reload(scopePath: string, context?: Object): Promise<void> {
    logger.debug('env-extension', 'reload');
    if (context) {
      this.context = context;
    }
    const throws = true;
    await super.reload(scopePath, { throws });
    // $FlowFixMe
    const dynamicPackageDependencies = EnvExtension.loadDynamicPackageDependencies(this);
    this.dynamicPackageDependencies = dynamicPackageDependencies;
  }

  /**
   * Loading from props (usually from bit.json)
   * @param {*} props
   * $FlowFixMe seems to be an issue opened for this https://github.com/facebook/flow/issues/4953
   */
  static async load(props: EnvLoadArgsProps): Promise<EnvExtensionProps> {
    logger.debug('env-extension', 'load');
    const baseExtensionProps: BaseExtensionProps = await super.load(props);
    // $FlowFixMe
    const files = await ExtensionFile.loadFromBitJsonObject(
      // $FlowFixMe
      props.files, // $FlowFixMe
      props.consumerPath,
      props.bitJsonPath,
      props.envType
    );
    const envExtensionProps: EnvExtensionProps = { envType: props.envType, files, ...baseExtensionProps };
    const dynamicPackageDependencies = EnvExtension.loadDynamicPackageDependencies(envExtensionProps);
    envExtensionProps.dynamicPackageDependencies = dynamicPackageDependencies;
    const dynamicConfig = EnvExtension.loadDynamicConfig(envExtensionProps);
    // $FlowFixMe
    envExtensionProps.dynamicConfig = dynamicConfig;
    return envExtensionProps;
  }

  static loadDynamicPackageDependencies(envExtensionProps: EnvExtensionProps): ?Object {
    logger.debug('env-extension', 'loadDynamicPackageDependencies');
    const getDynamicPackageDependencies = R.path(['script', 'getDynamicPackageDependencies'], envExtensionProps);
    if (getDynamicPackageDependencies && typeof getDynamicPackageDependencies === 'function') {
      try {
        const dynamicPackageDependencies = getDynamicPackageDependencies({
          rawConfig: envExtensionProps.rawConfig,
          dynamicConfig: envExtensionProps.dynamicConfig,
          configFiles: envExtensionProps.files,
          context: envExtensionProps.context
        });
        return dynamicPackageDependencies;
      } catch (err) {
        throw new ExtensionGetDynamicPackagesError(err, envExtensionProps.name);
      }
    }
    return undefined;
  }

  // $FlowFixMe
  static loadDynamicConfig(envExtensionProps: EnvExtensionProps): ?Object {
    logger.debug('env-extension', 'loadDynamicConfig');
    const getDynamicConfig = R.path(['script', 'getDynamicConfig'], envExtensionProps);
    if (getDynamicConfig && typeof getDynamicConfig === 'function') {
      try {
        const dynamicConfig = getDynamicConfig({
          rawConfig: envExtensionProps.rawConfig,
          configFiles: envExtensionProps.files,
          context: envExtensionProps.context
        });
        return dynamicConfig;
      } catch (err) {
        throw new ExtensionGetDynamicConfigError(err, envExtensionProps.name);
      }
    }
    return undefined;
  }

  /**
   * $FlowFixMe seems to be an issue opened for this https://github.com/facebook/flow/issues/4953
   */
  static async loadFromModelObject(
    // $FlowFixMe
    modelObject: EnvExtensionModel & { envType: EnvType },
    repository: Repository
  ): Promise<EnvExtensionProps> {
    logger.debug('env-extension', 'loadFromModelObject');
    // $FlowFixMe
    const baseExtensionProps: BaseExtensionProps = super.loadFromModelObject(modelObject);
    let files = [];
    if (modelObject.files && !R.isEmpty(modelObject.files)) {
      const loadFilesP = modelObject.files.map(file => ExtensionFile.loadFromExtensionFileModel(file, repository));
      files = await Promise.all(loadFilesP);
    }
    const envExtensionProps: EnvExtensionProps = { envType: modelObject.envType, files, ...baseExtensionProps };
    return envExtensionProps;
  }

  static async loadFromSerializedModelObject(
    modelObject: EnvExtensionSerializedModel & { envType: EnvType }
  ): Promise<EnvExtensionProps> {
    logger.debug('env-extension', 'loadFromModelObject');
    // $FlowFixMe
    const baseExtensionProps: BaseExtensionProps = super.loadFromModelObject(modelObject);
    let files = [];
    if (modelObject.files && !R.isEmpty(modelObject.files)) {
      const loadFilesP = modelObject.files.map(file => ExtensionFile.loadFromExtensionFileSerializedModel(file));
      files = await Promise.all(loadFilesP);
    }
    const envExtensionProps: EnvExtensionProps = { envType: modelObject.envType, files, ...baseExtensionProps };
    return envExtensionProps;
  }

  /**
   * Load the compiler / tester from the correct place
   * This take into account the component origin (authored / imported)
   * And the detach status of the env
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
    detached,
    envType,
    context
  }: {
    consumerPath: string,
    scopePath: string,
    componentOrigin: ComponentOrigin,
    componentFromModel: ConsumerComponent,
    consumerBitJson: ConsumerBitJson,
    componentBitJson: ?ComponentBitJson,
    detached: ?boolean,
    envType: EnvType,
    context?: Object
  }): Promise<?CompilerExtension | ?TesterExtension> {
    logger.debug('env-extension', `(${envType}) loadFromCorrectSource`);

    // Authored component
    if (componentOrigin === COMPONENT_ORIGINS.AUTHORED) {
      // The component is not detached - load from the consumer bit.json
      if (!detached) {
        return loadFromBitJson({ bitJson: consumerBitJson, envType, consumerPath, scopePath, context });
      }
      // The component is detached - load from the component bit.json or from the models
      return loadFromComponentBitJsonOrFromModel({
        modelComponent: componentFromModel,
        componentBitJson,
        envType,
        consumerPath,
        scopePath,
        context
      });
    }

    // Not authored components
    // The component is attached - load from the consumer bit.json
    // This is in purpose checking false not a falsy. since by default is undefined which is different from false.
    if (detached === false) {
      return loadFromBitJson({ bitJson: consumerBitJson, envType, consumerPath, scopePath, context });
    }
    return loadFromComponentBitJsonOrFromModel({
      modelComponent: componentFromModel,
      componentBitJson,
      envType,
      consumerPath,
      scopePath,
      context
    });
  }
}

const loadFromBitJson = ({
  bitJson,
  envType,
  consumerPath,
  scopePath,
  context
}): Promise<?CompilerExtension | ?TesterExtension> => {
  logger.debug(`env-extension (${envType}) loadFromBitJson`);
  if (envType === COMPILER_ENV_TYPE) {
    return bitJson.loadCompiler(consumerPath, scopePath, context);
  }
  return bitJson.loadTester(consumerPath, scopePath, context);
};

const loadFromComponentBitJsonOrFromModel = async ({
  modelComponent,
  componentBitJson,
  envType,
  consumerPath,
  scopePath,
  context
}: {
  modelComponent: ConsumerComponent,
  componentBitJson: ?ComponentBitJson,
  envType: EnvType,
  consumerPath: string,
  scopePath: string,
  context?: Object
}): Promise<?CompilerExtension | ?TesterExtension> => {
  logger.debug(`env-extension (${envType}) loadFromComponentBitJsonOrFromModel`);
  if (componentBitJson) {
    return loadFromBitJson({ bitJson: componentBitJson, envType, consumerPath, scopePath, context });
  }
  logger.debug(`env-extension (${envType}) loadFromComponentBitJsonOrFromModel. loading from the model`);
  if (envType === COMPILER_ENV_TYPE) {
    return modelComponent ? modelComponent.compiler : undefined;
  }
  if (envType === TESTER_ENV_TYPE) {
    return modelComponent ? modelComponent.tester : undefined;
  }

  return undefined;
};
