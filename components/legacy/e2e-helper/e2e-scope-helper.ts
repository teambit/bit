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
    const pkgJsonFlag = opts?.generatePackageJson ? undefined : '--no-package-json';
    this.command.init(pkgJsonFlag, opts?.interactive);

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
    const globalArg = isGlobal ? '-g' : '';
    const cmd = `bit remote add file://${remoteScopePath} ${globalArg}`;
    const result = this.command.runCmd(cmd, cwd);
    // Verify the remote actually landed in the workspace scope.json and retry a few times if not.
    // Under a capsule build (`bit ci pr --build`) dozens of these integration specs run back-to-back
    // in a single long-lived process while the host build machinery touches the same shared global
    // config/scope. That occasionally leaves the just-added `<hash>-remote` unresolvable to a later
    // in-process import, which then falls through to the bit.cloud hub and throws
    // `InvalidScopeNameFromRemote`. A bounded re-add recovers a transient write race; if it still
    // can't be verified we log a loud, diagnosable message (rather than throw) so we never regress
    // the hundreds of other callers, and so a residual CI failure clearly points at registration
    // vs. an import-side resolution problem.
    if (!isGlobal) {
      const maxRetries = 3;
      for (let attempt = 0; attempt < maxRetries && !this.isRemoteRegistered(remoteScopePath, cwd); attempt += 1) {
        this.command.runCmd(cmd, cwd);
      }
      if (!this.isRemoteRegistered(remoteScopePath, cwd)) {
        // eslint-disable-next-line no-console
        console.log(
          `[e2e-helper] WARNING: remote "file://${remoteScopePath}" is not registered in the workspace ` +
            `scope.json at "${cwd}" after ${maxRetries + 1} attempts. remotes on disk: ` +
            JSON.stringify(this.readWorkspaceRemotes(cwd))
        );
      }
    }
    return result;
  }

  /**
   * read the `remotes` map from the workspace scope.json (`<cwd>/.bit/scope.json`). the map is
   * `{ [scopeName]: host }` (see ScopeJson.addRemote), and for e2e file remotes the scope name is
   * the remote directory's basename.
   */
  private readWorkspaceRemotes(cwd: string): Record<string, string> {
    const scopeJsonPath = path.join(cwd, '.bit', 'scope.json');
    if (!fs.existsSync(scopeJsonPath)) return {};
    const scopeJson = fs.readJsonSync(scopeJsonPath, { throws: false });
    return (scopeJson && scopeJson.remotes) || {};
  }

  private isRemoteRegistered(remoteScopePath: string, cwd: string): boolean {
    const scopeName = path.basename(remoteScopePath);
    const remotes = this.readWorkspaceRemotes(cwd);
    // match by scope name (the registered key) or by the host value referencing the remote path —
    // basename is stable against any path normalization the remote-add may apply to the host.
    return (
      scopeName in remotes ||
      Object.values(remotes).some((host) => typeof host === 'string' && host.includes(scopeName))
    );
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

  getNewBareScope(scopeNameSuffix = '-remote2', addOwnerPrefix = false, remoteScopeToAdd = this.scopes.remotePath) {
    const prefix = addOwnerPrefix ? `${DEFAULT_OWNER}.` : '';
    const scopeName = prefix + generateRandomStr() + scopeNameSuffix;
    const scopePath = path.join(this.scopes.e2eDir, scopeName);
    fs.emptyDirSync(scopePath);
    this.command.runCmd('bit init --bare', scopePath);
    this.addRemoteScope(remoteScopeToAdd, scopePath);
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
