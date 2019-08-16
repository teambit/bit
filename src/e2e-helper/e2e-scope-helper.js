// @flow
/* eslint no-console: 0 */

import chalk from 'chalk';
import path from 'path';
import fs from 'fs-extra';
import { generateRandomStr } from './e2e-helper';
import type { InteractiveInputs } from '../interactive/utils/run-interactive-cmd';
import CommandHelper from './e2e-command-helper';
import FsHelper from './e2e-fs-helper';
import ScopesData from './e2e-scopes';

export default class ScopeHelper {
  debugMode: boolean;
  scopes: ScopesData;
  e2eDir: string;
  command: CommandHelper;
  fs: FsHelper;
  cache: Object;
  keepEnvs: boolean;
  clonedScopes: string[] = [];
  constructor(debugMode: boolean, scopes: ScopesData, commandHelper: CommandHelper, fsHelper: FsHelper) {
    this.keepEnvs = !!process.env.npm_config_keep_envs; // default = false
    this.scopes = scopes;
    this.command = commandHelper;
    this.fs = fsHelper;
  }
  cleanEnv() {
    fs.emptyDirSync(this.scopes.localScopePath);
    fs.emptyDirSync(this.scopes.remoteScopePath);
  }

  destroyEnv() {
    if (this.keepEnvs) return;
    fs.removeSync(this.scopes.localScopePath);
    fs.removeSync(this.scopes.remoteScopePath);
    if (this.cache) {
      fs.removeSync(this.cache.localScopePath);
      fs.removeSync(this.cache.remoteScopePath);
      delete this.cache;
    }
    if (this.clonedScopes && this.clonedScopes.length) {
      this.clonedScopes.forEach(scopePath => fs.removeSync(scopePath));
    }
    this.fs.cleanExternalDirs();
  }
  cleanLocalScope() {
    fs.emptyDirSync(this.scopes.localScopePath);
  }

  reInitLocalScope() {
    this.cleanLocalScope();
    this.initLocalScope();
  }

  initLocalScope() {
    return this.initWorkspace();
  }

  initWorkspace(workspacePath?: string) {
    // return this.command.runCmd('bit init -N', workspacePath);
    return this.command.runCmd('bit init', workspacePath);
  }

  async initInteractive(inputs: InteractiveInputs) {
    // $FlowFixMe
    return this.command.runInteractiveCmd({ args: ['init', '--interactive'], inputs });
  }

  initLocalScopeWithOptions(options: Object) {
    const value = Object.keys(options)
      .map(key => `-${key} ${options[key]}`)
      .join(' ');
    return this.command.runCmd(`bit init ${value}`);
  }
  setNewLocalAndRemoteScopes() {
    if (!this.cache) {
      this.reInitLocalScope();
      this.reInitRemoteScope();
      this.addRemoteScope();
      this.cache = {
        localScopePath: path.join(this.scopes.e2eDir, generateRandomStr()),
        remoteScopePath: path.join(this.scopes.e2eDir, generateRandomStr())
      };
      if (this.debugMode) {
        console.log(
          chalk.green(
            `not in the cache. cloning a scope from ${this.scopes.localScopePath} to ${this.cache.localScopePath}`
          )
        );
      }
      fs.copySync(this.scopes.localScopePath, this.cache.localScopePath);
      fs.copySync(this.scopes.remoteScopePath, this.cache.remoteScopePath);
    } else {
      if (this.debugMode) {
        console.log(chalk.green(`cloning a scope from ${this.cache.localScopePath} to ${this.scopes.localScopePath}`));
      }
      fs.removeSync(this.scopes.localScopePath);
      fs.removeSync(this.scopes.remoteScopePath);
      fs.copySync(this.cache.localScopePath, this.scopes.localScopePath);
      fs.copySync(this.cache.remoteScopePath, this.scopes.remoteScopePath);
    }
  }

  initNewLocalScope(deleteCurrentScope: boolean = true) {
    if (deleteCurrentScope) {
      fs.removeSync(this.scopes.localScopePath);
    }
    this.scopes.setLocalScope();
    fs.ensureDirSync(this.scopes.localScopePath);
    return this.initLocalScope();
  }
  addRemoteScope(
    remoteScopePath: string = this.scopes.remoteScopePath,
    localScopePath: string = this.scopes.localScopePath,
    isGlobal: boolean = false
  ) {
    const globalArg = isGlobal ? '-g' : '';
    if (process.env.npm_config_with_ssh) {
      return this.command.runCmd(
        `bit remote add ssh://\`whoami\`@127.0.0.1:/${remoteScopePath} ${globalArg}`,
        localScopePath
      );
    }
    return this.command.runCmd(`bit remote add file://${remoteScopePath} ${globalArg}`, localScopePath);
  }

