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

const HooksManagerInstance = HooksManager.getInstance();

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
    registerCommand: (newCommand: NewCommand) => {
      // TODO: validate new command format
      logger.info(`registering new command ${newCommand.name}`);
      this.commands.push(new ExtensionCommand(newCommand));
    },
    registerActionToHook: (hookName: string, hookAction: HookAction) => {
      logger.info(`registering ${hookAction.name} to hook ${hookName}`);
      this.registeredHooksActions[hookName] = hookAction;
    },
    registerNewHook: (hookName: string) => {
      logger.info(`registering new global hook ${hookName}`);
      this.newHooks.push(hookName);
      // Register the new hook in the global hooks manager
      HooksManagerInstance.registerNewHook(hookName, { extension: this.name });
    },
    triggerHook: (hookName: string, args: ?Object) => {
      if (!R.contains(hookName, this.newHooks)) {
        logger.debug(`trying to trigger the hook ${hookName} which not registerd by this extension`);
        return;
      }
      HooksManagerInstance.triggerHook(hookName, args);
    },
    getLogger: () => createExtensionLogger(this.name),
    getLoader: () => loader,
    createIsolatedEnv
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

  static async load(name: string, rawConfig: Object = {}, options: Object = {}, scopePath: string): Promise<Extension> {
    // logger.info(`loading extension ${name}`);
    // Require extension from _debugFile
    if (options.file) {
      return Extension.loadFromFile(name, options.file, rawConfig, options);
    }
    // Require extension from scope
    try {
      const bitId = BitId.parse(name);
      const internalComponentsPath = Scope.getComponentsRelativePath();
      const internalComponentPath = Scope.getComponentRelativePath(bitId);
      const componentPath = path.join(scopePath, internalComponentsPath, internalComponentPath);
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

const createIsolatedEnv = async (scopePath: ?string, dirPath: ?string) => {
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
