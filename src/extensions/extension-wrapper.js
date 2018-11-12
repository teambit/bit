/** @flow */

import path from 'path';
import R from 'ramda';
import fs from 'fs-extra';
import Ajv from 'ajv';
import semver from 'semver';
import logger, { createExtensionLogger } from '../logger/logger';
import { Scope } from '../scope';
import { ScopeNotFound } from '../scope/exceptions';
import { BitId } from '../bit-id';
import type { EnvExtensionOptions } from './env-extension';
import type { ExtensionOptions } from './extension';
import ExtensionNameNotValid from './exceptions/extension-name-not-valid';
import ExtensionGetDynamicConfigError from './exceptions/extension-get-dynamic-config-error';
import type { PathOsBased } from '../utils/path';
import { Analytics } from '../analytics/analytics';
import ExtensionLoadError from './exceptions/extension-load-error';
import Environment from '../environment';
import ExtensionSchemaError from './exceptions/extension-schema-error';
import ExtensionEntry from './extension-entry';
import ExtensionConfig from './extension-config';
import ExtensionInvalidConfig from './exceptions/extension-invalid-config';

const CORE_EXTENSIONS_PATH = './core-extensions';
export default class ExtensionWrapper {
  name: ExtensionEntry;
  loaded: boolean;
  initialized: boolean;
  disabled: boolean;
  filePath: string;
  rootDir: string;
  rawConfig: Object;
  schema: ?Object;
  options: Object;
  dynamicConfig: Object;
  context: ?Object;
  extensionConstructor: ?Function; // Store the required plugin
  _initOptions: ?InitOptions; // Store the required plugin
  api = _getConcreteBaseAPI({ name: this.name });

  constructor(extensionProps: BaseExtensionProps) {
    this.name = extensionProps.name;
    this.rawConfig = extensionProps.rawConfig;
    this.schema = extensionProps.schema;
    this.options = extensionProps.options;
    this.dynamicConfig = extensionProps.dynamicConfig || extensionProps.rawConfig;
    this.context = extensionProps.context;
    this.extensionConstructor = extensionProps.extensionConstructor;
    this.disabled = extensionProps.disabled;
    this.filePath = extensionProps.filePath;
    this.rootDir = extensionProps.rootDir || '';
    this.loaded = extensionProps.loaded;
    this.api = extensionProps.api;
  }

  get writeConfigFilesOnAction() {
    if (!this.initOptions) {
      return false;
    }
    return this.initOptions.writeConfigFilesOnAction;
  }

  get initOptions() {
    return this._initOptions;
  }

  set initOptions(opts: ?Object) {
    const defaultInitOpts = {
      writeConfigFilesOnAction: false
    };
    if (!opts) {
      this._initOptions = defaultInitOpts;
      return;
    }
    const res = {};
    if (opts.write) {
      res.writeConfigFilesOnAction = true;
    }
    this._initOptions = res;
  }

  /**
   * Run the extension's init function
   */
  async init(throws: boolean = false): Promise<boolean> {
    Analytics.addBreadCrumb('base-extension', 'initialize extension');
    try {
      let initOptions = {};
      if (
        this.extensionConstructor &&
        this.extensionConstructor.init &&
        typeof this.extensionConstructor.init === 'function'
      ) {
        initOptions = await this.extensionConstructor.init({
          rawConfig: this.rawConfig,
          dynamicConfig: this.dynamicConfig,
          api: this.api
        });
      }
      this.initOptions = initOptions;
      this.initialized = true;
      // Make sure to not kill the process if an extension didn't load correctly
    } catch (err) {
      logger.error(`initialized extension ${this.name} failed`);
      logger.error(err);
      if (throws) {
        throw new ExtensionLoadError(err, this.name);
      }
      this.initialized = false;
      return false;
    }
    return true;
  }

  extendAPI(baseApi: Object, api: Object): void {
    this.api = R.merge(baseApi, api);
  }

  toString(): string {
    return JSON.stringify(this, null, 2);
  }

  toBitJsonObject() {
    return {
      [this.name]: {
        rawConfig: this.rawConfig,
        options: this.options
      }
    };
  }

  toModelObject() {
    const res = {};
    R.mapObjIndexed(this.extension.propTypes);
  }

  toObject() {
    return this.toModelObject();
  }

  /**
   * Reload the extension, this mainly contain the process of going to the extension file requiring it and get the dynamic config
   * It mostly used for env extension when sometime on the first load the env didn't installed yet (only during build / test) phase
   */
  async reload(scopePath: string, { throws }: Object): Promise<void> {
    Analytics.addBreadCrumb('base-extension', 'reload extension');
    if (!this.filePath && !this.options.core) {
      const { resolvedPath, componentPath } = _getExtensionPath(this.name, scopePath, this.options.core);
      this.filePath = resolvedPath;
      this.rootDir = componentPath;
    }
    this.name = _addVersionToNameFromPathIfMissing(this.name, this.rootDir, this.options);
    const baseProps = await BaseExtension.loadFromFile({
      name: this.name,
      filePath: this.filePath,
      rootDir: this.rootDir,
      rawConfig: this.rawConfig,
      options: this.options,
      throws
    });
    if (baseProps.loaded) {
      this.loaded = baseProps.loaded;
      this.extensionConstructor = baseProps.extensionConstructor;
      this.dynamicConfig = baseProps.dynamicConfig;
      this.init();
    }
  }

