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
 * when using bitsrc, on export, a component is automatically pushed to @bit registry.
 * here, we don't have this privilege. instead, the following needs to be done to save the
 * component in the registry.
 * 1) import the component.
 * 2) run npm-pack to create a .tgz file.
 * 3) extract the file and run `npm publish` in that directory.
 * You can use the method `publishComponent()` in this class to automate the process
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

  publishComponent(componentName: string, componentVersion?: string = '0.0.1') {
    const packDir = path.join(this.helper.localScopePath, 'pack');
    this.helper.runCmd(`bit npm-pack ${this.helper.remoteScope}/${componentName} -o -k -d ${packDir}`);
    const npmComponentName = componentName.replace(/\//g, '.');
    const tarballFileName = `ci-${this.helper.remoteScope}.${npmComponentName}-${componentVersion}.tgz`;
    const tarballFilePath = path.join(packDir, tarballFileName);
    tar.x({ file: tarballFilePath, C: packDir, sync: true });
    const extractedDir = path.join(packDir, 'package');
    fs.removeSync(path.join(extractedDir, 'components')); // not sure why this dir is created
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
