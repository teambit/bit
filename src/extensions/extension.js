/** @flow */

import R from 'ramda';
import { HOOKS_NAMES } from '../constants';
import logger from '../logger/logger';

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
  filePath: string;
  registeredHooks: RegisteredHooks;
  commands: Commands;
  rawConfig: Object;
  dynamicConfig: Object;
  script: Function; // Store the required plugin
  api = {
    registerCommand: (newCommand: NewCommand) => {
      logger.info(`registering new command ${newCommand.name}`);
      this.commands.push(newCommand);
    },
    registerToHook: (hookName: string, hookAction: Function) => {
      logger.info(`registering to hook ${hookName}`);
      this.registeredHooks[hookName] = hookAction;
    }
  };

  constructor(extensionProps: ExtensionProps) {
    this.name = extensionProps.name;
    this.rawConfig = extensionProps.rawConfig;
    this.dynamicConfig = extensionProps.rawConfig;
    this.commands = [];
  }

  static load(name: string, rawConfig: Object): Extension {
    logger.debug(`loading extension ${name}`);
    const extension = new Extension({ name, rawConfig });
    // Require extension from _debugFile
    if (process.env.DEBUG_EXTENSIONS && rawConfig._debugFile) {
      extension.filePath = rawConfig._debugFile;
      try {
        const script = require(rawConfig._debugFile);
        extension.script = script.default ? script.default : script;
        if (extension.script.getDynamicConfig && typeof extension.script.getDynamicConfig === 'function') {
          extension.dynamicConfig = extension.script.getDynamicConfig(rawConfig);
        }
        // console.log(extension);
        if (extension.script.init && typeof extension.script.init === 'function') {
          extension.script.init(rawConfig, extension.dynamicConfig, extension.api);
        }
      } catch (err) {
        if (err.code === 'MODULE_NOT_FOUND') {
          const msg = `loading extension ${name} faild, the file ${rawConfig._debugFile} not found`;
          logger.error(msg);
          console.log(msg);
        }
        logger.error(err);
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