  setExtensionPathInScope(scopePath: string): void {
    const { resolvedPath, componentPath } = _getExtensionPath(this.name, scopePath, this.options.core);
    this.filePath = resolvedPath;
    this.rootDir = componentPath;
  }

  static transformStringToModelObject(name: string): BaseExtensionModel {
    return {
      name,
      config: {}
    };
  }

  /**
   * Load extension by name
   * The extension will be from scope by default or from file
   * if there is file(path) in the options
   * The file path is relative to the bit.json of the project or absolute
   * @param {string} name - name of the extension
   * @param {Object} rawConfig - raw config for the extension
   * @param {Object} options - extension options such as - disabled, file, core
   * @param {string} consumerPath - path to the consumer folder (to load the file relatively)
   * @param {string} scopePath - scope which stores the extension code
   */
  static async load({ name, rawConfig = {}, context, throws = false }: BaseLoadArgsProps): Promise<BaseExtensionProps> {
    Analytics.addBreadCrumb('extension-wrapper', 'load extension');
    logger.debug(`extension-wrapper loading ${name}`);
    const concreteBaseAPI = _getConcreteBaseAPI({ name });
    const extensionEntry = new ExtensionEntry(name);
    // TODO: Make sure the extension already exists
    const config = ExtensionConfig.fromRawConfig(rawConfig);
    const { resolvedPath, componentPath } = _getExtensionPath(extensionEntry, context.scopePath, context.consumerPath);
    //   const nameWithVersion = _addVersionToNameFromPathIfMissing(name, componentPath, options);
    // Skip disabled extensions
    if (config.disabled) {
      extensionProps.disabled = true;
      logger.info(`skip extension ${extensionProps.name} because it is disabled`);
      extensionProps.loaded = false;
      return extensionProps;
    }
    const staticExtensionProps = await _loadFromFile({
      name,
      filePath: resolvedPath,
      rootDir: componentPath,
      config,
      context,
      throws
    });
    const extensionProps: BaseExtensionProps = { api: concreteBaseAPI, context, ...staticExtensionProps };
    return extensionProps;
  }

  static loadFromModelObject(modelObject: string | BaseExtensionModel) {
    Analytics.addBreadCrumb('base-extension', 'load extension from model object');
    let staticExtensionProps: StaticProps;
    if (typeof modelObject === 'string') {
      staticExtensionProps = {
        name: modelObject,
        rawConfig: {},
        dynamicConfig: {},
        options: {},
        disabled: false,
        loaded: false,
        filePath: ''
      };
    } else {
      staticExtensionProps = {
        name: modelObject.name,
        rawConfig: modelObject.config,
        dynamicConfig: modelObject.config,
        options: {},
        disabled: false,
        loaded: false,
        filePath: ''
      };
    }

    const concreteBaseAPI = _getConcreteBaseAPI({ name: staticExtensionProps.name });
    const extensionProps: BaseExtensionProps = { api: concreteBaseAPI, ...staticExtensionProps };
    return extensionProps;
  }

  static async loadDynamicConfig(extensionProps: StaticProps): Promise<?Object> {
    Analytics.addBreadCrumb('base-extension', 'loadDynamicConfig');
    logger.debug('base-extension - loadDynamicConfig');
    const getDynamicConfig = R.path(['extensionConstructor', 'getDynamicConfig'], extensionProps);
    if (getDynamicConfig && typeof getDynamicConfig === 'function') {
      try {
        const dynamicConfig = await getDynamicConfig({
          rawConfig: extensionProps.rawConfig
        });
        return dynamicConfig;
      } catch (err) {
        throw new ExtensionGetDynamicConfigError(err, extensionProps.name);
      }
    }
    return undefined;
  }
}

const _getExtensionPath = (
  extensionEntry: ExtensionEntry,
  scopePath: ?string,
  consumerPath: ?string
): ExtensionPath => {
  if (extensionEntry.source === 'FILE') {
    return _getFileExtensionPath(extensionEntry.val, consumerPath);
  }
  if (extensionEntry.source === 'BIT') {
    return _getCoreExtensionPath(extensionEntry.val);
  }
  if (!scopePath) {
    throw new ScopeNotFound();
  }
  return _getRegularExtensionPath(extensionEntry.val, scopePath);
};

const _getFileExtensionPath = (filePath: string, consumerPath: ?string): ExtensionPath => {
  let absPath = filePath;
  if (!path.isAbsolute(filePath) && consumerPath) {
    if (!consumerPath) {
      throw new Error('consumer path is not defined');
    }
    absPath = path.resolve(consumerPath, filePath);
  }
  return {
    resolvedPath: absPath,
    componentPath: undefined
  };
};

