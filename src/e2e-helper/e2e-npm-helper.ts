import * as path from 'path';

import CommandHelper from './e2e-command-helper';
import FsHelper from './e2e-fs-helper';
import ScopesData from './e2e-scopes';

export default class NpmHelper {
  command: CommandHelper;
  fs: FsHelper;
  scopes: ScopesData;
  constructor(scopes: ScopesData, fsHelper: FsHelper, commandHelper: CommandHelper) {
    this.scopes = scopes;
    this.fs = fsHelper;
    this.command = commandHelper;
  }

  initNpm(initPath: string = path.join(this.scopes.localPath)) {
    this.command.runCmd('npm init -y', initPath);
  }

  /**
   * install package, if you don't really need the package code and can use mock
   * just run addNpmPackage which will be faster
   * @param {*} name
   * @param {*} version
   */
  installNpmPackage(name: string, version?: string, cwd: string = this.scopes.localPath) {
    const versionWithDelimiter = version ? `@${version}` : '';
    const cmd = `npm i --save ${name}${versionWithDelimiter}`;
    return this.command.runCmd(cmd, cwd);
  }
  /**
   * Add a fake package, don't really install it. if you need the real package
   * use installNpmPackage below
   * @param {*} name
   * @param {*} version
   */
  addNpmPackage(name = 'lodash.get', version = '4.4.2') {
    const packageJsonFixture = JSON.stringify({ name, version });
    this.fs.createFile(`node_modules/${name}`, 'index.js');
    this.fs.createFile(`node_modules/${name}`, 'package.json', packageJsonFixture);
  }
}
