/** @flow */
import path from 'path';
import R from 'ramda';
import { GIT_HOOKS_NAMES } from '../constants';
import logger from '../logger/logger';
import GitHook from './git-hook';
import bitImportGitHook from './fixtures/bit-import-git-hook';

const HOOKS_DIR_NAME = 'hooks';

/*
  * Setting up block level variable to store class state
  * set's to null by default.
*/
let instance = null;

/**
 * A class which manage all the git hooks
 * This is a singleton class which expose getInstance method
 * This class used for add new git hooks
 */
export default class GitHooksManager {
  basePath: string; // path to the .git dir
  hooks: Map<hookName, GitHook> = new Map();

  constructor(basePath: string) {
    this.basePath = basePath;
    if (!instance) {
      instance = this;
    }

    return instance;
  }

  get hooksDirPath(): string {
    return path.join(this.basePath, HOOKS_DIR_NAME);
  }

  /**
   * Initialize the default hooks
   */
  static init(basePath: string) {
    const self = new GitHooksManager(basePath);
    GIT_HOOKS_NAMES.forEach((hookName) => {
      const hook = new GitHook(self.hooksDirPath, hookName, bitImportGitHook);
      self.hooks.set(hookName, hook);
    });
    return self;
  }

  writeAllHooks() {
    const alreadyExist = [];
    const added = [];
    this.hooks.forEach((hook, hookName) => {
      const result = hook.writeSync();
      if (result) {
        added.push(hookName);
      } else {
        alreadyExist.push(hookName);
      }
    });
    return {
      added,
      alreadyExist
    };
  }

  /**
   * Get the instance of the HooksManager
   * @return {GitHooksManager} instance of the GitHooksManager
   *
   */
  static getInstance(): GitHooksManager | null | undefined {
    return instance;
  }
}
