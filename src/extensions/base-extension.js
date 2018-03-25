/** @flow */

import path from 'path';
import R from 'ramda';
import logger, { createExtensionLogger } from '../logger/logger';
import { Scope } from '../scope';
import { BitId } from '../bit-id';

const CORE_EXTENSIONS_PATH = './core-extensions';

// export type BaseExtensionProps = {
//   name: string,
//   rawConfig: Object,
//   options: Object,
//   dynamicConfig?: Object,
//   script: Function,
//   disabled: boolean,
//   filePath: string,
//   loaded: boolean,
//   api: Object
// };

type BaseArgs = {
  name: string,
  rawConfig: Object,
  options: Object
};

export type BaseLoadArgsProps = BaseArgs & {
  consumerPath?: ?string,
  scopePath?: ?string
};

type StaticProps = BaseArgs & {
  dynamicConfig?: Object,
  filePath: string,
  script: Function,
  disabled: boolean,
  loaded: boolean
};
// type StaticProps = {
//     dynamicConfig?: Object,
//     filePath: string,
//     script: Function,
//     disabled: boolean,
//     loaded: boolean,
//     ...BaseLoadArgsProps
//   }

type InstanceSpecificProps = {
  api: Object
};

export type BaseExtensionProps = InstanceSpecificProps & StaticProps;
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

  extendAPI(api: Object): void {
    this.api = R.merge(this.api, api);
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
    // Require extension from scope
    const componentPath = _getExtensionPath(name, scopePath, options.core);
    const staticExtensionProps: StaticProps = await BaseExtension.loadFromFile(name, componentPath, rawConfig, options);
    const extensionProps: BaseExtensionProps = { api: concreteBaseAPI, ...staticExtensionProps };
    extensionProps.api = concreteBaseAPI;
    return extensionProps;
  }

  static async loadFromFile(
    name: string,
    filePath: string,
    rawConfig: Object = {},
    options: Object = {}
  ): Promise<StaticProps> {
    logger.info(`loading extension ${name} from ${filePath}`);
    const extensionProps: StaticProps = { name, rawConfig, options, disabled: false, loaded: false, filePath: '' };
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
        logger.error(msg);
        console.error(msg); // eslint-disable-line no-console
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
  return componentPath;
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
