/* eslint no-console: 0 */
import { addUser, REGISTRY_MOCK_PORT, start as startRegistryMock, prepare } from '@pnpm/registry-mock';
import type { ChildProcess } from 'child_process';
import { fetch } from '@pnpm/fetch';
import fs from 'fs-extra';
import execa from 'execa';
import * as path from 'path';

import type { Helper } from './e2e-helper';

const skipRegistryTests = process.env.SKIP_REGISTRY_TESTS === 'True' || process.env.SKIP_REGISTRY_TESTS === 'true';
export const supportNpmCiRegistryTesting = !skipRegistryTests;

/**
 * some features, such as installing dependencies as packages, require npm registry to be set.
 * in order to not rely on bitsrc site for the npm registry, this class provides a way to use npm
 * registry by running a Verdaccio server (https://www.npmjs.com/package/verdaccio).
 * the default scope registry is `@bit`. we don't touch this scope.
 * instead, we create a new one `@ci` for all components published using this class.
 *
 * To get it work, the following steps are mandatory.
 * 1. before tagging the components, run `this.setCiScopeInBitJson()`.
 * 2. import the components to a new scope.
 * 3. run `helper.scopeHelper.removeRemoteScope();` otherwise, it'll save components as dependencies
 * 4. run `this.publishComponent(your-component)`.
 * also, make sure to run `this.init()` on the before hook, and `this.destroy()` on the after hook.
 *
 * in case you need to init ciRegistry a few times on the same e2e-test file, it's better to
 * re-init the helper, and pass the new instance to this init. (`helper = new Helper(); const npmCiRegistry = new NpmCiRegistry(helper);`)
 * so then it'll create new local and remote scope. otherwise, the tests might publish the same packages.
 * keep in mind that even when the registry is destroyed, the data is still there and is loaded the next
 * time the registry is running. this solution makes sure the package-names are different.
 *
 * an alternative, it's possible to run `npm unpublish package-name --force` to delete the packages.
 * (or just use `this.unpublishComponent()` method)
 */
export class NpmCiRegistry {
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  registryServer: ChildProcess;
  helper: Helper;
  ciRegistry = `http://localhost:${REGISTRY_MOCK_PORT}`;
  ciDefaultScope = '@ci';
  constructor(helper: Helper) {
    this.helper = helper;
  }
  async init(scopes: string[] = [this.ciDefaultScope]) {
    await this._establishRegistry();
    await this._addDefaultUser();
    this._registerScopes(scopes);
  }

  /**
   * makes sure to kill the server process, otherwise, the tests will continue forever and never exit
   */
  destroy() {
    this.registryServer.kill();
  }

  _establishRegistry(): Promise<void> {
    return new Promise((resolve, reject) => {
      prepare({
        uplinkedRegistry: 'https://node-registry.bit.cloud/',
      });
      this.registryServer = startRegistryMock({ detached: true });
      let resolved = false;
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      this.registryServer.stdout.on('data', async (data): void => {
        if (!resolved && data.includes(REGISTRY_MOCK_PORT)) {
          resolved = true;
          let fetchResults;
          try {
            fetchResults = await fetch(`http://localhost:${REGISTRY_MOCK_PORT}/is-odd`, {
              retry: {
                minTimeout: 1000,
                maxTimeout: 10000,
                retries: 3,
              },
            });
          } catch (err) {
            reject(err);
            return;
          }
          if (fetchResults.status === 200) {
            if (this.helper.debugMode) console.log('Verdaccio server is up and running');
            resolve();
          } else {
            reject(new Error('Registry has not started'));
          }
        }
      });
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      this.registryServer.stderr.on('data', (data) => {
        if (this.helper.debugMode) console.log(`stderr: ${data}`);
      });
      this.registryServer.on('error', (err) => {
        if (this.helper.debugMode) console.log(`child process errored ${err.message}`);
        reject(err);
      });
      this.registryServer.on('close', (code) => {
        if (this.helper.debugMode) console.log(`child process exited with code ${code}`);
      });
    });
  }

  async _addDefaultUser() {
    const { token } = await addUser({
      username: 'ci',
      password: 'secret',
      email: 'ci@ci.com',
    });
    execa.sync('npm', ['config', 'set', `${this.ciDefaultScope}:registry=${this.ciRegistry}`]);
    execa.sync('npm', ['config', 'set', `${this.ciRegistry.replace('http://', '//')}:_authToken=${token}`]);
    if (this.helper.debugMode) console.log('default user has been added successfully to Verdaccio');
  }

  // TODO: improve this to only write it to project level npmrc instead of global one
  _registerScopes(scopes: string[] = ['@ci']) {
    scopes.forEach((scope) => {
      this.helper.command.runCmd(`npm config set ${scope}:registry ${this.ciRegistry}`);
    });
  }

