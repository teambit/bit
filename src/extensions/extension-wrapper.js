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
import GeneralError from '../error/general-error';
import { Ref, Repository } from '../scope/objects';
import { loadConsumer } from '../consumer';
import { COMPONENT_ORIGINS } from '../constants';
import Store from './context/store';
import GlobalScope from '../scope/global-scope';

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
  name: string;
  extensionEntry: ExtensionEntry;
  loaded: boolean;
  disabled: boolean;
  filePath: string;
  rootDir: string;
  config: ExtensionConfig;
  schema: ?Object;
  context: ?Object;
  persist: boolean;
  /**
   * an extension can be written as an ES6 class or ES5 pseudo-class, which have a constructor
   * or as a simple object, which doesn't have any constructor
   */
  extensionConstructor: ?Function;
  /**
   * when the extension is written as an ES6 class or ES5 pseudo-class, this variable is the
   * instantiated object, otherwise, it is the object itself.
   */
  extensionInstance: Object;

  constructor(extensionProps: BaseExtensionProps) {
    this.name = extensionProps.name;
    this.extensionEntry = extensionProps.extensionEntry;
    this.config = extensionProps.config;
    this.schema = extensionProps.schema;
    this.context = extensionProps.context;
    this.extensionConstructor = extensionProps.extensionConstructor;
    this.extensionInstance = extensionProps.extensionInstance;
    this.disabled = extensionProps.disabled;
    this.filePath = extensionProps.filePath;
    this.rootDir = extensionProps.rootDir || '';
    this.loaded = extensionProps.loaded;
    this.persist = true;
    // Make sure the default is true even when not defined
    if (extensionProps.persist === false) {
      this.persist = false;
    }
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
  static async load({ name, rawConfig = {}, context, throws = false }: BaseLoadArgsProps): Promise<ExtensionWrapper> {
    logger.debugAndAddBreadCrumb('extension-wrapper', `loading ${name}`);
    const concreteBaseAPI = _getConcreteBaseAPI({ name });
    const extensionEntry = new ExtensionEntry(name);
    // TODO: Make sure the extension already exists and if not, install it here
    if (extensionEntry.source === 'COMPONENT') {
      const bitId = BitId.parse(name, true);
      await context.globalScope.installExtensions({ ids: [{ componentId: bitId, type: 'extension' }] });
    }
    const config = ExtensionConfig.fromRawConfig(rawConfig);
    const { resolvedPath, componentPath } = _getExtensionPath(extensionEntry, context.globalScope, context.workspace);
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
    const extensionProps: BaseExtensionProps = { ...staticExtensionProps, context, extensionEntry };
    // return extensionProps;
    return new ExtensionWrapper(extensionProps);
  }

  static async loadFromModelObject(
    modelObject: { id: any, data: Ref },
    repository: Repository
  ): Promise<ExtensionWrapper> {
    logger.debugAndAddBreadCrumb('extension wrapper', 'load extension from model object');

    const extensionData = await modelObject.data.load(repository);
    if (!extensionData) throw new GeneralError(`failed loading extension ${modelObject.id} from the model`);
    const name = modelObject.id;
    const extensionEntry = new ExtensionEntry(name);
    const context = {};
    if (extensionEntry.source === 'FILE' || extensionEntry.source === 'COMPONENT') {
      // workspace is needed to find imported/authored extension components and extensions that are files
      // @todo: find a better approach. it doesn't make sense to load the consumer so many times
      const consumer = await loadConsumer();
      context.workspace = await Workspace.load(consumer);
      context.globalScope = await GlobalScope.loadWithLocalRemotes(consumer.scope);
    }
    if (extensionEntry.source === 'COMPONENT') {
      const bitId = BitId.parse(name, true);
      await context.globalScope.installExtensions({ ids: [{ componentId: bitId, type: 'extension' }] });
    }
    context.store = await Store.load(repository.scope);
    // TODO: Make sure the extension already exists
    const config = ExtensionConfig.fromModels(extensionData.data);
    const { resolvedPath, componentPath } = _getExtensionPath(extensionEntry, context.globalScope, context.workspace);
    const staticExtensionProps = await _loadFromFile({
      name,
      filePath: resolvedPath,
      rootDir: componentPath,
      config,
      context,
      loadConfigProps: false,
      throws: false // the extension might not be there yet (e.g. in case of importing a component)
    });
    const extensionProps: BaseExtensionProps = { context, ...staticExtensionProps, extensionEntry };
    return new ExtensionWrapper(extensionProps);
  }
}

