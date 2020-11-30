// @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
import Ajv from 'ajv';
import fs from 'fs-extra';
import * as path from 'path';
import R from 'ramda';
import semver from 'semver';

import { Analytics } from '../analytics/analytics';
import { BitId } from '../bit-id';
import Environment from '../environment';
import logger, { createExtensionLogger } from '../logger/logger';
import { Scope } from '../scope';
import { PathOsBased } from '../utils/path';
import { EnvExtensionOptions } from './env-extension-types';
import ExtensionGetDynamicConfigError from './exceptions/extension-get-dynamic-config-error';
import ExtensionLoadError from './exceptions/extension-load-error';
import ExtensionNameNotValid from './exceptions/extension-name-not-valid';
import ExtensionSchemaError from './exceptions/extension-schema-error';
import { ExtensionOptions } from './extension';

const ajv = new Ajv();

const CORE_EXTENSIONS_PATH = './core-extensions';

export type BaseExtensionOptions = {
  file?: string | null | undefined;
};

type BaseArgs = {
  name: string;
  rawConfig: Record<string, any>;
  // options: BaseExtensionOptions
  options: ExtensionOptions | EnvExtensionOptions;
};

export type BaseLoadArgsProps = BaseArgs & {
  consumerPath?: PathOsBased | null | undefined;
  scopePath?: PathOsBased | null | undefined;
  context?: Record<string, any> | null | undefined;
  throws?: boolean;
};

type BaseLoadFromFileArgsProps = BaseArgs & {
  filePath: string;
  rootDir?: string;
  throws?: boolean;
};

type StaticProps = BaseArgs & {
  dynamicConfig: Record<string, any>;
  filePath: string;
  rootDir?: string | null | undefined;
  schema?: Record<string, any> | null | undefined;
  script?: Function;
  disabled: boolean;
  loaded: boolean;
  context?: Record<string, any> | null | undefined;
};

type InstanceSpecificProps = {
  api: Record<string, any>;
};

export type BaseExtensionProps = InstanceSpecificProps & StaticProps;

export type BaseExtensionModel = {
  name: string;
  config: Record<string, any>;
};

type ExtensionPath = {
  resolvedPath: string;
  componentPath: string;
};

export type InitOptions = {
  writeConfigFilesOnAction: boolean | null | undefined;
};

// export type BaseExtensionProps = {
//   ...InstanceSpecificProps,
//   ...StaticProps
// };

// type staticProps = $Diff<BaseExtensionProps, instanceSpecificProps>

export default class BaseExtension {
  name: string;
  loaded: boolean;
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  initialized: boolean;
  disabled: boolean;
  filePath: string;
  rootDir: string;
  rawConfig: Record<string, any>;
  schema: Record<string, any> | null | undefined;
  options: Record<string, any>;
  dynamicConfig: Record<string, any>;
  context: Record<string, any> | null | undefined;
  script: Function | null | undefined; // Store the required plugin
  _initOptions: InitOptions | null | undefined; // Store the required plugin
  // @ts-ignore this code is obsolete, no point of fixing the types
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

  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  get writeConfigFilesOnAction() {
    if (!this.initOptions) {
      return false;
    }
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return this.initOptions.writeConfigFilesOnAction;
  }

  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  get initOptions() {
    return this._initOptions;
  }

  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  set initOptions(opts: Record<string, any> | null | undefined) {
    const defaultInitOpts = {
      writeConfigFilesOnAction: false,
    };
    if (!opts) {
      this._initOptions = defaultInitOpts;
      return;
    }
    const res = {};
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    if (opts.write) {
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      res.writeConfigFilesOnAction = true;
    }
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    this._initOptions = res;
  }

  /**
   * Run the extension's init function
   */
  async init(throws = false): Promise<boolean> {
    Analytics.addBreadCrumb('base-extension', 'initialize extension');
    try {
      let initOptions = {};
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      if (this.script && this.script.init && typeof this.script.init === 'function') {
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        initOptions = this.script.init({
          rawConfig: this.rawConfig,
          dynamicConfig: this.dynamicConfig,
          api: this.api,
        });
      }
      // wrap in promise, in case a script has async init
      this.initOptions = await Promise.resolve(initOptions);
      this.initialized = true;
      // Make sure to not kill the process if an extension didn't load correctly
    } catch (err) {
      logger.error(`initialized extension ${this.name} failed`, err);
      if (throws) {
        throw new ExtensionLoadError(err, this.name);
      }
      this.initialized = false;
      return false;
    }
    return true;
  }

  extendAPI(baseApi: Record<string, any>, api: Record<string, any>): void {
    this.api = R.merge(baseApi, api);
  }

  toString(): string {
    return JSON.stringify(this, null, 2);
  }

  toBitJsonObject() {
    return {
      [this.name]: {
        rawConfig: this.rawConfig,
        options: this.options,
      },
    };
  }

  toModelObject() {
    return {
      name: this.name,
      config: this.dynamicConfig,
    };
  }

  toObject(): Record<string, any> {
    return this.toModelObject();
  }

