/** @flow */

import path from 'path';
import R from 'ramda';
import logger, { createExtensionLogger } from '../logger/logger';
import { Scope } from '../scope';
import { BitId } from '../bit-id';

const CORE_EXTENSIONS_PATH = './core-extensions';

export type BaseExtensionOptions = {
  file?: string
};

type BaseArgs = {
  name: string,
  rawConfig: Object,
  options: BaseExtensionOptions
};

export type BaseLoadArgsProps = BaseArgs & {
  consumerPath?: ?string,
  scopePath?: ?string
};

type StaticProps = BaseArgs & {
  dynamicConfig: Object,
  filePath: string,
  script: Function,
  disabled: boolean,
  loaded: boolean
};

type InstanceSpecificProps = {
  api: Object
};

export type BaseExtensionProps = InstanceSpecificProps & StaticProps;

export type BaseExtensionModel = {
  name: string,
  config: Object
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
  rawConfig: Object;
  options: Object;
  dynamicConfig: Object;
  script: Function; // Store the required plugin
  api = _getConcreteBaseAPI({ name: this.name });

  constructor(extensionProps: BaseExtensionProps) {
    this.name = extensionProps.name;
    this.rawConfig = extensionProps.rawConfig;
    this.options = extensionProps.options;
    this.dynamicConfig = extensionProps.dynamicConfig || extensionProps.rawConfig;
    this.script = extensionProps.script;
    this.disabled = extensionProps.disabled;
    this.filePath = extensionProps.filePath;
    this.loaded = extensionProps.loaded;
    this.api = extensionProps.api;
  }

  /**
   * Run the extension's init function
   */
  async init(): Promise<boolean> {
    try {
      if (this.script.init && typeof this.script.init === 'function') {
        await this.script.init(this.rawConfig, this.dynamicConfig, this.api);
      }
      this.initialized = true;
      // Make sure to not kill the process if an extension didn't load correctly
    } catch (err) {
      logger.error(`initialized extension ${this.name} failed`);
      logger.error(err);
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

  /**
   * Reload the extension, this mainly contain the process of going to the extension file requiring it and get the dynamic config
   * It mostly used for env extension when sometime on the first load the env didn't installed yet (only during build / test) phase
   */
  async reload(): Promise<void> {
    const baseProps = await BaseExtension.loadFromFile(this.name, this.filePath, this.rawConfig, this.options);
    if (baseProps.loaded) {
      this.loaded = baseProps.loaded;
      this.script = baseProps.script;
      this.dynamicConfig = baseProps.dynamicConfig;
    }
  }

  setExtensionPathInScope(scopePath: string): void {
    const componentPath = _getExtensionPath(this.name, scopePath, this.options.core);
    this.filePath = componentPath;
  }

  static transformStringToModelObject(name: string) {
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
    options = {},
    consumerPath,
    scopePath
  }: BaseLoadArgsProps): Promise<BaseExtensionProps> {
    // logger.info(`loading extension ${name}`);
    // Require extension from _debugFile
    const concreteBaseAPI = _getConcreteBaseAPI({ name });
    if (options.file) {
      let absPath = options.file;
      if (!path.isAbsolute(options.file) && consumerPath) {
        absPath = path.resolve(consumerPath, options.file);
      }
      const staticExtensionProps: StaticProps = await BaseExtension.loadFromFile(name, absPath, rawConfig, options);
      const extensionProps: BaseExtensionProps = { api: concreteBaseAPI, ...staticExtensionProps };
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
      const componentPath = _getExtensionPath(name, scopePath, options.core);
      staticExtensionProps = await BaseExtension.loadFromFile(name, componentPath, rawConfig, options);
    }
    const extensionProps: BaseExtensionProps = { api: concreteBaseAPI, ...staticExtensionProps };
    return extensionProps;
  }

  static loadFromModelObject(modelObject) {
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

    const concreteBaseAPI = _getConcreteBaseAPI({ name: modelObject.name });
    const extensionProps: BaseExtensionProps = { api: concreteBaseAPI, ...staticExtensionProps };
    return extensionProps;
  }

  static async loadFromFile(
    name: string,
    filePath: string,
    rawConfig: Object = {},
    options: Object = {}
  ): Promise<StaticProps> {
    logger.info(`loading extension ${name} from ${filePath}`);
    const extensionProps: StaticProps = {
      name,
      rawConfig,
      dynamicConfig: rawConfig,
      options,
      disabled: false,
      loaded: false,
      filePath: ''
    };
    // Skip disabled extensions
    if (options.disabled) {
      extensionProps.disabled = true;
      logger.info(`skip extension ${extensionProps.name} because it is disabled`);
      extensionProps.loaded = false;
      return extensionProps;
    }
    extensionProps.filePath = filePath;
    try {
      // $FlowFixMe
      const script = require(filePath); // eslint-disable-line
      extensionProps.script = script.default ? script.default : script;
      if (extensionProps.script.getDynamicConfig && typeof extensionProps.script.getDynamicConfig === 'function') {
        extensionProps.dynamicConfig = await extensionProps.script.getDynamicConfig(rawConfig);
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
      return extensionProps;
    }
    extensionProps.loaded = true;
    return extensionProps;
  }
}

const _getExtensionPath = (name: string, scopePath: ?string, isCore: boolean = false): string => {
  if (isCore) {
    return _getCoreExtensionPath(name);
  }
  if (!scopePath) {
    throw new Error('scope not found');
  }
  return _getRegularExtensionPath(name, scopePath);
};

const _getCoreExtensionPath = (name: string): string => {
  const componentPath = path.join(__dirname, CORE_EXTENSIONS_PATH, name);
  return componentPath;
};

const _getRegularExtensionPath = (name: string, scopePath: string): string => {
  const bitId: BitId = BitId.parse(name);
  const internalComponentsPath = Scope.getComponentsRelativePath();
  const internalComponentPath = Scope.getComponentRelativePath(bitId);
  const componentPath = path.join(scopePath, internalComponentsPath, internalComponentPath);
  try {
    // This might throw an error in case of imported component when the env
    // isn't installed yet
    // It will be handled in higher functions
    const resolved = require.resolve(componentPath);
    return resolved;
  } catch (e) {
    return componentPath;
  }
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
