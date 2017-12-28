/** @flow */

import path from 'path';
import R from 'ramda';
import logger, { createExtensionLogger } from '../logger/logger';
import ExtensionCommand from './extension-command';
import IsolatedEnvironment from '../environment';
import { Scope, loadScope } from '../scope';
import { loadConsumer } from '../consumer';
import { BitId } from '../bit-id';
import loader from '../cli/loader';
import HooksManager, { HookAction } from '../hooks';
import { HOOKS_NAMES } from '../constants';

const HooksManagerInstance = HooksManager.getInstance();
const DEFAULT_EXTENSIONS_PATH = './default-extensions';

type NewCommand = {
  name: string,
  description: string,
  action: Function
};

type RegisteredHooksActions = {
  [string]: HookAction
};

type Commands = {
  [string]: NewCommand
};

export type ExtensionProps = {
  name: string,
  registeredHooksActions: RegisteredHooksActions,
  commands?: Commands,
  rawConfig: Object,
  dynamicConfig: Object
};

/**
 * A class which represent an extension
 * The different attributes,
 * Extension API,
 * Load extension
 * Config
 */
export default class Extension {
  name: string;
  loaded: boolean;
  disabled: boolean;
  filePath: string;
  registeredHooksActions: RegisteredHooksActions;
  newHooks: string[];
  commands: Commands;
  rawConfig: Object;
  options: Object;
  dynamicConfig: Object;
  script: Function; // Store the required plugin
  api = {
    /**
     * API to resiter new command to bit
     */
    registerCommand: (newCommand: NewCommand) => {
      // TODO: validate new command format
      logger.info(`registering new command ${newCommand.name}`);
      this.commands.push(new ExtensionCommand(newCommand));
    },
    /**
     * API to register action to an existing hook (hook name might be a hook defined by another extension)
     */
    registerActionToHook: (hookName: string, hookAction: HookAction) => {
      logger.info(`registering ${hookAction.name} to hook ${hookName}`);
      this.registeredHooksActions[hookName] = hookAction;
    },
    /**
     * API to register a new hook name, usuful for communicate between different extensions
     */
    registerNewHook: (hookName: string) => {
      logger.info(`registering new global hook ${hookName}`);
      this.newHooks.push(hookName);
      // Register the new hook in the global hooks manager
      HooksManagerInstance.registerNewHook(hookName, { extension: this.name });
    },
    /**
     * API to trigger a hook registered by this extension.
     * trigger hook are available only for hooks registered by you.
     */
    triggerHook: (hookName: string, args: ?Object) => {
      if (!R.contains(hookName, this.newHooks)) {
        logger.debug(`trying to trigger the hook ${hookName} which not registerd by this extension`);
        return;
      }
      HooksManagerInstance.triggerHook(hookName, args);
    },
    /**
     * API to get logger
     */
    getLogger: () => createExtensionLogger(this.name),
    getLoader: () => loader,
    HOOKS_NAMES: _getHooksNames(),
    createIsolatedEnv: _createIsolatedEnv
  };

  constructor(extensionProps: ExtensionProps) {
    this.name = extensionProps.name;
    this.rawConfig = extensionProps.rawConfig;
    this.options = extensionProps.options;
    this.dynamicConfig = extensionProps.rawConfig;
    this.commands = [];
    this.registeredHooksActions = {};
    this.newHooks = [];
  }

  /**
   * Load extension by name
   * The extension will be from scope by default or from file
   * if there is file(path) in the options
   * The file path is relative to the bit.json of the project or absolute
   * @param {string} name - name of the extension
   * @param {Object} rawConfig - raw config for the extension
   * @param {Object} options - extension options such as - disabled, file, default
   * @param {string} consumerPath - path to the consumer folder (to load the file relatively)
   * @param {string} scopePath - scope which stores the extension code
   */
  static async load(
    name: string,
    rawConfig: Object = {},
    options: Object = {},
    consumerPath: string,
    scopePath: string
  ): Promise<Extension> {
    // logger.info(`loading extension ${name}`);
    // Require extension from _debugFile
    if (options.file) {
      let absPath = options.file;
      if (!path.isAbsolute(options.file)) {
        absPath = path.resolve(consumerPath, options.file);
      }
      return Extension.loadFromFile(name, absPath, rawConfig, options);
    }
    // Require extension from scope
    try {
      const componentPath = _getExtensionPath(name, scopePath, options.default);
      return Extension.loadFromFile(name, componentPath, rawConfig, options);
    } catch (err) {
      logger.error(`loading extension ${name} faild`);
      logger.error(err);
      return null;
    }
  }

