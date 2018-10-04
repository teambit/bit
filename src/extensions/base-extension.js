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

const ajv = new Ajv();

const CORE_EXTENSIONS_PATH = './core-extensions';

export type BaseExtensionOptions = {
  file?: ?string
};

type BaseArgs = {
  name: string,
  rawConfig: Object,
  // options: BaseExtensionOptions
  options: ExtensionOptions | EnvExtensionOptions
};

export type BaseLoadArgsProps = BaseArgs & {
  consumerPath?: ?PathOsBased,
  scopePath?: ?PathOsBased,
  context?: ?Object,
  throws?: boolean
};

type BaseLoadFromFileArgsProps = BaseArgs & {
  filePath: string,
  rootDir?: string,
  throws?: boolean
};

type StaticProps = BaseArgs & {
  dynamicConfig: Object,
  filePath: string,
  rootDir?: ?string,
  schema?: ?Object,
  script?: Function,
  disabled: boolean,
  loaded: boolean,
  context?: ?Object
};

type InstanceSpecificProps = {
  api: Object
};

export type BaseExtensionProps = InstanceSpecificProps & StaticProps;

export type BaseExtensionModel = {
  name: string,
  config: Object
};

type ExtensionPath = {
  resolvedPath: string,
  componentPath: string
};

export type InitOptions = {
  writeConfigFilesOnAction: ?boolean
};

// export type BaseExtensionProps = {
//   ...InstanceSpecificProps,
//   ...StaticProps
// };

// type staticProps = $Diff<BaseExtensionProps, instanceSpecificProps>

export default class BaseExtension {
  name: string;
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
  script: ?Function; // Store the required plugin
  _initOptions: ?InitOptions; // Store the required plugin
  api = _getConcreteBaseAPI({ name: this.name });

  constructor(extensionProps: BaseExtensionProps) {
    this.name = extensionProps.name;
    this.rawConfig = extensionProps.rawConfig;
    this.schema = extensionProps.schema;
    this.options = extensionProps.options;
    this.dynamicConfig = extensionProps.dynamicConfig || extensionProps.rawConfig;
    this.context = extensionProps.context;
    this.script = extensionProps.script;
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
      if (this.script && this.script.init && typeof this.script.init === 'function') {
        initOptions = await this.script.init({
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
    return {
      name: this.name,
      config: this.dynamicConfig
    };
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
      this.script = baseProps.script;
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
  static async load({
    name,
    rawConfig = {},
    // $FlowFixMe
    options = {},
    consumerPath,
    scopePath,
    throws = false,
    context
  }: BaseLoadArgsProps): Promise<BaseExtensionProps> {
    Analytics.addBreadCrumb('base-extension', 'load extension');
    logger.debug(`base-extension loading ${name}`);
    const concreteBaseAPI = _getConcreteBaseAPI({ name });
    if (options.file) {
      let absPath = options.file;
      const file = options.file || '';
      if (!path.isAbsolute(options.file) && consumerPath) {
        absPath = path.resolve(consumerPath, file);
      }
      const staticExtensionProps: StaticProps = await BaseExtension.loadFromFile({
        name,
        filePath: absPath,
        rawConfig,
        options,
        throws
      });
      const extensionProps: BaseExtensionProps = { api: concreteBaseAPI, context, ...staticExtensionProps };
      extensionProps.api = concreteBaseAPI;
      return extensionProps;
    }
    let staticExtensionProps: StaticProps = {
      name,
      rawConfig,
      dynamicConfig: rawConfig,
      options,
      disabled: false,
      loaded: false,
      filePath: ''
    };
    // Require extension from scope
    if (scopePath) {
      // $FlowFixMe
      const { resolvedPath, componentPath } = _getExtensionPath(name, scopePath, options.core);
      const nameWithVersion = _addVersionToNameFromPathIfMissing(name, componentPath, options);
      staticExtensionProps = await BaseExtension.loadFromFile({
        name: nameWithVersion,
        filePath: resolvedPath,
        rootDir: componentPath,
        rawConfig,
        options,
        throws
      });
    }
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

  static async loadFromFile({
    name,
    filePath,
    rootDir,
    rawConfig = {},
    // $FlowFixMe
    options = {},
    throws = false
  }: BaseLoadFromFileArgsProps): Promise<StaticProps> {
    logger.debug(`loading extension ${name} from ${filePath}`);
    Analytics.addBreadCrumb('base-extension', 'load extension from file');
    const extensionProps: StaticProps = {
      name,
      rawConfig,
      dynamicConfig: rawConfig,
      options,
      disabled: false,
      loaded: false,
      filePath: '',
      rootDir: ''
    };
    // Skip disabled extensions
    if (options.disabled) {
      extensionProps.disabled = true;
      logger.info(`skip extension ${extensionProps.name} because it is disabled`);
      extensionProps.loaded = false;
      return extensionProps;
    }
    extensionProps.filePath = filePath;
    extensionProps.rootDir = rootDir;
    const isFileExist = await fs.exists(filePath);
    if (!isFileExist) {
      // Do not throw an error if the file not exist since we will install it later
      // unless you specify the options.file which means you want a specific file which won't be installed automatically later
      if (throws && options.file) {
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
      const script = require(filePath); // eslint-disable-line
      extensionProps.script = script.default ? script.default : script;
      if (extensionProps.script.getSchema && typeof extensionProps.script.getSchema === 'function') {
        extensionProps.schema = await extensionProps.script.getSchema();
        const valid = ajv.validate(extensionProps.schema, rawConfig);
        if (!valid) {
          throw new ExtensionSchemaError(name, ajv.errorsText());
        }
      }
      // Make sure to not kill the process if an extension didn't load correctly
    } catch (err) {
      if (err.code === 'MODULE_NOT_FOUND') {
        const msg = `loading extension ${extensionProps.name} failed, the file ${extensionProps.filePath} not found`;
        logger.warn(msg);
        // console.error(msg); // eslint-disable-line no-console
      }
      logger.error(`loading extension ${extensionProps.name} failed`);
      logger.error(err);
      extensionProps.loaded = false;
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
  }

  static async loadDynamicConfig(extensionProps: StaticProps): Promise<?Object> {
    Analytics.addBreadCrumb('base-extension', 'loadDynamicConfig');
    logger.debug('base-extension - loadDynamicConfig');
    const getDynamicConfig = R.path(['script', 'getDynamicConfig'], extensionProps);
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

const _getExtensionPath = (name: string, scopePath: ?string, isCore: boolean = false): ExtensionPath => {
  if (isCore) {
    return _getCoreExtensionPath(name);
  }
  if (!scopePath) {
    throw new ScopeNotFound();
  }
  return _getRegularExtensionPath(name, scopePath);
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