  removeRemoteScope(remoteScope: string = this.scopes.remoteScope, isGlobal: boolean = false) {
    const globalArg = isGlobal ? '-g' : '';
    return this.command.runCmd(`bit remote del ${remoteScope} ${globalArg}`);
  }

  addRemoteEnvironment(isGlobal: boolean = false) {
    return this.addRemoteScope(this.scopes.envScopePath, this.scopes.localScopePath, isGlobal);
  }

  removeRemoteEnvironment(isGlobal: boolean = false) {
    return this.removeRemoteScope(this.scopes.envScope, isGlobal);
  }

  reInitRemoteScope() {
    fs.emptyDirSync(this.scopes.remoteScopePath);
    return this.command.runCmd('bit init --bare', this.scopes.remoteScopePath);
  }

  /**
   * useful when publishing to a local npm registry so then multiple tests in the same file
   * won't collide in the @ci registry
   */
  setRemoteScopeAsDifferentDir() {
    fs.removeSync(this.scopes.remoteScopePath);
    this.scopes.setRemoteScope();
    this.reInitRemoteScope();
    this.addRemoteScope();
  }

  reInitEnvsScope() {
    fs.emptyDirSync(this.scopes.envScopePath);
    return this.command.runCmd('bit init --bare', this.scopes.envScopePath);
  }

  getNewBareScope(scopeNameSuffix?: string = '-remote2') {
    const scopeName = generateRandomStr() + scopeNameSuffix;
    const scopePath = path.join(this.scopes.e2eDir, scopeName);
    fs.emptyDirSync(scopePath);
    this.command.runCmd('bit init --bare', scopePath);
    this.addRemoteScope(this.scopes.remoteScopePath, scopePath);
    return { scopeName, scopePath };
  }
  /**
   * Sometimes many tests need to do the exact same steps to init the local-scope, such as importing compiler/tester.
   * To make it faster, use this method before all tests, and then use getClonedLocalScope method to restore from the
   * cloned scope.
   */
  cloneLocalScope() {
    const clonedScope = `${generateRandomStr()}-clone`;
    const clonedScopePath = path.join(this.scopes.e2eDir, clonedScope);
    if (this.debugMode) console.log(`cloning a scope from ${this.scopes.localScopePath} to ${clonedScopePath}`);
    fs.copySync(this.scopes.localScopePath, clonedScopePath);
    this.clonedScopes.push(clonedScopePath);
    return clonedScopePath;
  }

  getClonedLocalScope(clonedScopePath: string, deleteCurrentScope: boolean = true) {
    if (!fs.existsSync(clonedScopePath)) {
      throw new Error(`getClonedLocalScope was unable to find the clonedScopePath at ${clonedScopePath}`);
    }
    if (deleteCurrentScope) {
      fs.removeSync(this.scopes.localScopePath);
    } else {
      this.scopes.setLocalScope();
    }
    if (this.debugMode) console.log(`cloning a scope from ${clonedScopePath} to ${this.scopes.localScopePath}`);
    fs.copySync(clonedScopePath, this.scopes.localScopePath);
  }

  cloneRemoteScope() {
    const clonedScope = generateRandomStr();
    const clonedScopePath = path.join(this.scopes.e2eDir, clonedScope);
    if (this.debugMode) console.log(`cloning a scope from ${this.scopes.remoteScopePath} to ${clonedScopePath}`);
    fs.copySync(this.scopes.remoteScopePath, clonedScopePath);
    this.clonedScopes.push(clonedScopePath);
    return clonedScopePath;
  }

  getClonedRemoteScope(clonedScopePath: string, deleteCurrentScope: boolean = true) {
    if (deleteCurrentScope) {
      fs.removeSync(this.scopes.remoteScopePath);
    } else {
      this.getNewBareScope();
    }
    if (this.debugMode) console.log(`cloning a scope from ${clonedScopePath} to ${this.scopes.remoteScopePath}`);
    fs.copySync(clonedScopePath, this.scopes.remoteScopePath);
  }
}
