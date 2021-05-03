/* eslint no-console: 0 */

import fs from 'fs-extra';
import * as path from 'path';

import { HARMONY_FEATURE } from '../api/consumer/lib/feature-toggle';
import { InteractiveInputs } from '../interactive/utils/run-interactive-cmd';
import { generateRandomStr } from '../utils';
import createSymlinkOrCopy from '../utils/fs/create-symlink-or-copy';
import CommandHelper from './e2e-command-helper';
import FsHelper from './e2e-fs-helper';
import NpmHelper from './e2e-npm-helper';
import ScopesData, { DEFAULT_OWNER } from './e2e-scopes';

export default class ScopeHelper {
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  debugMode: boolean;
  scopes: ScopesData;
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  e2eDir: string;
  command: CommandHelper;
  fs: FsHelper;
  npm: NpmHelper;
  cache?: Record<string, any>;
  keepEnvs: boolean;
  clonedScopes: string[] = [];
  packageManager = 'npm';
  constructor(
    debugMode: boolean,
    scopes: ScopesData,
    commandHelper: CommandHelper,
    fsHelper: FsHelper,
    npmHelper: NpmHelper
  ) {
    this.debugMode = debugMode;
    this.keepEnvs = !!process.env.npm_config_keep_envs; // default = false
    this.scopes = scopes;
    this.command = commandHelper;
    this.fs = fsHelper;
    this.npm = npmHelper;
  }
  clean() {
    fs.emptyDirSync(this.scopes.localPath);
    fs.emptyDirSync(this.scopes.remotePath);
  }

  destroy() {
    if (this.keepEnvs) return;
    fs.removeSync(this.scopes.localPath);
    fs.removeSync(this.scopes.remotePath);
    if (this.cache) {
      fs.removeSync(this.cache.localScopePath);
      fs.removeSync(this.cache.remoteScopePath);
      delete this.cache;
    }
    if (this.clonedScopes && this.clonedScopes.length) {
      this.clonedScopes.forEach((scopePath) => fs.removeSync(scopePath));
    }
    this.fs.cleanExternalDirs();
  }
  cleanLocalScope() {
    fs.emptyDirSync(this.scopes.localPath);
  }

  usePackageManager(packageManager: string) {
    this.packageManager = packageManager;
  }

  reInitLocalScope() {
    this.cleanLocalScope();
    this.initLocalScope();
  }
  reInitLocalScopeHarmony() {
    this.cleanLocalScope();
    this.initHarmonyWorkspace();
  }

  initHarmonyWorkspace() {
    this.command.runCmd('bit init', undefined, undefined, HARMONY_FEATURE);
  }

  /**
   * This will re init a workspace as harmony
   * link @teambit/legacy in node_modules
   * link the core aspect in node_modules
   */
  reInitLocalWorkspaceHarmonyForNewAspects() {
    this.reInitLocalScopeHarmony();
    this.linkBitLegacy();
  }

  initLocalScope() {
    return this.initWorkspace();
  }

  initWorkspace(workspacePath?: string) {
    // return this.command.runCmd('bit init -N', workspacePath);
    return this.command.runCmd(`bit init -p ${this.packageManager}`, workspacePath);
  }

  initWorkspaceAndRemoteScope(workspacePath?: string) {
    this.initWorkspace(workspacePath);
    this.reInitRemoteScope();
    this.addRemoteScope();
  }

  async initInteractive(inputs: InteractiveInputs) {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return this.command.runInteractiveCmd({ args: ['init', '--interactive'], inputs });
  }

  initLocalScopeWithOptions(options: Record<string, any>) {
    const value = Object.keys(options)
      .map((key) => `-${key} ${options[key]}`)
      .join(' ');
    return this.command.runCmd(`bit init ${value}`);
  }
  setNewLocalAndRemoteScopes() {
    this.reInitLocalScope();
    this.reInitRemoteScope();
    this.addRemoteScope();
  }
  setNewLocalAndRemoteScopesHarmony() {
    this.reInitLocalScopeHarmony();
    this.reInitRemoteScope();
    this.addRemoteScope();
  }

