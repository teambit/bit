import R from 'ramda';
import * as path from 'path';
import format from 'string-format';
import BaseExtension from './base-extension';
import Scope from '../scope/scope';
import {
  EnvType,
  EnvLoadArgsProps,
  EnvExtensionProps,
  EnvExtensionModel,
  EnvExtensionSerializedModel
} from './env-extension-types';
import { BaseExtensionProps, BaseExtensionModel } from './base-extension';
import BitId from '../bit-id/bit-id';
import ExtensionFile from './extension-file';
import { Repository } from '../scope/objects';
import { pathJoinLinux, sortObject, sha1 } from '../utils';
import removeFilesAndEmptyDirsRecursively from '../utils/fs/remove-files-and-empty-dirs-recursively';
import { PathOsBased } from '../utils/path';
import { EnvExtensionObject } from '../consumer/config/abstract-config';
import { ComponentWithDependencies } from '../scope';
import { Analytics } from '../analytics/analytics';
import ExtensionGetDynamicPackagesError from './exceptions/extension-get-dynamic-packages-error';
import { COMPONENT_ORIGINS, MANUALLY_REMOVE_ENVIRONMENT, DEPENDENCIES_FIELDS } from '../constants';
import { ComponentOrigin } from '../consumer/bit-map/component-map';
import ConsumerComponent from '../consumer/component';
import WorkspaceConfig from '../consumer/config/workspace-config';
import ComponentConfig from '../consumer/config';
import logger from '../logger/logger';
import { Dependencies } from '../consumer/component/dependencies';
import ConfigDir from '../consumer/bit-map/config-dir';
import ExtensionGetDynamicConfigError from './exceptions/extension-get-dynamic-config-error';
import installExtensions from '../scope/extensions/install-extensions';
import DataToPersist from '../consumer/component/sources/data-to-persist';
import RemovePath from '../consumer/component/sources/remove-path';
import Consumer from '../consumer/consumer';
import { ConsumerOverridesOfComponent } from '../consumer/config/consumer-overrides';
import AbstractConfig from '../consumer/config/abstract-config';
import makeEnv from './env-factory';
import GeneralError from '../error/general-error';

export type EnvPackages = {
  dependencies?: Record<string, any>;
  devDependencies?: Record<string, any>;
  peerDependencies?: Record<string, any>;
};

export default class EnvExtension extends BaseExtension {
  envType: EnvType;
  dynamicPackageDependencies: Record<string, any> | null | undefined;
  files: ExtensionFile[];
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  dataToPersist: DataToPersist;

  /**
   * Return the action
   */
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  get action(): Function | null | undefined {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    if (this.script && this.script.action && typeof this.script.action === 'function') {
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      return this.script.action;
    }
    return undefined;
  }

