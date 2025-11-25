import * as path from 'path';

import type CommandHelper from './e2e-command-helper';
import type FsHelper from './e2e-fs-helper';
import type ScopesData from './e2e-scopes';

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
   */
  addFakeNpmPackage(name = 'lodash.get', version = '4.4.2', isComp = false) {
    const obj: any = { name, version };
    if (isComp) {
      const [, ...rest] = name.split('/');
      obj.componentId = {
        scope: this.scopes.remote,
        name: rest.join('/'),
        version,
      };
    }
    const packageJsonFixture = JSON.stringify(obj, null, 2);
    this.fs.outputFile(`node_modules/${name}/index.js`, '');
    this.fs.outputFile(`node_modules/${name}/package.json`, packageJsonFixture);
  }
}