  initNewLocalScope(deleteCurrentScope = true) {
    if (deleteCurrentScope) {
      fs.removeSync(this.scopes.localPath);
    }
    this.scopes.setLocalScope();
    fs.ensureDirSync(this.scopes.localPath);
    return this.initLocalScope();
  }
  addRemoteScope(
    remoteScopePath: string = this.scopes.remotePath,
    localScopePath: string = this.scopes.localPath,
    isGlobal = false
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

  addRemoteHttpScope(port = '3000') {
    return this.command.runCmd(`bit remote add http://localhost:${port}`);
  }

  removeRemoteScope(remoteScope: string = this.scopes.remote, isGlobal = false) {
    const globalArg = isGlobal ? '-g' : '';
    return this.command.runCmd(`bit remote del ${remoteScope} ${globalArg}`);
  }

  addRemoteEnvironment(isGlobal = false) {
    return this.addRemoteScope(this.scopes.envPath, this.scopes.localPath, isGlobal);
  }

  addGlobalRemoteScope() {
    return this.addRemoteScope(this.scopes.globalRemotePath, this.scopes.localPath);
  }

  removeRemoteEnvironment(isGlobal = false) {
    return this.removeRemoteScope(this.scopes.env, isGlobal);
  }

  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  reInitRemoteScope(scopePath?: string = this.scopes.remotePath) {
    fs.emptyDirSync(scopePath);
    return this.command.runCmd('bit init --bare', scopePath);
  }

  /**
   * useful when publishing to a local npm registry so then multiple tests in the same file
   * won't collide in the @ci registry
   */
  setRemoteScopeAsDifferentDir() {
    fs.removeSync(this.scopes.remotePath);
    this.scopes.setRemoteScope();
    this.reInitRemoteScope();
    this.addRemoteScope();
  }

  reInitEnvsScope() {
    fs.emptyDirSync(this.scopes.envPath);
    return this.command.runCmd('bit init --bare', this.scopes.envPath);
  }

  getNewBareScope(scopeNameSuffix = '-remote2', addOwnerPrefix = false) {
    const prefix = addOwnerPrefix ? `${DEFAULT_OWNER}.` : '';
    const scopeName = prefix + generateRandomStr() + scopeNameSuffix;
    const scopePath = path.join(this.scopes.e2eDir, scopeName);
    fs.emptyDirSync(scopePath);
    this.command.runCmd('bit init --bare', scopePath);
    this.addRemoteScope(this.scopes.remotePath, scopePath);
    const scopeWithoutOwner = scopeName.replace(prefix, '');
    return { scopeName, scopePath, scopeWithoutOwner };
  }

  getNewBareScopeWithSpecificName(scopeName: string) {
    const scopePath = path.join(this.scopes.e2eDir, scopeName);
    fs.emptyDirSync(scopePath);
    this.command.runCmd('bit init --bare', scopePath);
    return scopePath;
  }

  /**
   * Sometimes many tests need to do the exact same steps to init the local-scope, such as importing compiler/tester.
   * To make it faster, use this method before all tests, and then use getClonedLocalScope method to restore from the
   * cloned scope.
   */
  cloneLocalScope(dereferenceSymlinks = true) {
    const clonedScope = `${generateRandomStr()}-clone`;
    const clonedScopePath = path.join(this.scopes.e2eDir, clonedScope);
    if (this.debugMode) console.log(`cloning a scope from ${this.scopes.localPath} to ${clonedScopePath}`);
    fs.copySync(this.scopes.localPath, clonedScopePath, { dereference: dereferenceSymlinks });
    this.clonedScopes.push(clonedScopePath);
    return clonedScopePath;
  }

  getClonedLocalScope(clonedScopePath: string, deleteCurrentScope = true) {
    if (!fs.existsSync(clonedScopePath)) {
      throw new Error(`getClonedLocalScope was unable to find the clonedScopePath at ${clonedScopePath}`);
    }
    if (deleteCurrentScope) {
      fs.removeSync(this.scopes.localPath);
    } else {
      this.scopes.setLocalScope();
    }
    if (this.debugMode) console.log(`cloning a scope from ${clonedScopePath} to ${this.scopes.localPath}`);
    fs.copySync(clonedScopePath, this.scopes.localPath);
  }

  cloneRemoteScope() {
    return this.cloneScope(this.scopes.remotePath);
  }

  cloneScope(scopePath: string) {
    const clonedScope = generateRandomStr();
    const clonedScopePath = path.join(this.scopes.e2eDir, clonedScope);
    if (this.debugMode) console.log(`cloning a scope from ${scopePath} to ${clonedScopePath}`);
    fs.copySync(scopePath, clonedScopePath);
    this.clonedScopes.push(clonedScopePath);
    return clonedScopePath;
  }

  getClonedScope(clonedScopePath: string, scopePath: string) {
    fs.removeSync(scopePath);
    if (this.debugMode) console.log(`cloning a scope from ${clonedScopePath} to ${scopePath}`);
    fs.copySync(clonedScopePath, scopePath);
  }

  getClonedRemoteScope(clonedScopePath: string) {
    return this.getClonedScope(clonedScopePath, this.scopes.remotePath);
  }

  switchFromLegacyToHarmony() {
    fs.removeSync(path.join(this.scopes.localPath, 'bit.json'));
    this.initHarmonyWorkspace();
  }

  linkBitLegacy() {
    const bitLegacyPath = path.join(this.scopes.localPath, './node_modules/@teambit/legacy');
    const localBitLegacyPath = path.join(__dirname, '../..');
    fs.removeSync(bitLegacyPath);
    createSymlinkOrCopy(localBitLegacyPath, bitLegacyPath);
    this.linkCoreAspects();
  }

  linkCoreAspects() {
    const aspectsRoot = path.join(this.scopes.localPath, './node_modules/@teambit');
    const localAspectsRoot = path.join(__dirname, '../../node_modules/@teambit');
    console.log('aspectsRoot', aspectsRoot);
    console.log('localAspectsRoot', localAspectsRoot);
    fs.removeSync(aspectsRoot);
    createSymlinkOrCopy(localAspectsRoot, aspectsRoot);
  }
}
