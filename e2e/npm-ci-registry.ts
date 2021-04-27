/* eslint no-console: 0 */
import { ChildProcess } from 'child_process';
import execa from 'execa';
import fs from 'fs-extra';
import * as path from 'path';

import Helper from '../src/e2e-helper/e2e-helper';

const isAppVeyor = process.env.APPVEYOR === 'True';
const skipRegistryTests = process.env.SKIP_REGISTRY_TESTS === 'True' || process.env.SKIP_REGISTRY_TESTS === 'true';
export const supportNpmCiRegistryTesting = !isAppVeyor && !skipRegistryTests;

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
export default class NpmCiRegistry {
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  registryServer: ChildProcess;
  helper: Helper;
  ciRegistry = 'http://localhost:4873';
  ciDefaultScope = '@ci';
  constructor(helper: Helper) {
    this.helper = helper;
  }
  async init(scopes: string[] = [this.ciDefaultScope]) {
    await this._establishRegistry();
    this._addDefaultUser();
    this._registerScopes(scopes);
  }

  /**
   * makes sure to kill the server process, otherwise, the tests will continue forever and never exit
   */
  destroy() {
    this.registryServer.kill();
  }

  _establishRegistry(): Promise<void> {
    return new Promise((resolve) => {
      this.registryServer = execa('verdaccio', { detached: true });
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      this.registryServer.stdout.on('data', (data) => {
        if (this.helper.debugMode) console.log(`stdout: ${data}`);
        if (data.includes('4873')) {
          if (this.helper.debugMode) console.log('Verdaccio server is up and running');
          resolve();
        }
      });
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      this.registryServer.stderr.on('data', (data) => {
        if (this.helper.debugMode) console.log(`stderr: ${data}`);
      });
      this.registryServer.on('close', (code) => {
        if (this.helper.debugMode) console.log(`child process exited with code ${code}`);
      });
    });
  }

  _addDefaultUser() {
    const addUser = `expect <<EOD
spawn npm adduser --registry ${this.ciRegistry} --scope=${this.ciDefaultScope}
expect {
"Username:" {send "ci\r"; exp_continue}
"Password:" {send "secret\r"; exp_continue}
"Email: (this IS public)" {send "ci@ci.com\r"; exp_continue}
}
EOD`;
    fs.writeFileSync('adduser.sh', addUser);
    const addUserResult = execa.sync('sh', ['adduser.sh']);
    if (!addUserResult.stdout.includes('Logged in as ci to scope @ci')) {
      throw new Error(`failed executing npm adduser ${addUserResult.stderr}`);
    }
    if (this.helper.debugMode) console.log('default user has been added successfully to Verdaccio');
    fs.removeSync('adduser.sh');
  }

  // TODO: improve this to only write it to project level npmrc instead of global one
  _registerScopes(scopes: string[] = ['@ci']) {
    scopes.forEach((scope) => {
      this.helper.command.runCmd(`npm config set ${scope}:registry ${this.ciRegistry}`);
    });
  }

  /**
   * ensures that the bindingPrefix of all components is `@ci`, so it'll be possible to publish
   * them later on into @ci scope of Verdaccio registry
   */
  setCiScopeInBitJson() {
    if (this.helper.general.isHarmonyProject()) {
      throw new Error('Harmony does not need this. remove this call please');
    }
    const bitJson = this.helper.bitJson.read();
    bitJson.bindingPrefix = '@ci';
    this.helper.bitJson.write(bitJson);
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

  configureCiInPackageJsonHarmony() {
    const pkg = {
      packageJson: {
        publishConfig: {
          scope: this.ciDefaultScope,
          registry: this.ciRegistry,
        },
      },
    };
    this.helper.bitJsonc.addToVariant('*', 'teambit.pkg/pkg', pkg);
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
    this.helper.bitJsonc.addToVariant('*', 'teambit.pkg/pkg', pkg);
  }

  installPackage(pkgName: string) {
    this.helper.command.runCmd(`npm install ${pkgName} --registry=${this.ciRegistry}`);
  }

  unpublishComponent(packageName: string) {
    this.helper.command.runCmd(`npm unpublish @ci/${this.helper.scopes.remote}.${packageName} --force`);
  }

  publishEntireScope() {
    this.helper.scopeHelper.reInitLocalScope();
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
}