  static async loadFromFile(name: string, filePath: string, rawConfig: Object = {}, options: Object = {}): Extension {
    logger.info(`loading extension ${name} from ${filePath}`);
    const extension = new Extension({ name, rawConfig, options });
    // Skip disabled extensions
    if (options.disabled) {
      extension.disabled = true;
      logger.info(`skip extension ${name} because it is disabled`);
      extension.loaded = false;
      return extension;
    }
    extension.filePath = filePath;
    try {
      const script = require(filePath);
      extension.script = script.default ? script.default : script;
      if (extension.script.getDynamicConfig && typeof extension.script.getDynamicConfig === 'function') {
        extension.dynamicConfig = await extension.script.getDynamicConfig(rawConfig);
      }
      if (extension.script.init && typeof extension.script.init === 'function') {
        await extension.script.init(rawConfig, extension.dynamicConfig, extension.api);
      }
      // Make sure to not kill the process if an extension didn't load correctly
    } catch (err) {
      if (err.code === 'MODULE_NOT_FOUND') {
        const msg = `loading extension ${name} faild, the file ${filePath} not found`;
        logger.error(msg);
        console.error(msg);
      }
      logger.error(`loading extension ${name} faild`);
      logger.error(err);
      extension.loaded = false;
      return extension;
    }
    extension.loaded = true;
    return extension;
  }

  /**
   * Register the hooks on the global hooks manager
   * We don't do this directly on the api in order to be able to register to hooks defined by another extensions
   * So we want to make sure to first load and register all new hooks from all extensions and only then register the actions
   */
  registerHookActionsOnHooksManager() {
    const registerAction = (hookAction: HookAction, hookName: string) => {
      HooksManagerInstance.registerActionToHook(hookName, hookAction, { extension: this.name });
    };
    R.forEachObjIndexed(registerAction, this.registeredHooksActions);
  }
}

const _createIsolatedEnv = async (scopePath: string, dirPath: ?string) => {
  const scope = await _loadScope(scopePath);
  const isolatedEnvironment = new IsolatedEnvironment(scope, dirPath);
  await isolatedEnvironment.create();
  return isolatedEnvironment;
};

const _loadScope = async (scopePath: ?string) => {
  // If a scope path provided we will take the component from that scope
  if (scopePath) {
    return loadScope(scopePath);
  }
  // If a scope path was not provided we will get the consumer's scope
  const consumer = await loadConsumer();
  return consumer.scope;
};

const _getDefaultExtensionPath = (name: string): string => {
  const componentPath = path.join(__dirname, DEFAULT_EXTENSIONS_PATH, name);
  return componentPath;
};

const _getRegularExtensionPath = (name: string, scopePath: string): string => {
  const bitId = BitId.parse(name);
  const internalComponentsPath = Scope.getComponentsRelativePath();
  const internalComponentPath = Scope.getComponentRelativePath(bitId);
  const componentPath = path.join(scopePath, internalComponentsPath, internalComponentPath);
  return componentPath;
};

const _getExtensionPath = (name: string, scopePath: string, isDefault: boolean = false): string => {
  if (isDefault) {
    return _getDefaultExtensionPath(name);
  }
  return _getRegularExtensionPath(name, scopePath);
};

const _getHooksNames = () => {
  const hooks = {};
  HOOKS_NAMES.forEach((hook) => {
    hooks[hook] = hook;
  });
  return hooks;
};
