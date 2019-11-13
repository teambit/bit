import * as path from 'path';
import fs from 'fs-extra';
import tar from 'tar';
import chalk from 'chalk';
import FsHelper from './e2e-fs-helper';
import CommandHelper from './e2e-command-helper';
import * as fixtures from '../../src/fixtures/fixtures';
import NpmHelper from './e2e-npm-helper';
import ScopesData from './e2e-scopes';

export default class FixtureHelper {
  fs: FsHelper;
  command: CommandHelper;
  scopes: ScopesData;
  debugMode: boolean;
  npm: NpmHelper;
  constructor(
    fsHelper: FsHelper,
    commandHelper: CommandHelper,
    npmHelper: NpmHelper,
    scopes: ScopesData,
    debugMode: boolean
  ) {
    this.fs = fsHelper;
    this.command = commandHelper;
    this.npm = npmHelper;
    this.scopes = scopes;
    this.debugMode = debugMode;
  }
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  createComponentBarFoo(impl?: string = fixtures.fooFixture) {
    this.fs.createFile('bar', 'foo.js', impl);
  }

  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  createComponentUtilsIsType(impl?: string = fixtures.isType) {
    this.fs.createFile('utils', 'is-type.js', impl);
  }

  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  createComponentUtilsIsString(impl?: string = fixtures.isString) {
    this.fs.createFile('utils', 'is-string.js', impl);
  }

  addComponentBarFoo() {
    return this.command.runCmd('bit add bar/foo.js --id bar/foo');
  }

  addComponentUtilsIsType() {
    return this.command.runCmd('bit add utils/is-type.js --id utils/is-type');
  }

  addComponentUtilsIsString() {
    return this.command.runCmd('bit add utils/is-string.js --id utils/is-string');
  }

  tagComponentBarFoo() {
    return this.command.tagComponent('bar/foo');
  }
  getFixturesDir() {
    return path.join(__dirname, '../../e2e/fixtures');
  }

  copyFixtureComponents(dir = '', cwd: string = this.scopes.localPath) {
    const sourceDir = path.join(this.getFixturesDir(), 'components', dir);
    fs.copySync(sourceDir, cwd);
  }

  copyFixtureFile(pathToFile = '', newName: string = path.basename(pathToFile), cwd: string = this.scopes.localPath) {
    const sourceFile = path.join(this.getFixturesDir(), pathToFile);
    const distFile = path.join(cwd, newName);
    if (this.debugMode) console.log(chalk.green(`copying fixture ${sourceFile} to ${distFile}\n`)); // eslint-disable-line
    fs.copySync(sourceFile, distFile);
  }
  /**
   * populates the local workspace with the following components:
   * 'bar/foo'         => requires a file from 'utils/is-string' component
   * 'utils/is-string' => requires a file from 'utils/is-type' component
   * 'utils/is-type'
   * in other words, the dependency chain is: bar/foo => utils/is-string => utils/is-type
   */
  populateWorkspaceWithComponents() {
    this.fs.createFile('utils', 'is-type.js', fixtures.isType);
    this.addComponentUtilsIsType();
    this.fs.createFile('utils', 'is-string.js', fixtures.isString);
    this.addComponentUtilsIsString();
    this.createComponentBarFoo(fixtures.barFooFixture);
    this.addComponentBarFoo();
  }

  /**
   * populates the local workspace with the following components:
   * 'bar/foo'         => requires a file from 'utils/is-string' component
   * 'utils/is-string' => requires a file from 'utils/is-type' component
   * 'utils/is-type'   => requires the left-pad package
   * in other words, the dependency chain is: bar/foo => utils/is-string => utils/is-type => left-pad
   */
  populateWorkspaceWithComponentsAndPackages() {
    this.npm.initNpm();
    this.npm.installNpmPackage('left-pad', '1.3.0');
    this.fs.createFile('utils', 'is-type.js', fixtures.isTypeLeftPad);
    this.addComponentUtilsIsType();
    this.fs.createFile('utils', 'is-string.js', fixtures.isString);
    this.addComponentUtilsIsString();
    this.createComponentBarFoo(fixtures.barFooFixture);
    this.addComponentBarFoo();
  }

  /**
   * extract the global-remote g-zipped scope into the e2e-test, so it'll be ready to consume.
   * this is an alternative to import directly from bit-dev.
   *
   * to add more components to the .tgz file, extract it, add it as a remote, then from your
   * workspace import the component you want and fork it into this remote, e.g.
   * # extract the file into `/tmp` so then the scope is in `/tmp/global-remote`.
   * # go to your workspace and run the following
   * bit remote add file:///tmp/global-remote
   * bit import bit.envs/compilers/typescript
   * bit export global-remote bit.envs/compilers/typescript --include-dependencies --force --rewire
   * # then, cd into /tmp/global-remote and tar the directory
   * tar -czf global-remote.tgz global-remote
   * # copy the file to the fixtures/scopes directory.
   */
  ensureGlobalRemoteScope() {
    if (fs.existsSync(this.scopes.globalRemotePath)) return;
    const scopeFile = path.join(this.getFixturesDir(), 'scopes', 'global-remote.tgz');
    tar.extract({
      sync: true,
      file: scopeFile,
      cwd: this.scopes.e2eDir
    });
  }
}
