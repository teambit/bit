import R from 'ramda';
import BaseExtension from './base-extension';
import { BaseExtensionProps, BaseLoadArgsProps, BaseExtensionOptions } from './base-extension';
import logger from '../logger/logger';
import ExtensionCommand from './extension-command';
import IsolatedEnvironment from '../environment';
import { loadScope } from '../scope';
import { Consumer, loadConsumer } from '../consumer';
import loader from '../cli/loader';
import HooksManager, { HookAction } from '../hooks';
import { HOOKS_NAMES } from '../constants';

const HooksManagerInstance: HooksManager = HooksManager.getInstance();

type NewCommand = {
  name: string;
  description: string;
  action: Function;
};

type RegisteredHooksActions = {
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  [string]: HookAction;
};

export type Commands = {
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  [string]: NewCommand;
};

export type ExtensionProps = BaseExtensionProps & {
  newHooks?: string[];
  registeredHooksActions?: RegisteredHooksActions;
  commands?: Array<Commands>;
};

export type ExtensionOptions = BaseExtensionOptions & {
  core?: boolean;
  disabled?: boolean;
};

export type LoadArgsProps = BaseLoadArgsProps;

// export type { ExtensionProps };

/**
 * A class which represent an extension
 * The different attributes,
 * Extension API,
 * Load extension
 * Config
 */
export default class Extension extends BaseExtension {
  registeredHooksActions: RegisteredHooksActions;
  newHooks: string[];
  commands: Array<Commands>;
  api = {
    /**
     * API to resiter new command to bit
     */
    registerCommand: (newCommand: NewCommand): void => {
      // TODO: validate new command format
      logger.info(`registering new command ${newCommand.name}`);
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
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
    triggerHook: (hookName: string, args: Object | null | undefined) => {
      if (!R.contains(hookName, this.newHooks)) {
        logger.debug(`trying to trigger the hook ${hookName} which not registered by this extension`);
        return;
      }
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      HooksManagerInstance.triggerHook(hookName, args);
    },
    getLoader: () => loader,
    HOOKS_NAMES: _getHooksNames(),
    createIsolatedEnv: _createIsolatedEnv,
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    ...super.api,
  };

  constructor(extensionProps: ExtensionProps) {
    super(extensionProps);
    this.extendAPI(extensionProps.api, this.api);
    this.commands = extensionProps.commands || [];
    this.registeredHooksActions = extensionProps.registeredHooksActions || {};
    this.newHooks = extensionProps.newHooks || [];
  }

  /**
   * Load extension by name
   * The extension will be from scope by default or from file
   * if there is file(path) in the options
   * The file path is relative to the bit.json of the project or absolute
   * @param {string} props - loading properties with the following fields:
   * {string} name - name of the extension
   * {Object} rawConfig - raw config for the extension
   * {Object} options - extension options such as - disabled, file, core
   * {string} consumerPath - path to the consumer folder (to load the file relatively)
   * {string} scopePath - scope which stores the extension code
   */
  static async load(props: LoadArgsProps): Promise<Extension> {
    props.rawConfig = props.rawConfig || {};
    props.options = props.options || {};
    const baseExtensionProps = (await super.load(props)) as BaseExtensionProps;
    // const extensionProps: ExtensionProps = ((await super.load(props): BaseExtensionProps): ExtensionProps);
    // const extensionProps: ExtensionProps = (baseExtensionProps: ExtensionProps);
    const extensionProps: ExtensionProps = {
      commands: [],
      registeredHooksActions: {},
      newHooks: [],
      ...baseExtensionProps,
    };
    const dynamicConfig = BaseExtension.loadDynamicConfig(extensionProps);
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    extensionProps.dynamicConfig = dynamicConfig;
    const extension: Extension = new Extension(extensionProps);
    if (extension.loaded) {
      await extension.init();
    }
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

const _createIsolatedEnv = async (scopePath: string, dirPath: string | null | undefined) => {
  const scope = await _loadScope(scopePath);
  const isolatedEnvironment = new IsolatedEnvironment(scope, dirPath);
  await isolatedEnvironment.create();
  return isolatedEnvironment;
};

const _loadScope = async (scopePath: string | null | undefined) => {
  // If a scope path provided we will take the component from that scope
  if (scopePath) {
    return loadScope(scopePath);
  }
  // If a scope path was not provided we will get the consumer's scope
  const consumer: Consumer = await loadConsumer();
  return consumer.scope;
};

const _getHooksNames = () => {
  const hooks = {};
  HOOKS_NAMES.forEach((hook) => {
    hooks[hook] = hook;
  });
  return hooks;
};
