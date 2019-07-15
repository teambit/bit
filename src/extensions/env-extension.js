/** @flow */

import R from 'ramda';
import path from 'path';
import format from 'string-format';
import BaseExtension from './base-extension';
import type Scope from '../scope/scope';
import type {
  EnvType,
  EnvLoadArgsProps,
  EnvExtensionProps,
  EnvExtensionModel,
  EnvExtensionSerializedModel
} from './env-extension-types';
import type { BaseExtensionProps, BaseExtensionModel } from './base-extension';
import BitId from '../bit-id/bit-id';
import ExtensionFile from './extension-file';
import { Repository } from '../scope/objects';
import { pathJoinLinux, sortObject, sha1 } from '../utils';
import removeFilesAndEmptyDirsRecursively from '../utils/fs/remove-files-and-empty-dirs-recursively';
import type { PathOsBased } from '../utils/path';
import type { EnvExtensionObject } from '../consumer/config/abstract-config';
import { ComponentWithDependencies } from '../scope';
import { Analytics } from '../analytics/analytics';
import ExtensionGetDynamicPackagesError from './exceptions/extension-get-dynamic-packages-error';
import { COMPONENT_ORIGINS, MANUALLY_REMOVE_ENVIRONMENT } from '../constants';
import type { ComponentOrigin } from '../consumer/bit-map/component-map';
import type ConsumerComponent from '../consumer/component';
import type WorkspaceConfig from '../consumer/config/workspace-config';
import type ComponentConfig from '../consumer/config';
import logger from '../logger/logger';
import { Dependencies } from '../consumer/component/dependencies';
import ConfigDir from '../consumer/bit-map/config-dir';
import ExtensionGetDynamicConfigError from './exceptions/extension-get-dynamic-config-error';
import installExtensions from '../scope/extensions/install-extensions';
import DataToPersist from '../consumer/component/sources/data-to-persist';
import RemovePath from '../consumer/component/sources/remove-path';
import type Consumer from '../consumer/consumer';
import type { ConsumerOverridesOfComponent } from '../consumer/config/consumer-overrides';
import AbstractConfig from '../consumer/config/abstract-config';
import makeEnv from './env-factory';

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

  async install(
    scope: Scope,
    opts: { verbose: boolean, dontPrintEnvMsg?: boolean },
    context?: Object
  ): Promise<?(ComponentWithDependencies[])> {
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
    const baseObject: BaseExtensionModel = super.toModelObject();
    const files = this.files.map(file => file.toModelObject());
    const modelObject = { files, ...baseObject };
    return modelObject;
  }

  toObject(): Object {
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
   * load the compiler/tester according to the following strategies:
   * 1. from component config. (bit.json/package.json of the component) if it was written.
   * 2. from component model. an imported component might not have the config written.
   * for author, it's irrelevant, because upon import it's written to consumer config (if changed).
   * 3. from consumer config overrides. (bit.json/package.json of the consumer when this component
   * overrides the general env config).
   * 4. from consumer config.
   */
  static async loadFromCorrectSource({
    consumerPath,
    scopePath,
    componentOrigin,
    componentFromModel,
    componentConfig,
    overridesFromConsumer,
    workspaceConfig,
    envType,
    context
  }: {
    consumerPath: string,
    scopePath: string,
    componentOrigin: ComponentOrigin,
    componentFromModel: ConsumerComponent,
    componentConfig: ?ComponentConfig,
    overridesFromConsumer: ?ConsumerOverridesOfComponent,
    workspaceConfig: WorkspaceConfig,
    envType: EnvType,
    context?: Object
  }): Promise<?EnvExtension> {
    logger.debug('env-extension', `(${envType}) loadFromCorrectSource`);
    if (componentConfig && componentConfig.componentHasWrittenConfig) {
      // load from component config.
      // $FlowFixMe
      const envConfig = { [envType]: componentConfig[envType] };
      const configPath = path.dirname(componentConfig.path);
      logger.debug(`env-extension loading ${envType} from component config`);
      return loadFromConfig({ envConfig, envType, consumerPath, scopePath, configPath, context });
    }
    if (componentOrigin !== COMPONENT_ORIGINS.AUTHORED) {
      // config was not written into component dir, load the config from the model
      logger.debug(`env-extension, loading ${envType} from the model`);
      return componentFromModel ? componentFromModel[envType] : undefined;
    }
    if (overridesFromConsumer && overridesFromConsumer.env && overridesFromConsumer.env[envType]) {
      if (overridesFromConsumer.env[envType] === MANUALLY_REMOVE_ENVIRONMENT) {
        logger.debug(`env-extension, ${envType} was manually removed from the consumer config overrides`);
        return null;
      }
      logger.debug(`env-extension, loading ${envType} from the consumer config overrides`);
      // $FlowFixMe
      const envConfig = { [envType]: AbstractConfig.transformEnvToObject(overridesFromConsumer.env[envType]) };
      return loadFromConfig({ envConfig, envType, consumerPath, scopePath, configPath: consumerPath, context });
    }
    // $FlowFixMe
    if (workspaceConfig[envType]) {
      logger.debug(`env-extension, loading ${envType} from the consumer config`);
      // $FlowFixMe
      const envConfig = { [envType]: workspaceConfig[envType] };
      return loadFromConfig({ envConfig, envType, consumerPath, scopePath, configPath: consumerPath, context });
    }
    return null;
  }

  /**
   * are two envs (in the model/scope format) different
   */
  static areEnvsDifferent(envModelA: ?EnvExtensionModel, envModelB: ?EnvExtensionModel) {
    const sortEnv = (env) => {
      env.files = R.sortBy(R.prop('name'), env.files);
      env.config = sortObject(env.config);
      const result = sortObject(env);
      return result;
    };
    const stringifyEnv = (env) => {
      if (!env) {
        return '';
      }
      if (typeof env === 'string') {
        return env;
      }
      return JSON.stringify(sortEnv(env));
    };
    const envModelAString = stringifyEnv(envModelA);
    const envModelBString = stringifyEnv(envModelB);
    return sha1(envModelAString) !== sha1(envModelBString);
  }
}

async function loadFromConfig({
  envConfig,
  envType,
  consumerPath,
  scopePath,
  configPath,
  context
}): Promise<?EnvExtension> {
  const env = envConfig[envType];
  if (!env) return null;
  const envName = Object.keys(env)[0];
  const envObject = env[envName];
  const envProps = {
    name: envName,
    consumerPath,
    scopePath,
    rawConfig: envObject.rawConfig,
    files: envObject.files,
    bitJsonPath: configPath,
    options: envObject.options,
    envType,
    context
  };
  // $FlowFixMe
  return makeEnv(envType, envProps);
}
