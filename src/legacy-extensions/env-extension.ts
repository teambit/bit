import * as path from 'path';
import R from 'ramda';

import BitId from '../bit-id/bit-id';
import { COMPONENT_ORIGINS, DEPENDENCIES_FIELDS, MANUALLY_REMOVE_ENVIRONMENT } from '../constants';
import { ComponentOrigin } from '../consumer/bit-map/component-map';
import ConsumerComponent from '../consumer/component';
import DataToPersist from '../consumer/component/sources/data-to-persist';
import ComponentConfig, { ILegacyWorkspaceConfig } from '../consumer/config';
import AbstractConfig, { EnvExtensionObject } from '../consumer/config/abstract-config';
import ComponentOverrides from '../consumer/config/component-overrides';
import GeneralError from '../error/general-error';
import logger from '../logger/logger';
import { ComponentWithDependencies } from '../scope';
import installExtensions from '../scope/extensions/install-extensions';
import Scope from '../scope/scope';
import { sha1, sortObject } from '../utils';
import BaseExtension, { BaseExtensionModel, BaseExtensionProps } from './base-extension';
import {
  EnvExtensionModel,
  EnvExtensionProps,
  EnvExtensionSerializedModel,
  EnvLoadArgsProps,
  EnvType,
} from './env-extension-types';
import makeEnv from './env-factory';
import ExtensionGetDynamicConfigError from './exceptions/extension-get-dynamic-config-error';
import ExtensionGetDynamicPackagesError from './exceptions/extension-get-dynamic-packages-error';

export type EnvPackages = {
  dependencies?: Record<string, any>;
  devDependencies?: Record<string, any>;
  peerDependencies?: Record<string, any>;
};

export default class EnvExtension extends BaseExtension {
  envType: EnvType;
  dynamicPackageDependencies: Record<string, any> | undefined;
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  dataToPersist: DataToPersist;

  /**
   * Return the action
   */
  get action(): Function | undefined {
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
  }

