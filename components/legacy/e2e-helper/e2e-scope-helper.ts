/* eslint no-console: 0 */

import fs from 'fs-extra';
import path from 'path';
import * as yaml from 'yaml';
import * as ini from 'ini';
import { generateRandomStr } from '@teambit/toolbox.string.random';
import { IS_WINDOWS } from '@teambit/legacy.constants';
import type CommandHelper from './e2e-command-helper';
import type FsHelper from './e2e-fs-helper';
import type NpmHelper from './e2e-npm-helper';
import type ScopesData from './e2e-scopes';
import { DEFAULT_OWNER } from './e2e-scopes';
import type WorkspaceJsoncHelper from './e2e-workspace-jsonc-helper';
import {
  addFileRemoteToScopeJson,
  copyBareScopeTemplate,
  copyWorkspaceTemplate,
  ensureBareScopeTemplate,
  ensureWorkspaceTemplate,
  isSetupTemplateEnabled,
} from './e2e-setup-template';

type SetupWorkspaceOpts = {
  addRemoteScopeAsDefaultScope?: boolean; // default to true, otherwise, the scope is "my-scope"
  disablePreview?: boolean; // default to true to speed up the tag
  disableMissingManuallyConfiguredPackagesIssue?: boolean; // default to true. otherwise, it'll always show missing babel/jest from react-env
  registry?: string;
  initGit?: boolean;
  generatePackageJson?: boolean;
  yarnRCConfig?: any;
  npmrcConfig?: any;
  interactive?: boolean; // default to false. relevant only when ".git" exits.
};

export default class ScopeHelper {
  private cache?: Record<string, any>;
  private keepEnvs: boolean;
  private clonedScopes: string[] = [];
  constructor(
    private debugMode: boolean,
    private scopes: ScopesData,
    private command: CommandHelper,
    private fsHelper: FsHelper,
    private npm: NpmHelper,
    private workspaceJsonc: WorkspaceJsoncHelper
  ) {
    this.keepEnvs = debugMode; // don't delete the workspaces/scopes when in debug mode
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
    this.fsHelper.cleanExternalDirs();
  }
  cleanWorkspace() {
    fs.emptyDirSync(this.scopes.localPath);
  }
  deleteWorkspace() {
    fs.removeSync(this.scopes.localPath);
  }
  reInitWorkspace(opts?: SetupWorkspaceOpts) {
    this.cleanWorkspace();
    if (opts?.initGit) this.command.runCmd('git init');
    this.initWorkspace(opts);

    if (opts?.addRemoteScopeAsDefaultScope ?? true) this.workspaceJsonc.addDefaultScope();
    if (opts?.disablePreview ?? true) this.workspaceJsonc.disablePreview();
    if (opts?.disableMissingManuallyConfiguredPackagesIssue ?? true)
      this.workspaceJsonc.disableMissingManuallyConfiguredPackagesIssue();

    if (opts?.registry) {
      this._writeNpmrc({
        registry: opts.registry,
        ...opts.npmrcConfig,
      });
      this._writeYarnRC({
        unsafeHttpWhitelist: ['localhost'],
        ...opts?.yarnRCConfig,
      });
    } else {
      if (opts?.yarnRCConfig) {
        this._writeYarnRC(opts.yarnRCConfig);
      }
      if (opts?.npmrcConfig) {
        this._writeNpmrc(opts.npmrcConfig);
      }
    }
  }
  /**
   * a fresh `bit init` writes the same files for every test bar two directory-derived names, so
   * copy a template built by a real init rather than spawn bit ~1,250 times per suite run.
   * the options below make init write something else — `.git` moves the scope to `.git/bit` and
   * suppresses AGENTS.md, and the other two take different branches in create-consumer — so they
   * keep running the real command.
   */
  private initWorkspace(opts?: SetupWorkspaceOpts) {
    const canUseTemplate = !opts?.initGit && !opts?.interactive && !opts?.generatePackageJson;
    if (!canUseTemplate || !isSetupTemplateEnabled()) {
      const pkgJsonFlag = opts?.generatePackageJson ? undefined : '--no-package-json';
      this.command.init(pkgJsonFlag, opts?.interactive);
      return;
    }
    const template = ensureWorkspaceTemplate(this.scopes.e2eDir, (cwd) =>
      this.command.runCmd('bit init --no-package-json', cwd)
    );
    copyWorkspaceTemplate(template, this.scopes.localPath);
  }