  /**
   * return old actions (to support old compilers / testers which uses run / compile functions)
   */
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  get oldAction(): Function | null | undefined {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    if (this.script && this.script.run && typeof this.script.run === 'function') {
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      return this.script.run;
    }
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    if (this.script && this.script.compile && typeof this.script.compile === 'function') {
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
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
    opts: { verbose: boolean; dontPrintEnvMsg?: boolean },
    context?: Record<string, any>
  ): Promise<ComponentWithDependencies[] | null | undefined> {
    Analytics.addBreadCrumb('env-extension', 'install env extension');
    logger.debug('env-extension - install env extension');

    // Skip the installation in case of using specific file
    // options.file usually used for develop your extension
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
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
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
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

  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  toObject(): Record<string, any> {
    const baseObject: Record<string, any> = super.toObject();
    const files = this.files;
    const object = { ...baseObject, files };
    return object;
  }

  /**
   * Get a bit.json representation of the env instance
   * @param {string} ejectedEnvDirectory - The base path of where the env config files are stored
   * $FlowFixMe seems to be an issue opened for this https://github.com/facebook/flow/issues/4953
   */
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  toBitJsonObject(ejectedEnvDirectory: string): { [key: string]: EnvExtensionObject } {
    logger.debug('env-extension, toBitJsonObject');
    const files = {};
    this.files.forEach(file => {
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      const relativePath = pathJoinLinux(ejectedEnvDirectory, file.relative);
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      files[file.name] = `./${relativePath}`;
    });
    const envVal = {
      rawConfig: this.dynamicConfig,
      options: this.options,
      files
    };
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
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
    configDir: string;
    envType: EnvType;
    deleteOldFiles: boolean;
    consumer: Consumer | null | undefined;
    verbose: boolean;
  }): Promise<string> {
    const resolvedEjectedEnvsDirectory = format(configDir, { ENV_TYPE: envType });
    const filePathsToRemove = [];

    this.files.forEach(file => {
      if (deleteOldFiles) {
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        const pathToDelete = consumer ? consumer.getPathRelativeToConsumer(file.path) : file.path;
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        filePathsToRemove.push(pathToDelete);
      }
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      file.updatePaths({ newBase: resolvedEjectedEnvsDirectory, newRelative: file.relative });
      file.verbose = verbose;
    });
    this.dataToPersist = new DataToPersist();
    this.files.forEach(file => {
      const cloned = file.clone();
      cloned.verbose = verbose;
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
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
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    const filePaths = this.files.map(file => file.path);
    const relativeSourcePaths = dependencies.getSourcesPaths();
    if (!this.context) throw new Error('env-extension.removeFilesFromFs, this.context is missing');
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    const componentDir = this.context.componentDir;
    const configDirResolved = configDir.getResolved({ componentDir, envType });
    const configDirPath = configDirResolved.dirPath;
    const absoluteEnvsDirectory = path.isAbsolute(configDirPath)
      ? configDirPath
      : path.join(consumerPath, configDirPath);
    const linkPaths = relativeSourcePaths.map(relativePath => path.join(absoluteEnvsDirectory, relativePath));
    return removeFilesAndEmptyDirsRecursively([...filePaths, ...linkPaths]);
  }

  async reload(scopePath: string, context?: Record<string, any>): Promise<void> {
    logger.debug('env-extension, reload');
    if (context) {
      this.context = context;
    }
    const throws = true;
    await super.reload(scopePath, { throws });
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
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
    const files = await ExtensionFile.loadFromBitJsonObject(
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      props.files, // $FlowFixMe
      props.consumerPath,
      props.bitJsonPath,
      props.envType
    );
    const envExtensionProps: EnvExtensionProps = { envType: props.envType, files, ...baseExtensionProps };
    const dynamicPackageDependencies = EnvExtension.loadDynamicPackageDependencies(envExtensionProps);
    envExtensionProps.dynamicPackageDependencies = dynamicPackageDependencies;
    const dynamicConfig = EnvExtension.loadDynamicConfig(envExtensionProps);
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    envExtensionProps.dynamicConfig = dynamicConfig;
    return envExtensionProps;
  }

  static loadDynamicPackageDependencies(envExtensionProps: EnvExtensionProps): EnvPackages | null | undefined {
    const getDynamicPackageDependencies = R.path(['script', 'getDynamicPackageDependencies'], envExtensionProps);
    if (!getDynamicPackageDependencies || typeof getDynamicPackageDependencies !== 'function') {
      return undefined;
    }
    let dynamicPackageDependencies;
    try {
      dynamicPackageDependencies = getDynamicPackageDependencies({
        rawConfig: envExtensionProps.rawConfig,
        dynamicConfig: envExtensionProps.dynamicConfig,
        configFiles: envExtensionProps.files,
        context: envExtensionProps.context
      });
    } catch (err) {
      throw new ExtensionGetDynamicPackagesError(err, envExtensionProps.name);
    }
    if (!dynamicPackageDependencies) return undefined;
    if (typeof dynamicPackageDependencies !== 'object') {
      throw new GeneralError('expect getDynamicPackageDependencies to return an object');
    }
    // old format returned an object of the packages, without any separation between
    // dependencies, devDependencies and peerDependencies
    const usesOldFormat = Object.keys(dynamicPackageDependencies).some(field => !DEPENDENCIES_FIELDS.includes(field));
    if (usesOldFormat) {
      throw new GeneralError(
        `getDynamicPackageDependencies expects to return the following keys only: [${DEPENDENCIES_FIELDS.join(', ')}]`
      );
    }

    return dynamicPackageDependencies;
  }

  static loadDynamicConfig(envExtensionProps: EnvExtensionProps): Record<string, any> | null | undefined {
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
    modelObject: EnvExtensionModel & { envType: EnvType },
    repository: Repository
  ): Promise<EnvExtensionProps> {
    const baseExtensionProps: BaseExtensionProps = super.loadFromModelObject(modelObject);
    let files = [];
    if (modelObject.files && !R.isEmpty(modelObject.files)) {
      const loadFilesP = modelObject.files.map(file => ExtensionFile.loadFromExtensionFileModel(file, repository));
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      files = await Promise.all(loadFilesP);
    }
    const envExtensionProps: EnvExtensionProps = { envType: modelObject.envType, files, ...baseExtensionProps };
    return envExtensionProps;
  }

  static async loadFromSerializedModelObject(
    modelObject: EnvExtensionSerializedModel & { envType: EnvType }
  ): Promise<EnvExtensionProps> {
    logger.debug('env-extension, loadFromModelObject');
    const baseExtensionProps: BaseExtensionProps = super.loadFromModelObject(modelObject);
    let files = [];
    if (modelObject.files && !R.isEmpty(modelObject.files)) {
      const loadFilesP = modelObject.files.map(file => ExtensionFile.loadFromExtensionFileSerializedModel(file));
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      files = await Promise.all(loadFilesP);
    }
    const envExtensionProps: EnvExtensionProps = { envType: modelObject.envType, files, ...baseExtensionProps };
    return envExtensionProps;
  }

  /**
   * load the compiler/tester according to the following strategies:
   * 1. from component config (bit.json/package.json of the component) if it was written.
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
    consumerPath: string;
    scopePath: string;
    componentOrigin: ComponentOrigin;
    componentFromModel: ConsumerComponent;
    componentConfig: ComponentConfig | null | undefined;
    overridesFromConsumer: ConsumerOverridesOfComponent | null | undefined;
    workspaceConfig: WorkspaceConfig;
    envType: EnvType;
    context?: Record<string, any>;
  }): Promise<EnvExtension | null | undefined> {
    logger.debug(`env-extension (${envType}) loadFromCorrectSource`);
    const isAuthor = componentOrigin === COMPONENT_ORIGINS.AUTHORED;
    const componentHasWrittenConfig = componentConfig && componentConfig.componentHasWrittenConfig;
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    if (componentHasWrittenConfig && componentConfig[envType]) {
      // load from component config.
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      if (Object.keys(componentConfig[envType])[0] === MANUALLY_REMOVE_ENVIRONMENT) {
        logger.debug(`env-extension, ${envType} was manually removed from the component config`);
        return null;
      }
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      const envConfig = { [envType]: componentConfig[envType] };
      // $FlowFixMe we made sure before that componentConfig is defined
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      const configPath = path.dirname(componentConfig.path);
      logger.debug(`env-extension loading ${envType} from component config`);
      return loadFromConfig({ envConfig, envType, consumerPath, scopePath, configPath, context });
    }
    if (!componentHasWrittenConfig && !isAuthor && componentFromModel && componentFromModel[envType]) {
      // config was not written into component dir, load the config from the model
      logger.debug(`env-extension, loading ${envType} from the model`);
      return componentFromModel[envType];
    }
    if (overridesFromConsumer && overridesFromConsumer.env && overridesFromConsumer.env[envType]) {
      if (overridesFromConsumer.env[envType] === MANUALLY_REMOVE_ENVIRONMENT) {
        logger.debug(`env-extension, ${envType} was manually removed from the consumer config overrides`);
        return null;
      }
      logger.debug(`env-extension, loading ${envType} from the consumer config overrides`);
      const envConfig = { [envType]: AbstractConfig.transformEnvToObject(overridesFromConsumer.env[envType]) };
      return loadFromConfig({ envConfig, envType, consumerPath, scopePath, configPath: consumerPath, context });
    }
    if (isAuthor && workspaceConfig[envType]) {
      logger.debug(`env-extension, loading ${envType} from the consumer config`);
      const envConfig = { [envType]: workspaceConfig[envType] };
      return loadFromConfig({ envConfig, envType, consumerPath, scopePath, configPath: consumerPath, context });
    }
    return null;
  }

  /**
   * are two envs (in the model/scope format) different
   */
  static areEnvsDifferent(
    envModelA: EnvExtensionModel | null | undefined,
    envModelB: EnvExtensionModel | null | undefined
  ) {
    const sortEnv = env => {
      env.files = R.sortBy(R.prop('name'), env.files);
      env.config = sortObject(env.config);
      const result = sortObject(env);
      return result;
    };
    const stringifyEnv = env => {
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
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
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
}): Promise<EnvExtension | null | undefined> {
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
  return makeEnv(envType, envProps);
}
