/** @flow */

import path from 'path';
import R from 'ramda';
import fs from 'fs-extra';
import semver from 'semver';
import logger, { createExtensionLogger } from '../logger/logger';
import { Scope } from '../scope';
import { ScopeNotFound } from '../scope/exceptions';
import { BitId } from '../bit-id';
import ExtensionNameNotValid from './exceptions/extension-name-not-valid';
import { Analytics } from '../analytics/analytics';
import ExtensionLoadError from './exceptions/extension-load-error';
import Environment from '../environment';
import ExtensionSchemaError from './exceptions/extension-schema-error';
import ExtensionEntry from './extension-entry';
import ExtensionConfig from './extension-config';
import ExtensionInvalidConfig from './exceptions/extension-invalid-config';
import { Extension } from 'typescript';
import Workspace from './context/workspace';

const CORE_EXTENSIONS_PATH = './core-extensions';

export type ExtensionLoadContext = {
  workspace: ?Workspace
};

export type ExtensionLoadProps = {
  name: string,
  rawConfig: Object,
  context: ExtensionLoadContext,
  throws: boolean
};

export default class ExtensionWrapper {
  name: ExtensionEntry;
  loaded: boolean;
  disabled: boolean;
  filePath: string;
  rootDir: string;
  config: ExtensionConfig;
  schema: ?Object;
  context: ?Object;
  extensionConstructor: ?Function; // Store the required plugin

  constructor(extensionProps: BaseExtensionProps) {
    this.name = extensionProps.name;
    this.config = extensionProps.config;
    this.schema = extensionProps.schema;
    this.context = extensionProps.context;
    this.extensionConstructor = extensionProps.extensionConstructor;
    this.disabled = extensionProps.disabled;
    this.filePath = extensionProps.filePath;
    this.rootDir = extensionProps.rootDir || '';
    this.loaded = extensionProps.loaded;
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

  // TODO: try to not really implement both toModelObject and toObject
  // (gilad) There is reason beyond having both i don't remember exactly but can find if needed
  toModelObject() {}

  toObject() {}

  static transformStringToModelObject(name: string): BaseExtensionModel {}

  /**
   * Load extension by name
   * The extension will be from scope by default or from file
   * if there is file(path) in the options
   * The file path is relative to the bit.json of the project or absolute
   * @param {string} name - name of the extension
   * @param {Object} rawConfig - raw config for the extension
   * @param {Object} rawConfig - raw config for the extension
   * @param {Object} context - additional context for extension loading (Workspace, Scope)
   * @param {boolean} throws - throw exception if load failed
   */
  static async load({ name, rawConfig = {}, context, throws = false }: BaseLoadArgsProps): Promise<BaseExtensionProps> {
    logger.debugAndAddBreadCrumb('extension-wrapper', `loading ${name}`);
    const concreteBaseAPI = _getConcreteBaseAPI({ name });
    const extensionEntry = new ExtensionEntry(name);
    const consumerPath = context.workspace && context.workspace.workspacePath;
    // TODO: Make sure the extension already exists
    const config = ExtensionConfig.fromRawConfig(rawConfig);
    const { resolvedPath, componentPath } = _getExtensionPath(extensionEntry, context.scopePath, consumerPath);
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
    const extensionProps: BaseExtensionProps = { ...staticExtensionProps, context };
    // return extensionProps;
    return new ExtensionWrapper(extensionProps);
  }

  static loadFromModelObject(modelObject: string | BaseExtensionModel) {
    logger.debugAndAddBreadCrumb('extension wrapper', 'load extension from model object');
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
}: {
  config: ExtensionConfig
}): Promise<StaticProps> => {
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
      { consumerPath: context.workspace.workspacePath }
    );
    const extension = await new extensionProps.ExtensionConstructor(config.props, context);
    extensionProps.extension = extension;
    extensionProps.loaded = true;

    // const extension =

    // Make sure to not kill the process if an extension didn't load correctly
  } catch (err) {
    console.log(err);
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