  async install(
    scope: Scope,
    opts: { verbose: boolean; dontPrintEnvMsg?: boolean },
    context?: Record<string, any>
  ): Promise<ComponentWithDependencies[] | null | undefined> {
    logger.debugAndAddBreadCrumb('env-extension', 'install env extension');

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
      ...opts,
    };
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    const installResult = await installExtensions(installOpts);
    this.setExtensionPathInScope(scope.getPath());
    await this.reload(scope.getPath(), context);
    return installResult;
  }

  toModelObject(): EnvExtensionModel {
    const baseObject: BaseExtensionModel = super.toModelObject();
    const modelObject = { ...baseObject };
    return modelObject;
  }

  toObject(): Record<string, any> {
    const baseObject: Record<string, any> = super.toObject();
    const object = { ...baseObject };
    return object;
  }

  /**
   * Get a bit.json representation of the env instance
   * @param {string} ejectedEnvDirectory - The base path of where the env config files are stored
   * $FlowFixMe seems to be an issue opened for this https://github.com/facebook/flow/issues/4953
   */
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  toBitJsonObject(): { [key: string]: EnvExtensionObject } {
    logger.trace('env-extension, toBitJsonObject');
    const envVal = {
      rawConfig: this.dynamicConfig,
      options: this.options,
    };
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return {
      [this.name]: envVal,
    };
  }

  async reload(scopePath: string, context?: Record<string, any>): Promise<void> {
    logger.trace('env-extension, reload');
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
    const baseExtensionProps = (await super.load(props)) as BaseExtensionProps;
    const envExtensionProps: EnvExtensionProps = { envType: props.envType, ...baseExtensionProps };
    const dynamicPackageDependencies = EnvExtension.loadDynamicPackageDependencies(envExtensionProps);
    envExtensionProps.dynamicPackageDependencies = dynamicPackageDependencies;
    const dynamicConfig = EnvExtension.loadDynamicConfig(envExtensionProps);
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    envExtensionProps.dynamicConfig = dynamicConfig;
    return envExtensionProps;
  }

  static loadDynamicPackageDependencies(envExtensionProps: EnvExtensionProps): EnvPackages | undefined {
    const getDynamicPackageDependencies = R.path(['script', 'getDynamicPackageDependencies'], envExtensionProps);
    if (!getDynamicPackageDependencies || typeof getDynamicPackageDependencies !== 'function') {
      return undefined;
    }
    let dynamicPackageDependencies;
    try {
      dynamicPackageDependencies = getDynamicPackageDependencies({
        rawConfig: envExtensionProps.rawConfig,
        dynamicConfig: envExtensionProps.dynamicConfig,
        context: envExtensionProps.context,
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
    const usesOldFormat = Object.keys(dynamicPackageDependencies).some((field) => !DEPENDENCIES_FIELDS.includes(field));
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
          context: envExtensionProps.context,
        });
        return dynamicConfig;
      } catch (err) {
        throw new ExtensionGetDynamicConfigError(err, envExtensionProps.name);
      }
    }
    return undefined;
  }

  static async loadFromModelObject(modelObject: EnvExtensionModel & { envType: EnvType }): Promise<EnvExtensionProps> {
    const baseExtensionProps: BaseExtensionProps = super.loadFromModelObjectBase(modelObject);
    const envExtensionProps: EnvExtensionProps = { envType: modelObject.envType, ...baseExtensionProps };
    return envExtensionProps;
  }

  static async loadFromSerializedModelObject(
    modelObject: EnvExtensionSerializedModel & { envType: EnvType }
  ): Promise<EnvExtensionProps> {
    logger.trace('env-extension, loadFromModelObject');
    const baseExtensionProps: BaseExtensionProps = super.loadFromModelObjectBase(modelObject);
    const envExtensionProps: EnvExtensionProps = { envType: modelObject.envType, ...baseExtensionProps };
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
    overrides,
    workspaceConfig,
    envType,
    context,
  }: {
    consumerPath: string;
    scopePath: string;
    componentOrigin: ComponentOrigin;
    componentFromModel: ConsumerComponent;
    componentConfig: ComponentConfig | undefined;
    overrides: ComponentOverrides;
    workspaceConfig: ILegacyWorkspaceConfig;
    envType: EnvType;
    context?: Record<string, any>;
  }): Promise<EnvExtension | null | undefined> {
    logger.trace(`env-extension (${envType}) loadFromCorrectSource`);
    const isAuthor = componentOrigin === COMPONENT_ORIGINS.AUTHORED;
    const componentHasWrittenConfig = componentConfig && componentConfig.componentHasWrittenConfig;
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    if (componentHasWrittenConfig && componentConfig[envType]) {
      // load from component config.
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
      logger.trace(`env-extension loading ${envType} from component config`);
      return loadFromConfig({ envConfig, envType, consumerPath, scopePath, configPath, context });
    }
    if (isAuthor && componentConfig && componentConfig[envType]) {
      // load from component config.
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      if (Object.keys(componentConfig[envType])[0] === MANUALLY_REMOVE_ENVIRONMENT) {
        logger.debug(`env-extension, ${envType} was manually removed from the component config`);
        return null;
      }
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      const envConfig = { [envType]: componentConfig[envType] };
      logger.trace(`env-extension loading ${envType} from component config in workspace config`);
      return loadFromConfig({ envConfig, envType, consumerPath, scopePath, configPath: consumerPath, context });
    }
    if (!componentHasWrittenConfig && !isAuthor && componentFromModel && componentFromModel[envType]) {
      // config was not written into component dir, load the config from the model
      logger.trace(`env-extension, loading ${envType} from the model`);
      return componentFromModel[envType];
    }
    const envFromOverride = overrides.getEnvByType(envType);
    if (envFromOverride) {
      if (envFromOverride === MANUALLY_REMOVE_ENVIRONMENT) {
        logger.debug(`env-extension, ${envType} was manually removed from the overrides`);
        return null;
      }
      logger.trace(`env-extension, loading ${envType} from the overrides`);
      const envConfig = { [envType]: AbstractConfig.transformEnvToObject(envFromOverride) };
      return loadFromConfig({ envConfig, envType, consumerPath, scopePath, configPath: consumerPath, context });
    }
    if (isAuthor && workspaceConfig[`_${envType}`]) {
      logger.trace(`env-extension, loading ${envType} from the consumer config`);
      const envConfig = { [envType]: workspaceConfig[`_${envType}`] };
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
    const sortEnv = (env) => {
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
  context,
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
    context,
  };
  return makeEnv(envType, envProps);
}
