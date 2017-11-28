/** @flow */

import R from 'ramda';
import { HOOKS_NAMES } from '../constants';
import logger from '../logger/logger';
import ExtensionCommand from './extension-command';
import IsolatedEnvironment, { IsolateOptions } from '../environment';
import { loadScope } from '../scope';
import { loadConsumer } from '../consumer';

type NewCommand = {
  name: string,
  description: string,
  action: Function
};

type RegisteredHooks = {
  [string]: Function
};

type Commands = {
  [string]: NewCommand
};

export type ExtensionProps = {
  name: string,
  registeredHooks: RegisteredHooks,
  commands?: Commands,
  rawConfig: Object,
  dynamicConfig: Object
};

export default class Extension {
  // TODO: Validate the key against hooks list
  name: string;
  disabled: boolean;
  filePath: string;
  registeredHooks: RegisteredHooks;
  commands: Commands;
  rawConfig: Object;
  dynamicConfig: Object;
  script: Function; // Store the required plugin
  api = {
    registerCommand: (newCommand: NewCommand) => {
      // TODO: validate new command format
      logger.info(`registering new command ${newCommand.name}`);
      this.commands.push(new ExtensionCommand(newCommand));
    },
    registerToHook: (hookName: string, hookAction: Function) => {
      logger.info(`registering to hook ${hookName}`);
      this.registeredHooks[hookName] = hookAction;
    },
    createIsolatedEnv
  };

  constructor(extensionProps: ExtensionProps) {
    this.name = extensionProps.name;
    this.rawConfig = extensionProps.rawConfig;
    this.dynamicConfig = extensionProps.rawConfig;
    this.commands = [];
    this.registeredHooks = {};
  }

  static load(name: string, rawConfig: Object): Extension {
    logger.debug(`loading extension ${name}`);
    const extension = new Extension({ name, rawConfig });
    // Skip disabled extensions
    if (rawConfig.disabled) {
      extension.disabled = true;
      logger.debug(`skip extension ${name} because it is disabled`);
      return extension;
    }
    // Require extension from _debugFile
    if (process.env.DEBUG_EXTENSIONS && rawConfig._debugFile) {
      extension.filePath = rawConfig._debugFile;
      try {
        const script = require(rawConfig._debugFile);
        extension.script = script.default ? script.default : script;
        if (extension.script.getDynamicConfig && typeof extension.script.getDynamicConfig === 'function') {
          extension.dynamicConfig = extension.script.getDynamicConfig(rawConfig);
        }
        if (extension.script.init && typeof extension.script.init === 'function') {
          extension.script.init(rawConfig, extension.dynamicConfig, extension.api);
        }
        // Make sure to not kill the process if an extension didn't load correctly
      } catch (err) {
        if (err.code === 'MODULE_NOT_FOUND') {
          const msg = `loading extension ${name} faild, the file ${rawConfig._debugFile} not found`;
          logger.error(msg);
          console.log(msg);
        }
        logger.error(err);
        return extension;
      }
    }
    return extension;
    // Require extension from scope
  }

  registerToHook(hookName: string, callback: Function) {
    // Validate hook name
    if (!R.contains(hookName, HOOKS_NAMES)) {
      logger.info(`Extension ${this.name} tried to register to unknown hook: ${hookName}`);
      return;
    }
    this.registeredHooks[hookName] = callback;
  }

  registerNewCommand(commandName: string, command: NewCommand) {
    this.commands[commandName] = command;
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