  /**
   * a bare scope is a scope.json plus three empty directories, and only the scope name varies.
   * same reasoning as initWorkspace, ~800 spawns per suite run.
   */
  private initBareScope(scopePath: string): string {
    if (!isSetupTemplateEnabled()) return this.command.runCmd('bit init --bare', scopePath);
    const template = ensureBareScopeTemplate(this.scopes.e2eDir, (cwd) => this.command.runCmd('bit init --bare', cwd));
    copyBareScopeTemplate(template, scopePath);
    return '';
  }

  private _writeYarnRC(yarnRCConfig: any) {
    this.fsHelper.writeFile('.yarnrc.yml', yaml.stringify(yarnRCConfig));
  }

  private _writeNpmrc(config: any) {
    this.fsHelper.writeFile('.npmrc', ini.stringify(config));
  }

  setWorkspaceWithRemoteScope(opts?: SetupWorkspaceOpts) {
    this.reInitWorkspace(opts);
    this.reInitRemoteScope();
    this.addRemoteScope();
  }

  addRemoteScope(
    remoteScopePath: string = this.scopes.remotePath,
    cwd: string = this.scopes.localPath,
    isGlobal = false
  ) {
    // `--global` writes the remotes file rather than the scope, and addFileRemoteToScopeJson bows
    // out when there's no scope yet to write into (which some tests trigger on purpose), so both
    // fall through to the real command.
    if (!isGlobal && isSetupTemplateEnabled() && addFileRemoteToScopeJson(remoteScopePath, cwd)) return '';
    const globalArg = isGlobal ? '-g' : '';
    return this.command.runCmd(`bit remote add file://${remoteScopePath} ${globalArg}`, cwd);
  }

  addRemoteHttpScope(port = '3000') {
    return this.command.runCmd(`bit remote add http://localhost:${port}`);
  }

  removeRemoteScope(
    remoteScope: string = this.scopes.remote,
    isGlobal = false,
    localScopePath: string = this.scopes.localPath
  ) {
    const globalArg = isGlobal ? '-g' : '';
    return this.command.runCmd(`bit remote del ${remoteScope} ${globalArg}`, localScopePath);
  }

  addGlobalRemoteScope() {
    return this.addRemoteScope(this.scopes.globalRemotePath, this.scopes.localPath);
  }

  reInitRemoteScope(scopePath = this.scopes.remotePath) {
    fs.emptyDirSync(scopePath);
    return this.initBareScope(scopePath);
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

  getNewBareScope(scopeNameSuffix = '-remote2', addOwnerPrefix = false, remoteScopeToAdd = this.scopes.remotePath) {
    const prefix = addOwnerPrefix ? `${DEFAULT_OWNER}.` : '';
    const scopeName = prefix + generateRandomStr() + scopeNameSuffix;
    const scopePath = path.join(this.scopes.e2eDir, scopeName);
    fs.emptyDirSync(scopePath);
    this.initBareScope(scopePath);
    this.addRemoteScope(remoteScopeToAdd, scopePath);
    const scopeWithoutOwner = scopeName.replace(prefix, '');
    return { scopeName, scopePath, scopeWithoutOwner };
  }

  getNewBareScopeWithSpecificName(scopeName: string) {
    const scopePath = path.join(this.scopes.e2eDir, scopeName);
    fs.emptyDirSync(scopePath);
    this.initBareScope(scopePath);
    return scopePath;
  }

  /**
   * Sometimes many tests need to do the exact same steps to init the local-scope, such as importing compiler/tester.
   * To make it faster, use this method before all tests, and then use getClonedLocalScope method to restore from the
   * cloned scope.
   */
  cloneWorkspace(dereferenceSymlinks = IS_WINDOWS) {
    const clonedScope = `${generateRandomStr()}-clone`;
    const clonedScopePath = path.join(this.scopes.e2eDir, clonedScope);
    if (this.debugMode) console.log(`cloning a scope from ${this.scopes.localPath} to ${clonedScopePath}`);
    fs.removeSync(path.join(this.scopes.localPath, 'node_modules/@teambit/legacy'));
    fs.copySync(this.scopes.localPath, clonedScopePath, { dereference: dereferenceSymlinks });
    this.clonedScopes.push(clonedScopePath);
    return clonedScopePath;
  }

  getClonedWorkspace(clonedScopePath: string, deleteCurrentScope = true) {
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
}