  /**
   * when using bitsrc, on export, a component is automatically pushed to @bit registry.
   * here, we don't have this privilege. instead, the following needs to be done to save the
   * component in the registry.
   * 1) import the component.
   * 2) run npm-pack to create a .tgz file.
   * 3) extract the file and run `npm publish` in that directory.
   * this method does the last two. the end result is that Verdaccio registry has this component
   * published and ready to be consumed later on when running 'npm install package-name'.
   */
  publishComponent(componentName: string, componentVersion = '0.0.1') {
    const packDir = path.join(this.helper.scopes.localPath, 'pack');
    const componentFullName = componentName.startsWith(this.helper.scopes.remote)
      ? componentName
      : `${this.helper.scopes.remote}/${componentName}`;
    const componentId = `${componentFullName}@${componentVersion}`;
    const options = {
      d: packDir,
    };
    if (this.helper.general.isHarmonyProject()) {
      // @ts-ignore
      options.c = '';
    }
    this.helper.command.packComponent(componentId, options, true);
    const extractedDir = path.join(packDir, 'package');
    this._validateRegistryScope(extractedDir);
    this.helper.command.runCmd('npm publish', extractedDir);
  }

  /**
   * publish an empty package to the registry.
   * it's helpful in case a package is needed. not a component.
   * instead of going to the NPM, this method is faster.
   */
  publishPackage(packageName: string, version = '0.0.1') {
    const dir = this.helper.fs.createNewDirectory();
    this.helper.command.runCmd(`npm init -y`, dir);
    // change package.json according to the packageName and version
    const packageJson = fs.readJsonSync(path.join(dir, 'package.json'));
    packageJson.name = packageName;
    packageJson.version = version;
    fs.writeJsonSync(path.join(dir, 'package.json'), packageJson);
    this.helper.command.runCmd('npm publish', dir);
  }

  configureCiInPackageJsonHarmony() {
    const pkg = {
      packageJson: {
        publishConfig: {
          scope: this.ciDefaultScope,
          registry: this.ciRegistry,
        },
      },
    };
    this.helper.workspaceJsonc.addToVariant('*', 'teambit.pkg/pkg', pkg);
  }

  configureCustomNameInPackageJsonHarmony(name: string) {
    const pkg = {
      packageJson: {
        name,
        publishConfig: {
          registry: this.ciRegistry,
        },
      },
    };
    this.helper.workspaceJsonc.addToVariant('*', 'teambit.pkg/pkg', pkg);
  }

  installPackage(pkgName: string) {
    this.helper.command.runCmd(`npm install ${pkgName} --registry=${this.ciRegistry}`);
  }

  unpublishComponent(packageName: string) {
    this.helper.command.runCmd(`npm unpublish @ci/${this.helper.scopes.remote}.${packageName} --force`);
  }

  publishEntireScope() {
    this.helper.scopeHelper.reInitWorkspace();
    this.helper.scopeHelper.addRemoteScope();
    this.helper.command.importComponent('* --objects');
    const remoteComponents = this.helper.command.listRemoteScopeParsed();
    const remoteIds = remoteComponents.map((c) => c.id);
    this.helper.scopeHelper.removeRemoteScope();
    remoteIds.forEach((id) => this.publishComponent(id));
  }

  /**
   * a workaround to make Bit save dependencies as packages.
   * once the resolver is set, it's possible to delete the remote and it'll be still able to import
   * from that remote.
   * once the remote scope is deleted from the remote list, Bit assumes that it the remote is a hub
   * and enable the save-dependencies-as-packages feature.
   */
  setResolver(extraScopes: { [scopeName: string]: string } = {}) {
    const scopeJsonPath = '.bit/scope.json';
    const scopeJson = this.helper.fs.readJsonFile(scopeJsonPath);
    const resolverPath = path.join(this.helper.scopes.localPath, 'resolver.js');
    scopeJson.resolverPath = resolverPath;
    this.helper.fs.createJsonFile(scopeJsonPath, scopeJson);
    this.helper.fs.createFile('', 'resolver.js', this._getResolverContent(extraScopes));
  }

  _getResolverContent(extraScopes: { [scopeName: string]: string } = {}) {
    return `const extraScopes = ${JSON.stringify(extraScopes)};
module.exports = (scopeName) => {
  if (extraScopes[scopeName]) return Promise.resolve('file://' + extraScopes[scopeName]);
  return Promise.resolve('file://${this.helper.scopes.remotePath}');
}`;
  }

  _validateRegistryScope(dir: string) {
    const packageJson = this.helper.packageJson.read(dir);
    // $FlowFixMe name must be set
    if (!packageJson.name.startsWith('@ci')) {
      throw new Error('expect package.json name to start with "@ci" in order to publish it to @ci scope');
    }
  }

  getRegistryUrl() {
    return this.ciRegistry;
  }
}