const _getExtensionPath = (
  extensionEntry: ExtensionEntry,
  globalScope: ?GlobalScope,
  workspace: ?Workspace
): ExtensionPath => {
  const consumerPath = workspace ? workspace.workspacePath : '';
  if (extensionEntry.source === 'FILE') {
    return _getFileExtensionPath(extensionEntry.value, consumerPath);
  }
  if (extensionEntry.source === 'BIT_CORE') {
    return _getCoreExtensionPath(extensionEntry.value);
  }
  return _getComponentExtensionPath(extensionEntry.value, workspace, globalScope);
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
  const componentPath = `${path.join(__dirname, CORE_EXTENSIONS_PATH, name)}.js`;
  return {
    resolvedPath: componentPath,
    componentPath: undefined
  };
};

const _getComponentExtensionPath = (bitId: BitId, workspace: ?Workspace, globalScope: GlobalScope): ExtensionPath => {
  // Check if the component exists in the workspace as regular component and if yes load it from there
  const componentMap =
    workspace &&
    workspace.bitMap.getComponent(bitId, { ignoreVersion: false, ignoreScopeAndVersion: false }, { throws: false });
  if (componentMap && componentMap.origin !== COMPONENT_ORIGINS.NESTED && workspace) {
    const compRootDir = componentMap.getComponentDir();
    // Check if the component has root dir or it should be loaded from the main file
    if (compRootDir) {
      const componentPath = path.join(workspace.workspacePath, compRootDir);
      const resolved = require.resolve(componentPath);
      return {
        resolvedPath: resolved,
        componentPath
      };
    }
    const componentPath = path.join(workspace.workspacePath, componentMap.mainDistFile || componentMap.mainFile);
    const resolved = require.resolve(componentPath);
    return {
      resolvedPath: resolved,
      componentPath: undefined
    };
  }

  const componentPath = globalScope.getExtensionPath(bitId);
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
  loadConfigProps = true,
  throws = false
}: {
  filePath: string,
  rootDir: string,
  loadConfigProps: boolean,
  config: ExtensionConfig,
  throws: boolean
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

  // if (rootDir && !Environment.isExtensionInstalled(rootDir)) {
  //   extensionProps.loaded = false;
  //   return extensionProps;
  // }
  try {
    // $FlowFixMe
    const extensionFile = require(filePath); // eslint-disable-line

    extensionProps.extensionConstructor = _getConstructor(extensionFile);
    if (loadConfigProps && extensionProps.extensionConstructor) {
      await config.loadProps(
        extensionProps.extensionConstructor.propTypes,
        extensionProps.extensionConstructor.defaultProps,
        { consumerPath: context.workspace.workspacePath }
      );
    }
    const extensionInstance = extensionProps.extensionConstructor
      ? await new extensionProps.extensionConstructor(config.props, context) // eslint-disable-line new-cap
      : extensionFile;
    extensionProps.extensionInstance = extensionInstance;
    extensionProps.loaded = true;
    extensionProps.persist = true;
    // checking that it's false and not undefined because by default if it's not defined it should be true
    // for example when loading form models it should always be true
    if (extensionProps.extensionConstructor && extensionProps.extensionConstructor.persist === false) {
      extensionProps.persist = false;
    }

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

function _getConstructor(extensionFile): ?Function {
  const isConstructor = (obj: any) => {
    // not perfect, but works for most cases
    return Boolean(typeof obj === 'function' && obj.prototype && obj.prototype.constructor.name);
  };
  if (isConstructor(extensionFile.default)) return extensionFile.default;
  if (isConstructor(extensionFile)) return extensionFile;
  return undefined;
}
