// @flow
import path from 'path';
import fs from 'fs-extra';
import chalk from 'chalk';
import FsHelper from './e2e-fs-helper';
import CommandHelper from './e2e-command-helper';
import * as fixtures from '../../e2e/fixtures/fixtures';
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
  createComponentBarFoo(impl?: string = fixtures.fooFixture) {
    this.fs.createFile('bar', 'foo.js', impl);
  }

  createComponentUtilsIsType(impl?: string = fixtures.isType) {
    this.fs.createFile('utils', 'is-type.js', impl);
  }

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

  copyFixtureComponents(dir: string = '', cwd: string = this.scopes.localPath) {
    const sourceDir = path.join(this.getFixturesDir(), 'components', dir);
    fs.copySync(sourceDir, cwd);
  }

  copyFixtureFile(
    pathToFile: string = '',
    newName: string = path.basename(pathToFile),
    cwd: string = this.scopes.localPath
  ) {
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
}
