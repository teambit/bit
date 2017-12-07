/** @flow */
import { HOOKS_NAMES } from '../constants';
import logger from '../logger/logger';
import * as errors from './exceptions';

export type HookAction = {
  name: ?string,
  run: Function[]
};

export type Hooks = {
  [string]: HookAction[]
};

type HookFailures = {
  [string]: Error
};

/* 
  * Setting up block level variable to store class state
  * set's to null by default.
*/
let instance = null;

export default class HooksManager {
  hooks = new Map();

  constructor() {
    if (!instance) {
      instance = this;
    }

    return instance;
  }

  /**
   * Initialize the default hooks
   */
  static init() {
    const self = new HooksManager();
    HOOKS_NAMES.forEach(hookName => self.hooks.set(hookName, []));
  }

  /**
   * Get the instance of the HooksManager
   * @return {HooksManager} instance of the HooksManager
   *
   */
  static getInstance(): HooksManager {
    return instance;
  }

  /**
   * register new hook name
   * @param {string} hookName
   * @param {boolean} throwIfExist - whether to throw an error if the hook name already exists
   * @return {boolean} whether the hook has been registerd
   */
  registerNewHook(hookName: string, context: Object = {}, throwIfExist: boolean = false): boolean {
    if (this.hooks.has(hookName)) {
      const contextMsg = context.extension ? `from ${context.extension}` : '';
      logger.warn(`trying to register an already existing hook ${hookName} ${contextMsg}`);
      if (throwIfExist) {
        throw new errors.HookAlreadyExists(hookName);
      }
      return false;
    }
    this.hooks.set(hookName, []);
    return true;
  }

  /**
   * Register action to an existing hook
   * @param {string} hookName - hook to register action to
   * @param {HookAction} hookAction - The action to register to the hook
   * @param {boolean} throwIfNotExist - whether to throw an exception in case the hook doesn't exists
   * @return {boolean} whether the action has been registerd successfully
   */
  registerActionToHook(
    hookName: string,
    hookAction: HookAction,
    context: Object = {},
    throwIfNotExist: boolean = false
  ) {
    if (!this.hooks.has(hookName)) {
      const contextMsg = context.extension ? `from ${context.extension}` : '';
      logger.warn(`trying to register to a non existing hook ${hookName} ${contextMsg}`);
      if (throwIfNotExist) {
        throw new errors.HookNotExists(hookName);
      }
      return false;
    }
    this.hooks.get(hookName).push(hookAction);
    return true;
  }

  /**
   * Trigger a hook - run all the actions registerd to this hook
   * The actions will be run in parallel and the errors will be aggregated
   * @param {string} hookName - The hook name to trigger
   * @return {HookFailures} Aggregated errors of the actions failures
   */
  async triggerHook(hookName: string, args: Object = {}): ?(HookFailures[]) {
    const resultErrors = [];
    if (!this.hooks.has(hookName)) {
      logger.warn(`trying to trigger a non existing hook ${hookName}`);
      throw new errors.HookNotExists(hookName);
    }
    logger.info(`triggering hook ${hookName} with args: ${_stringifyIfNeeded(args)}`);
    const actions = this.hooks.get(hookName);
    const actionsP = actions.map((action) => {
      // Catch errors in order to aggregate them
      // Wrap in a promise in case the action doesn't return a promise
      return Promise.resolve()
        .then(() => {
          logger.info(`running action ${action.name} on hook ${hookName}`);
          action.run(args);
        })
        .catch((e) => {
          resultErrors.push({ [action.name]: e });
        });
    });

    await Promise.all(actionsP);
    return resultErrors;
  }
}

function _stringifyIfNeeded(val) {
  return typeof val === 'string' ? val : JSON.stringify(val);
}