const _getCoreExtensionPath = (name: string): ExtensionPath => {
  const componentPath = path.join(__dirname, CORE_EXTENSIONS_PATH, name);
  return {
    resolvedPath: componentPath,
    componentPath
  };
};

const _getRegularExtensionPath = (name: string, scopePath: string): ExtensionPath => {
  let bitId: BitId;
  try {
    bitId = BitId.parse(name, true); // todo: make sure it always has a scope
  } catch (err) {
    throw new ExtensionNameNotValid(name);
  }
  if (!bitId || !bitId.scope) throw new ExtensionNameNotValid(name);

  const internalComponentsPath = Scope.getComponentsRelativePath();
  const internalComponentPath = Scope.getComponentRelativePath(bitId, scopePath);
  const componentPath = path.join(scopePath, internalComponentsPath, internalComponentPath);
  try {
    // This might throw an error in case of imported component when the env
    // isn't installed yet
    // It will be handled in higher functions
    const resolved = require.resolve(componentPath);
    return {
      resolvedPath: resolved,
      componentPath
    };
  } catch (e) {
    return {
      resolvedPath: componentPath,
      componentPath
    };
  }
};

const _getExtensionVersionFromComponentPath = (componentPath: string): ?string => {
  const parsed = path.parse(componentPath);
  const version = parsed.base;
  if (!semver.valid(version)) {
    return undefined;
  }
  return version;
};

const _addVersionToNameFromPathIfMissing = (name: string, componentPath: string, options: Object): string => {
  if (options && options.core) return name; // if it's a core extension, it's not a bit-id.
  let bitId: BitId;
  try {
    bitId = BitId.parse(name, true); // @todo: make sure it always has a scope name
  } catch (err) {
    throw new ExtensionNameNotValid(name);
  }
  if (bitId.getVersion().latest) {
    const version = _getExtensionVersionFromComponentPath(componentPath);
    return bitId.changeVersion(version).toString();
  }
  return name;
};

const baseApi = {
  /**
   * API to get logger
   */
  getLogger: (name): Function => () => createExtensionLogger(name)
};

/**
 * Function which get actual params and return a concrete base api
 */
const _getConcreteBaseAPI = ({ name }: { name: string }) => {
  const concreteBaseAPI = R.clone(baseApi);
  concreteBaseAPI.getLogger = baseApi.getLogger(name);
  return concreteBaseAPI;
};

const _loadFromFile = async ({
  name,
  filePath,
  rootDir,
  config,
  context,
  throws = false
}: BaseLoadFromFileArgsProps): Promise<StaticProps> => {
  logger.debug(`loading extension ${name} from ${filePath}`);
  Analytics.addBreadCrumb('extension-wrapper', 'load extension from file');
  const extensionProps: StaticProps = {
    name,
    config,
    loaded: false
  };

  const isFileExist = await fs.exists(filePath);
  if (!isFileExist) {
    // Do not throw an error if the file not exist since we will install it later
    // unless you specify the options.file which means you want a specific file which won't be installed automatically later
    if (throws) {
      const err = new Error(`the file ${filePath} not found`);
      throw new ExtensionLoadError(err, extensionProps.name);
    }
    extensionProps.loaded = false;
    return extensionProps;
  }

  if (rootDir && !Environment.isEnvironmentInstalled(rootDir)) {
    extensionProps.loaded = false;
    return extensionProps;
  }
  try {
    // $FlowFixMe
    const extensionConstructor = require(filePath); // eslint-disable-line
    extensionProps.ExtensionConstructor = extensionConstructor.default
      ? extensionConstructor.default
      : extensionConstructor;
    await config.loadProps(
      extensionProps.ExtensionConstructor.propTypes,
      extensionProps.ExtensionConstructor.defaultProps,
      context
    );
    const extension = await new extensionProps.ExtensionConstructor(config.props, context);
    extensionProps.extension = extension;
    extensionProps.loaded = true;

    // const extension =

    // Make sure to not kill the process if an extension didn't load correctly
  } catch (err) {
    if (err.code === 'MODULE_NOT_FOUND') {
      const msg = `loading extension ${extensionProps.name} failed, the file ${filePath} not found`;
      logger.warn(msg);
      // console.error(msg); // eslint-disable-line no-console
    }
    logger.error(`loading extension ${extensionProps.name} failed`);
    logger.error(err);
    extensionProps.loaded = false;
    if (err instanceof ExtensionInvalidConfig) {
      // TODO: Make sure it printed correctly
      throw new ExtensionLoadError(err, extensionProps.name, false);
    }
    if (throws) {
      let printStack = true;
      if (err instanceof ExtensionSchemaError) {
        printStack = false;
      }
      throw new ExtensionLoadError(err, extensionProps.name, printStack);
    }
    return extensionProps;
  }
  extensionProps.loaded = true;
  return extensionProps;
};