  /**
   * Reload the extension, this mainly contain the process of going to the extension file requiring it and get the dynamic config
   * It mostly used for env extension when sometime on the first load the env didn't installed yet (only during build / test) phase
   */
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  async reload(scopePath: string, { throws }: Record<string, any>): Promise<void> {
    Analytics.addBreadCrumb('base-extension', 'reload extension');
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    if (!this.filePath && !this.options.core) {
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
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
      throws,
    });
    if (baseProps.loaded) {
      this.loaded = baseProps.loaded;
      this.script = baseProps.script;
      this.dynamicConfig = baseProps.dynamicConfig;
      await this.init();
    }
  }

  setExtensionPathInScope(scopePath: string): void {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    const { resolvedPath, componentPath } = _getExtensionPath(this.name, scopePath, this.options.core);
    this.filePath = resolvedPath;
    this.rootDir = componentPath;
  }

  static transformStringToModelObject(name: string): BaseExtensionModel {
    return {
      name,
      config: {},
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
    options = {},
    consumerPath,
    scopePath,
    throws = false,
    context,
  }: BaseLoadArgsProps): Promise<BaseExtensionProps | BaseExtension> {
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
        throws,
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
      filePath: '',
    };
    // Require extension from scope
    if (scopePath) {
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      const { resolvedPath, componentPath } = _getExtensionPath(name, scopePath, options.core);
      const nameWithVersion = _addVersionToNameFromPathIfMissing(name, componentPath, options);
      staticExtensionProps = await BaseExtension.loadFromFile({
        name: nameWithVersion,
        filePath: resolvedPath,
        rootDir: componentPath,
        rawConfig,
        options,
        throws,
      });
    }
    const extensionProps: BaseExtensionProps = { api: concreteBaseAPI, context, ...staticExtensionProps };
    return extensionProps;
  }

  static loadFromModelObjectBase(modelObject: string | BaseExtensionModel): BaseExtensionProps {
    let staticExtensionProps: StaticProps;
    if (typeof modelObject === 'string') {
      staticExtensionProps = {
        name: modelObject,
        rawConfig: {},
        dynamicConfig: {},
        options: {},
        disabled: false,
        loaded: false,
        filePath: '',
      };
    } else {
      staticExtensionProps = {
        name: modelObject.name,
        rawConfig: modelObject.config,
        dynamicConfig: modelObject.config,
        options: {},
        disabled: false,
        loaded: false,
        filePath: '',
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
    options = {},
    throws = false,
  }: BaseLoadFromFileArgsProps): Promise<StaticProps> {
    logger.debug(`base-extension, loading extension ${name} from ${filePath}`);
    const extensionProps: StaticProps = {
      name,
      rawConfig,
      dynamicConfig: rawConfig,
      options,
      disabled: false,
      loaded: false,
      filePath: '',
      rootDir: '',
    };
    // Skip disabled extensions
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    if (options.disabled) {
      extensionProps.disabled = true;
      logger.info(`skip extension ${extensionProps.name} because it is disabled`);
      extensionProps.loaded = false;
      return extensionProps;
    }
    extensionProps.filePath = filePath;
    extensionProps.rootDir = rootDir;
    const isFileExist = await fs.pathExists(filePath);
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
      const script = require(filePath); // eslint-disable-line
      extensionProps.script = script.default ? script.default : script;
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      if (extensionProps.script.getSchema && typeof extensionProps.script.getSchema === 'function') {
        // the function may or may not be a promise
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        extensionProps.schema = await Promise.resolve(extensionProps.script.getSchema());
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
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
      logger.error(`loading extension ${extensionProps.name} failed`, err);
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

  static loadDynamicConfig(extensionProps: StaticProps): Record<string, any> | null | undefined {
    logger.debug('base-extension - loadDynamicConfig');
    const getDynamicConfig = R.path(['script', 'getDynamicConfig'], extensionProps);
    if (getDynamicConfig && typeof getDynamicConfig === 'function') {
      try {
        const dynamicConfig = getDynamicConfig({
          rawConfig: extensionProps.rawConfig,
        });
        return dynamicConfig;
      } catch (err) {
        throw new ExtensionGetDynamicConfigError(err, extensionProps.name);
      }
    }
    return undefined;
  }
}

function _getExtensionPath(name: string, scopePath: string, isCore = false): ExtensionPath {
  if (isCore) {
    return _getCoreExtensionPath(name);
  }
  if (!scopePath) {
    throw new Error('base-extension._getExtensionPath expects to get scopePath');
  }
  return _getRegularExtensionPath(name, scopePath);
}

function _getCoreExtensionPath(name: string): ExtensionPath {
  const componentPath = path.join(__dirname, CORE_EXTENSIONS_PATH, name);
  return {
    resolvedPath: componentPath,
    componentPath,
  };
}

function _getRegularExtensionPath(name: string, scopePath: string): ExtensionPath {
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
      resolvedPath: typeof resolved === 'string' ? resolved : componentPath,
      componentPath,
    };
  } catch (e) {
    return {
      resolvedPath: componentPath,
      componentPath,
    };
  }
}

function _getExtensionVersionFromComponentPath(componentPath: string): string | undefined {
  const parsed = path.parse(componentPath);
  const version = parsed.base;
  if (!semver.valid(version)) {
    return undefined;
  }
  return version;
}

function _addVersionToNameFromPathIfMissing(name: string, componentPath: string, options: Record<string, any>): string {
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
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
}

const baseApi = {
  /**
   * API to get logger
   */
  getLogger: (name): Function => () => createExtensionLogger(name),
};

/**
 * Function which get actual params and return a concrete base api
 */
function _getConcreteBaseAPI({ name }: { name: string }) {
  const concreteBaseAPI = R.clone(baseApi);
  concreteBaseAPI.getLogger = baseApi.getLogger(name);
  return concreteBaseAPI;
}
