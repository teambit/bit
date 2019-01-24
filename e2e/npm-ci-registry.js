// @flow
/* eslint no-console: 0 */
import fs from 'fs-extra';
import path from 'path';
import execa from 'execa';
import tar from 'tar';
import { ChildProcess } from 'child_process';
import Helper from './e2e-helper';

const isAppVeyor = process.env.APPVEYOR === 'True';
export const supportNpmCiRegistryTesting = !isAppVeyor;

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
 * 3. run `helper.importNpmPackExtension();`
 * 4. run `helper.removeRemoteScope();` otherwise, it'll save components as dependencies
 * 5. run `this.publishComponent(your-component)`.
 * also, make sure to run `this.init()` on the before hook, and `this.destroy()` on the after hook.
 */
export default class NpmCiRegistry {
  registryServer: ChildProcess;
  helper: Helper;
  constructor(helper: Helper) {
    this.helper = helper;
  }
  async init() {
    await this._establishRegistry();
    this._addDefaultUser();
    this._registerToCiScope();
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
      this.registryServer.stdout.on('data', (data) => {
        if (this.helper.debugMode) console.log(`stdout: ${data}`);
        if (data.includes('4873')) {
          if (this.helper.debugMode) console.log('Verdaccio server is up and running');
          resolve();
        }
      });
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
spawn npm adduser --registry http://localhost:4873 --scope=@ci
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

  _registerToCiScope() {
    this.helper.runCmd('npm config set @ci:registry http://localhost:4873');
  }

  /**
   * ensures that the bindingPrefix of all components is `@ci`, so it'll be possible to publish
   * them later on into @ci scope of Verdaccio registry
   */
  setCiScopeInBitJson() {
    const bitJson = this.helper.readBitJson();
    // $FlowFixMe
    bitJson.bindingPrefix = '@ci';
    this.helper.writeBitJson(bitJson);
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
  publishComponent(componentName: string, componentVersion?: string = '0.0.1') {
    const packDir = path.join(this.helper.localScopePath, 'pack');
    this.helper.runCmd(`bit npm-pack ${this.helper.remoteScope}/${componentName} -o -k -d ${packDir}`);
    const npmComponentName = componentName.replace(/\//g, '.');
    const tarballFileName = `ci-${this.helper.remoteScope}.${npmComponentName}-${componentVersion}.tgz`;
    const tarballFilePath = path.join(packDir, tarballFileName);
    tar.x({ file: tarballFilePath, C: packDir, sync: true });
    const extractedDir = path.join(packDir, 'package');
    this._validateRegistryScope(extractedDir);
    this.helper.runCmd('npm publish', extractedDir);
  }

  _validateRegistryScope(dir: string) {
    const packageJson = this.helper.readPackageJson(dir);
    // $FlowFixMe name must be set
    if (!packageJson.name.startsWith('@ci')) {
      throw new Error('expect package.json name to start with "@ci" in order to publish it to @ci scope');
    }
  }
}
