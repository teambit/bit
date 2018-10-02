// @flow
import R from 'ramda';
import rightpad from 'pad-right';
import chalk from 'chalk';
import glob from 'glob';
import os from 'os';
import path from 'path';
import childProcess from 'child_process';
import fs from 'fs-extra';
import json from 'comment-json';
import { expect } from 'chai';
import set from 'lodash.set';
import { VERSION_DELIMITER, BIT_VERSION, BIT_MAP } from '../src/constants';
import defaultErrorHandler from '../src/cli/default-error-handler';
import * as fixtures from './fixtures/fixtures';

const generateRandomStr = (size: number = 8): string => {
  return Math.random()
    .toString(36)
    .slice(size * -1);
};

export default class Helper {
  debugMode: boolean;
  localScope: string;
  localScopePath: string;
  remoteScope: string;
  remoteScopePath: string;
  envScope: string;
  envScopePath: string;
  e2eDir: string;
  bitBin: string;
  compilerCreated: boolean;
  cache: Object;
  clonedScopes: string[] = [];
  keepEnvs: boolean;
  externalDirsArray: string[] = [];
  constructor() {
    this.debugMode = !!process.env.npm_config_debug; // default = false
    this.remoteScope = `${generateRandomStr()}-remote`;
    this.e2eDir = path.join(os.tmpdir(), 'bit', 'e2e');
    this.setLocalScope();
    this.remoteScopePath = path.join(this.e2eDir, this.remoteScope);
    this.bitBin = process.env.npm_config_bit_bin || 'bit'; // e.g. npm run e2e-test --bit_bin=bit-dev
    this.envScope = `${generateRandomStr()}-env`;
    this.envScopePath = path.join(this.e2eDir, this.envScope);
    this.compilerCreated = false;
    this.keepEnvs = !!process.env.npm_config_keep_envs; // default = false
  }

  // #region General
  runCmd(cmd: string, cwd: string = this.localScopePath) {
    if (this.debugMode) console.log(rightpad(chalk.green('cwd: '), 20, ' '), cwd); // eslint-disable-line
    if (cmd.startsWith('bit ')) cmd = cmd.replace('bit', this.bitBin);
    if (this.debugMode) console.log(rightpad(chalk.green('command: '), 20, ' '), cmd); // eslint-disable-line
    const cmdOutput = childProcess.execSync(cmd, { cwd });
    if (this.debugMode) console.log(rightpad(chalk.green('output: '), 20, ' '), chalk.cyan(cmdOutput.toString())); // eslint-disable-line
    return cmdOutput.toString();
  }

  runWithTryCatch(cmd: string, cwd: string = this.localScopePath) {
    let output;
    try {
      output = this.runCmd(cmd, cwd);
    } catch (err) {
      output = err.toString() + err.stdout.toString();
    }
    return output;
  }

  static removeChalkCharacters(str?: ?string): ?string {
    if (!str) return str;
    return str.replace(/\u001b\[.*?m/g, '');
  }

  static alignOutput(str?: ?string): ?string {
    if (!str) return str;
    // on Mac the directory '/var' is sometimes shown as '/private/var'
    // $FlowFixMe
    return Helper.removeChalkCharacters(str).replace(/\/private\/var/g, '/var');
  }

  expectToThrow(cmdFunc: Function, error: Error) {
    let output;
    try {
      cmdFunc();
    } catch (err) {
      output = err.toString();
    }

    const errorString = defaultErrorHandler(error);
    expect(Helper.alignOutput(output)).to.have.string(Helper.alignOutput(errorString));
  }
  cleanEnv() {
    fs.emptyDirSync(this.localScopePath);
    fs.emptyDirSync(this.remoteScopePath);
  }

  destroyEnv() {
    if (this.keepEnvs) return;
    fs.removeSync(this.localScopePath);
    fs.removeSync(this.remoteScopePath);
    if (this.cache) {
      fs.removeSync(this.cache.localScopePath);
      fs.removeSync(this.cache.remoteScopePath);
    }
    if (this.clonedScopes && this.clonedScopes.length) {
      this.clonedScopes.forEach(scopePath => fs.removeSync(scopePath));
    }
    this.externalDirsArray.forEach((dirPath) => {
      this.cleanDir(dirPath);
    });
  }

  createNewDirectory() {
    const newDir = `${generateRandomStr()}-dir`;
    const newDirPath = path.join(this.e2eDir, newDir);
    fs.ensureDirSync(newDirPath);
    this.externalDirsArray.push(newDirPath);
    return newDirPath;
  }

  cleanDir(dirPath: string) {
    fs.removeSync(dirPath);
  }

  getRequireBitPath(box: string, name: string) {
    return `@bit/${this.remoteScope}.${box}.${name}`;
  }

  getBitVersion() {
    return BIT_VERSION;
  }
  // #endregion

  // #region npm utils

  initNpm(initPath: string = path.join(this.localScopePath)) {
    this.runCmd('npm init -y', initPath);
  }

  nodeStart(mainFilePath: string, cwd?: string) {
    return this.runCmd(`node ${mainFilePath}`, cwd);
  }

  npmLink(libraryName: string, cwd: string = process.cwd()) {
    return this.runCmd(`npm link ${libraryName}`, cwd);
  }
  // #endregion

  // #region scopes utils (init, remote etc')

  setLocalScope(localScope?: string) {
    this.localScope = localScope || `${generateRandomStr()}-local`;
    this.localScopePath = path.join(this.e2eDir, this.localScope);
    if (!fs.existsSync(this.localScopePath)) {
      fs.ensureDirSync(this.localScopePath);
    }
  }
  cleanLocalScope() {
    fs.emptyDirSync(this.localScopePath);
  }

  reInitLocalScope() {
    this.cleanLocalScope();
    this.initLocalScope();
  }

  initLocalScope() {
    return this.runCmd('bit init');
  }

  initLocalScopeWithOptions(options: ?Object) {
    const value = Object.keys(options)
      .map(key => `-${key} ${options[key]}`)
      .join(' ');
    return this.runCmd(`bit init ${value}`);
  }
  setNewLocalAndRemoteScopes() {
    if (!this.cache) {
      this.reInitLocalScope();
      this.reInitRemoteScope();
      this.addRemoteScope();
      this.cache = {
        localScopePath: path.join(this.e2eDir, generateRandomStr()),
        remoteScopePath: path.join(this.e2eDir, generateRandomStr())
      };
      if (this.debugMode) {
        console.log(
          chalk.green(`not in the cache. cloning a scope from ${this.localScopePath} to ${this.cache.localScopePath}`)
        );
      }
      fs.copySync(this.localScopePath, this.cache.localScopePath);
      fs.copySync(this.remoteScopePath, this.cache.remoteScopePath);
    } else {
      if (this.debugMode) {
        console.log(chalk.green(`cloning a scope from ${this.cache.localScopePath} to ${this.localScopePath}`));
      }
      fs.removeSync(this.localScopePath);
      fs.removeSync(this.remoteScopePath);
      fs.copySync(this.cache.localScopePath, this.localScopePath);
      fs.copySync(this.cache.remoteScopePath, this.remoteScopePath);
    }
  }

  initNewLocalScope(deleteCurrentScope: boolean = true) {
    if (deleteCurrentScope) {
      fs.removeSync(this.localScopePath);
    }
    this.setLocalScope();
    fs.ensureDirSync(this.localScopePath);
    return this.runCmd('bit init');
  }
  addRemoteScope(remoteScopePath: string = this.remoteScopePath, localScopePath: string = this.localScopePath) {
    if (process.env.npm_config_with_ssh) {
      return this.runCmd(`bit remote add ssh://\`whoami\`@127.0.0.1:/${remoteScopePath}`, localScopePath);
    }
    return this.runCmd(`bit remote add file://${remoteScopePath}`, localScopePath);
  }

  addRemoteEnvironment() {
    return this.runCmd(`bit remote add file://${this.envScopePath}`, this.localScopePath);
  }

  reInitRemoteScope() {
    fs.emptyDirSync(this.remoteScopePath);
    return this.runCmd('bit init --bare', this.remoteScopePath);
  }

  reInitEnvsScope() {
    fs.emptyDirSync(this.envScopePath);
    return this.runCmd('bit init --bare', this.envScopePath);
  }

  listRemoteScope(bare: boolean = true) {
    return this.runCmd(`bit list ${this.remoteScope} ${bare ? '--bare' : ''}`);
  }
  listLocalScope(options: string = '') {
    return this.runCmd(`bit list ${options}`);
  }
  listLocalScopeParsed(options: string = '') {
    const output = this.runCmd(`bit list --json ${options}`);
    return JSON.parse(output);
  }

  getNewBareScope(scopeNameSuffix?: string = '-remote2') {
    const scopeName = generateRandomStr() + scopeNameSuffix;
    const scopePath = path.join(this.e2eDir, scopeName);
    fs.emptyDirSync(scopePath);
    this.runCmd('bit init --bare', scopePath);
    this.addRemoteScope(this.remoteScopePath, scopePath);
    return { scopeName, scopePath };
  }
  /**
   * Sometimes many tests need to do the exact same steps to init the local-scope, such as importing compiler/tester.
   * To make it faster, use this method before all tests, and then use getClonedLocalScope method to restore from the
   * cloned scope.
   */
  cloneLocalScope() {
    const clonedScope = `${generateRandomStr()}-clone`;
    const clonedScopePath = path.join(this.e2eDir, clonedScope);
    if (this.debugMode) console.log(`cloning a scope from ${this.localScopePath} to ${clonedScopePath}`);
    fs.copySync(this.localScopePath, clonedScopePath);
    this.clonedScopes.push(clonedScopePath);
    return clonedScopePath;
  }

  getClonedLocalScope(clonedScopePath: string, deleteCurrentScope: boolean = true) {
    if (deleteCurrentScope) {
      fs.removeSync(this.localScopePath);
    } else {
      this.setLocalScope();
    }
    if (this.debugMode) console.log(`cloning a scope from ${clonedScopePath} to ${this.localScopePath}`);
    fs.copySync(clonedScopePath, this.localScopePath);
  }

  cloneRemoteScope() {
    const clonedScope = generateRandomStr();
    const clonedScopePath = path.join(this.e2eDir, clonedScope);
    if (this.debugMode) console.log(`cloning a scope from ${this.remoteScopePath} to ${clonedScopePath}`);
    fs.copySync(this.remoteScopePath, clonedScopePath);
    this.clonedScopes.push(clonedScopePath);
    return clonedScopePath;
  }

  getClonedRemoteScope(clonedScopePath: string, deleteCurrentScope: boolean = true) {
    if (deleteCurrentScope) {
      fs.removeSync(this.remoteScopePath);
    } else {
      this.getNewBareScope();
    }
    if (this.debugMode) console.log(`cloning a scope from ${clonedScopePath} to ${this.remoteScopePath}`);
    fs.copySync(clonedScopePath, this.remoteScopePath);
  }
  // #endregion

  // #region file system utils (create / delete / modify files etc')
  getConsumerFiles(ext: string = '*.{js,ts}', includeDot: boolean = true) {
    return glob
      .sync(path.normalize(`**/${ext}`), { cwd: this.localScopePath, dot: includeDot })
      .map(x => path.normalize(x));
  }
  createFile(folder: string = 'bar', name: string = 'foo.js', impl?: string = fixtures.fooFixture) {
    const filePath = path.join(this.localScopePath, folder, name);
    fs.outputFileSync(filePath, impl);
  }

  createFileOnRootLevel(name: string = 'foo.js', impl?: string = fixtures.fooFixture) {
    const filePath = path.join(this.localScopePath, name);
    fs.outputFileSync(filePath, impl);
  }

  readFile(filePathRelativeToLocalScope: string): string {
    return fs.readFileSync(path.join(this.localScopePath, filePathRelativeToLocalScope)).toString();
  }

  /**
   * adds "\n" at the beginning of the file to make it modified.
   */
  modifyFile(filePath: string) {
    const content = fs.readFileSync(filePath);
    fs.outputFileSync(filePath, `\n${content}`);
  }

  deleteFile(relativePathToLocalScope: string) {
    return fs.removeSync(path.join(this.localScopePath, relativePathToLocalScope));
  }
  // #endregion

  // #region Bit commands
  catScope() {
    const result = this.runCmd('bit cat-scope --json');
    return JSON.parse(result);
  }

  catObject(hash: string, parse: boolean = false) {
    const result = this.runCmd(`bit cat-object ${hash}`);
    if (!parse) return result;
    return JSON.parse(result);
  }

  catComponent(id: string, cwd?: string): Object {
    const result = this.runCmd(`bit cat-component ${id}`, cwd);
    return JSON.parse(result);
  }
  addComponent(filePaths: string = path.normalize('bar/foo.js'), cwd: string = this.localScopePath) {
    return this.runCmd(`bit add ${filePaths}`, cwd);
  }

  untrackComponent(id: string = '', all: boolean = false, cwd: string = this.localScopePath) {
    return this.runCmd(`bit untrack ${id} ${all ? '--all' : ''}`, cwd);
  }
  commitComponent(id: string, commitMsg: string = 'commit-message', options: string = '') {
    return this.runCmd(`bit tag ${id} -m ${commitMsg} ${options}`);
  }
  tagWithoutMessage(id: string, version: string = '', options: string = '') {
    return this.runCmd(`bit tag ${id} ${version} ${options}`);
  }
  removeComponent(id: string, flags: string = '') {
    return this.runCmd(`bit remove ${id} ${flags}`);
  }
  deprecateComponent(id: string, flags: string = '') {
    return this.runCmd(`bit deprecate ${id} ${flags}`);
  }

  commitAllComponents(commitMsg: string = 'commit-message', options: string = '', version: string = '') {
    return this.runCmd(`bit tag ${options} -a ${version} -m ${commitMsg} `);
  }
  tagAllWithoutMessage(options: string = '', version: string = '') {
    return this.runCmd(`bit tag -a ${version} ${options} `);
  }

  tagScope(version: string, message: string = 'commit-message', options: string = '') {
    return this.runCmd(`bit tag -s ${version} -m ${message} ${options}`);
  }

  exportComponent(id: string, scope: string = this.remoteScope, assert: boolean = true) {
    const result = this.runCmd(`bit export ${scope} ${id}`);
    if (assert) expect(result).to.not.have.string('nothing to export');
    return result;
  }

  ejectComponents(ids: string, flags?: string) {
    return this.runCmd(`bit eject ${ids} ${flags || ''}`);
  }
  ejectComponentsParsed(ids: string, flags?: string) {
    const result = this.runCmd(`bit eject ${ids} ${flags || ''} --json`);
    const jsonStart = result.indexOf('{');
    const jsonResult = result.substring(jsonStart);
    return JSON.parse(jsonResult);
  }

  exportAllComponents(scope: string = this.remoteScope) {
    return this.runCmd(`bit export ${scope}`);
  }

  importComponent(id: string) {
    return this.runCmd(`bit import ${this.remoteScope}/${id}`);
  }

  importComponentWithOptions(id: string = 'bar/foo.js', options: ?Object) {
    const value = Object.keys(options)
      .map(key => `-${key} ${options[key]}`)
      .join(' ');
    return this.runCmd(`bit import ${this.remoteScope}/${id} ${value}`);
  }

  importAllComponents(writeToFileSystem: boolean = false) {
    return this.runCmd(`bit import ${writeToFileSystem ? '--merge' : ''}`);
  }

  isolateComponent(id: string, flags: string): string {
    const isolatedEnvOutput = this.runCmd(`bit isolate ${this.remoteScope}/${id} ${this.remoteScopePath} ${flags}`);
    const isolatedEnvOutputArray = isolatedEnvOutput.split('\n').filter(str => str);
    return isolatedEnvOutputArray[isolatedEnvOutputArray.length - 1];
  }
  importCompiler(id?) {
    if (!id) {
      id = `${this.envScope}/compilers/babel`;
      this.createCompiler();
    }
    // Temporary - for checking new serialization against the stage env
    // this.setHubDomain('hub-stg.bitsrc.io');
    return this.runCmd(`bit import ${id} --compiler`);
  }

  importTester(id) {
    // Temporary - for checking new serialization against the stage env
    // this.setHubDomain('hub-stg.bitsrc.io');
    this.runCmd(`bit import ${id} --tester`);
  }

  build(id?: string = '') {
    return this.runCmd(`bit build ${id}`);
  }

  buildComponentWithOptions(id: string = '', options: ?Object, cwd: string = this.localScopePath) {
    const value = Object.keys(options)
      .map(key => `-${key} ${options[key]}`)
      .join(' ');
    return this.runCmd(`bit build ${id} ${value}`, cwd);
  }

  addComponentWithOptions(filePaths: string = 'bar/foo.js', options: ?Object, cwd: string = this.localScopePath) {
    const value = Object.keys(options)
      .map(key => `-${key} ${options[key]}`)
      .join(' ');
    return this.runCmd(`bit add ${filePaths} ${value}`, cwd);
  }

  testComponent(id: string = '') {
    return this.runCmd(`bit test ${id}`);
  }

  testComponentWithOptions(id: string = '', options: ?Object, cwd: string = this.localScopePath) {
    const value = Object.keys(options)
      .map(key => `-${key} ${options[key]}`)
      .join(' ');
    return this.runCmd(`bit test ${id} ${value}`, cwd);
  }

  searchComponent(args) {
    return this.runCmd(`bit search ${args}`);
  }

  status() {
    return this.runCmd('bit status');
  }

  statusJson() {
    const status = this.runCmd('bit status --json');
    return JSON.parse(status);
  }

  showComponent(id: string = 'bar/foo') {
    return this.runCmd(`bit show ${id}`);
  }

  showComponentParsed(id: string = 'bar/foo') {
    const output = this.runCmd(`bit show ${id} --json`);
    return JSON.parse(output);
  }

  showComponentWithOptions(id: string = 'bar/foo', options: ?Object) {
    const value = Object.keys(options)
      .map(key => `-${key} ${options[key]}`)
      .join(' ');
    return this.runCmd(`bit show ${id} ${value}`);
  }

  checkoutVersion(version: string, ids: string, flags?: string, cwd?: string) {
    return this.runCmd(`bit checkout ${version} ${ids} ${flags || ''}`, cwd);
  }

  checkout(values: string) {
    return this.runCmd(`bit checkout ${values}`);
  }

  mergeVersion(version: string, ids: string, flags?: string) {
    return this.runCmd(`bit merge ${version} ${ids} ${flags || ''}`);
  }

  diff(id?: string = '') {
    const output = this.runCmd(`bit diff ${id}`);
    return Helper.removeChalkCharacters(output);
  }

  move(from: string, to: string) {
    return this.runCmd(`bit move ${path.normalize(from)} ${path.normalize(to)}`);
  }
  envsAttach(ids: string[] = ['bar/foo'], options: ?Object) {
    const joinedIds = ids.join(' ');
    const value = Object.keys(options)
      .map(key => `-${key} ${options[key]}`)
      .join(' ');
    return this.runCmd(`bit envs-attach ${joinedIds} ${value}`);
  }
  ejectConf(id: string = 'bar/foo', options: ?Object) {
    const value = options
      ? Object.keys(options)
        .map(key => `-${key} ${options[key]}`)
        .join(' ')
      : '';
    return this.runCmd(`bit eject-conf ${id} ${value}`);
  }
  injectConf(id: string = 'bar/foo', options: ?Object) {
    const value = options
      ? Object.keys(options)
        .map(key => `-${key} ${options[key]}`)
        .join(' ')
      : '';
    return this.runCmd(`bit inject-conf ${id} ${value}`);
  }
  setHubDomain(domain: string = 'hub.bitsrc.io') {
    this.runCmd(`bit config set hub_domain ${domain}`);
  }
  // #endregion

  // #region bit commands on templates (like add BarFoo / create compiler)
  createComponentBarFoo(impl?: string) {
    this.createFile(undefined, undefined, impl);
  }

  addComponentBarFoo() {
    return this.addComponent();
  }

  commitComponentBarFoo() {
    return this.commitComponent('bar/foo');
  }

  createCompiler() {
    if (this.compilerCreated) return this.addRemoteScope(this.envScopePath);

    const tempScope = `${generateRandomStr()}-temp`;
    const tempScopePath = path.join(this.e2eDir, tempScope);
    fs.emptyDirSync(tempScopePath);

    this.runCmd('bit init', tempScopePath);

    const sourceDir = path.join(__dirname, 'fixtures', 'compilers', 'babel');
    const compiler = fs.readFileSync(path.join(sourceDir, 'compiler.js'), 'utf-8');
    fs.writeFileSync(path.join(tempScopePath, 'compiler.js'), compiler);

    const babelCorePackageJson = { name: 'babel-core', version: '6.25.0' };
    const babelPluginTransformObjectRestSpreadPackageJson = {
      name: 'babel-plugin-transform-object-rest-spread',
      version: '6.23.0'
    };
    const babelPresetLatestPackageJson = { name: 'babel-preset-latest', version: '6.24.1' };
    const vinylPackageJson = { name: 'vinyl', version: '2.1.0' };

    const nodeModulesDir = path.join(tempScopePath, 'node_modules');

    ensureAndWriteJson(path.join(nodeModulesDir, 'babel-core', 'package.json'), babelCorePackageJson);
    ensureAndWriteJson(
      path.join(nodeModulesDir, 'babel-plugin-transform-object-rest-spread', 'package.json'),
      babelPluginTransformObjectRestSpreadPackageJson
    );
    ensureAndWriteJson(path.join(nodeModulesDir, 'babel-preset-latest', 'package.json'), babelPresetLatestPackageJson);
    ensureAndWriteJson(path.join(nodeModulesDir, 'vinyl', 'package.json'), vinylPackageJson);

    ensureAndWriteJson(path.join(nodeModulesDir, 'babel-core', 'index.js'), '');
    ensureAndWriteJson(path.join(nodeModulesDir, 'babel-plugin-transform-object-rest-spread', 'index.js'), '');
    ensureAndWriteJson(path.join(nodeModulesDir, 'babel-preset-latest', 'index.js'), '');
    ensureAndWriteJson(path.join(nodeModulesDir, 'vinyl', 'index.js'), '');

    this.runCmd('bit add compiler.js -i compilers/babel', tempScopePath);
    this.runCmd('bit tag compilers/babel -m msg', tempScopePath);

    fs.emptyDirSync(this.envScopePath);
    this.runCmd('bit init --bare', this.envScopePath);
    this.runCmd(`bit remote add file://${this.envScopePath}`, tempScopePath);
    this.runCmd(`bit export ${this.envScope} compilers/babel`, tempScopePath);
    this.addRemoteScope(this.envScopePath);
    this.compilerCreated = true;
    return true;
  }
  // #endregion

  // #region bit.json manipulation
  addBitJsonDependencies(bitJsonPath: string, dependencies: Object, packageDependencies: Object) {
    const bitJson = this.readBitJson(bitJsonPath);
    bitJson.dependencies = bitJson.dependencies || {};
    bitJson.packageDependencies = bitJson.packageDependencies || {};
    Object.assign(bitJson.dependencies, dependencies);
    Object.assign(bitJson.packageDependencies, packageDependencies);
    fs.writeJSONSync(bitJsonPath, bitJson, { spaces: 2 });
  }

  readBitJson(bitJsonPath: string = path.join(this.localScopePath, 'bit.json')) {
    return fs.existsSync(bitJsonPath) ? fs.readJSONSync(bitJsonPath) : {};
  }

  addKeyValToBitJson(bitJsonPath: string = path.join(this.localScopePath, 'bit.json'), key: string, val: Any) {
    const bitJson = this.readBitJson(bitJsonPath);
    bitJson[key] = val;
    fs.writeJSONSync(bitJsonPath, bitJson, { spaces: 2 });
  }

  getEnvNameFromBitJsonByType(bitJson: Object, envType: 'compiler' | 'tester') {
    const env = bitJson.env[envType];
    const envName = typeof env === 'string' ? env : Object.keys(env)[0];
    return envName;
  }

  getEnvFromBitJsonByType(bitJson: Object, envType: 'compiler' | 'tester') {
    const basePath = ['env', envType];
    const env = R.path(basePath, bitJson);
    const envName = Object.keys(env)[0];
    return env[envName];
  }

  addKeyValToEnvPropInBitJson(
    bitJsonPath: string = path.join(this.localScopePath, 'bit.json'),
    propName: string,
    key: string,
    val: string,
    envType: 'compiler' | 'tester'
  ) {
    const bitJson = this.readBitJson(bitJsonPath);
    const envName = this.getEnvNameFromBitJsonByType(bitJson, envType);
    const propPath = ['env', envType, envName, propName];
    const prop = R.pathOr({}, propPath, bitJson);
    prop[key] = val;
    set(bitJson, propPath, prop);
    fs.writeJSONSync(bitJsonPath, bitJson, { spaces: 2 });
  }

  addFileToEnvInBitJson(
    bitJsonPath: string = path.join(this.localScopePath, 'bit.json'),
    fileName: string,
    filePath: string,
    envType: 'compiler' | 'tester'
  ) {
    this.addKeyValToEnvPropInBitJson(bitJsonPath, 'files', fileName, filePath, envType);
  }

  addToRawConfigOfEnvInBitJson(
    bitJsonPath: string = path.join(this.localScopePath, 'bit.json'),
    key: string,
    val: string,
    envType: 'compiler' | 'tester'
  ) {
    this.addKeyValToEnvPropInBitJson(bitJsonPath, 'rawConfig', key, val, envType);
  }
  manageWorkspaces(withWorkspaces: boolean = true, bitJsonPath: string = path.join(this.localScopePath, 'bit.json')) {
    const bitJson = this.readBitJson(bitJsonPath);
    bitJson.packageManager = 'yarn';
    bitJson.manageWorkspaces = withWorkspaces;
    bitJson.useWorkspaces = withWorkspaces;
    this.writeBitJson(bitJson);
  }
  writeBitJson(bitJson: Object, bitJsonPath: string = path.join(this.localScopePath, 'bit.json')) {
    return fs.writeJSONSync(bitJsonPath, bitJson, { spaces: 2 });
  }
  setComponentsDirInBitJson(content: string, bitJsonPath: string = path.join(this.localScopePath, 'bit.json')) {
    const bitJson = this.readBitJson(bitJsonPath);
    bitJson.componentsDefaultDirectory = content;
    this.writeBitJson(bitJson);
  }
  corruptBitJson(bitJsonPath: string = path.join(this.localScopePath, 'bit.json')) {
    const bitJson = this.readBitJson();
    bitJson.corrupt = '"corrupted';
    fs.writeFileSync(bitJsonPath, bitJson.toString());
  }
  modifyFieldInBitJson(key: string, value: string, bitJsonPath: string = path.join(this.localScopePath, 'bit.json')) {
    const bitJson = this.readBitJson();
    bitJson[key] = value;
    fs.writeJsonSync(bitJsonPath, bitJson, { spaces: 2 });
  }
  // #endregion

  // #region .bitmap manipulation
  readBitMap(bitMapPath: string = path.join(this.localScopePath, BIT_MAP), withoutComment: boolean = true) {
    const map = fs.readFileSync(bitMapPath) || {};
    return json.parse(map.toString('utf8'), null, withoutComment);
  }

  readBitMapWithoutVersion() {
    const bitMap = this.readBitMap();
    delete bitMap.version;
    return bitMap;
  }

  writeBitMap(bitMap: Object) {
    const bitMapPath = path.join(this.localScopePath, BIT_MAP);
    return fs.writeJSONSync(bitMapPath, bitMap, { spaces: 2 });
  }
  createBitMap(
    cwd: string = this.localScopePath,
    componentObject = {
      'bar/foo': {
        files: [
          {
            relativePath: 'bar/foo.js',
            test: false,
            name: 'foo.js'
          }
        ],
        mainFile: 'bar/foo.js',
        origin: 'AUTHORED'
      }
    },
    oldBitMapFile: boolean = false
  ) {
    const bitmapFile = path.join(cwd, oldBitMapFile ? '.bit.map.json' : BIT_MAP);

    const bitmap = {
      version: '0.11.1-testing'
    };
    Object.keys(componentObject).forEach(key => (bitmap[key] = componentObject[key]));
    fs.ensureFileSync(bitmapFile);
    return fs.writeJsonSync(bitmapFile, bitmap, { spaces: 2 });
  }
  printBitMapFilesInCaseOfError(files: Object[]): string {
    const filesStr = files.map(f => f.name).join(', ');
    return `Files in bitmap file: ${filesStr}`;
  }
  // #endregion

  // #region Packages/package.json manipulation (npm install / modify / create package.json)
  createPackageJson(data: Object, location: string = this.localScopePath) {
    const packageJsonPath = path.join(location, 'package.json');
    fs.writeJSONSync(packageJsonPath, data, { spaces: 2 });
  }

  /**
   * install package, if you don't really need the package code and can use mock
   * just run addNpmPackage which will be faster
   * @param {*} name
   * @param {*} version
   */
  installNpmPackage(name: string, version: ?string, cwd: string = this.localScopePath) {
    const versionWithDelimiter = version ? `@${version}` : '';
    const cmd = `npm i --save ${name}${versionWithDelimiter}`;
    return this.runCmd(cmd, cwd);
  }
  /**
   * Add a fake package, don't really install it. if you need the real package
   * use installNpmPackage below
   * @param {*} name
   * @param {*} version
   */
  addNpmPackage(name: string = 'lodash.get', version: string = '4.4.2') {
    const packageJsonFixture = JSON.stringify({ name, version });
    this.createFile(`node_modules/${name}`, 'index.js');
    this.createFile(`node_modules/${name}`, 'package.json', packageJsonFixture);
  }
  addKeyValueToPackageJson(data: Object, pkgJsonPath: string = path.join(this.localScopePath)) {
    const pkgJson = this.readPackageJson(pkgJsonPath);
    fs.writeJSONSync(path.join(pkgJsonPath, 'package.json'), Object.assign(pkgJson, data), { spaces: 2 });
  }
  readPackageJson(packageJsonFolder: string = this.localScopePath) {
    const packageJsonPath = path.join(packageJsonFolder, 'package.json');
    return fs.readJSONSync(packageJsonPath) || {};
  }
  writePackageJson(packageJson: Object, packageJsonFolder: string = this.localScopePath) {
    const packageJsonPath = path.join(packageJsonFolder, 'package.json');
    return fs.writeJSONSync(packageJsonPath, packageJson, { spaces: 2 });
  }

  readComponentPackageJson(id: string) {
    const packageJsonFolderPath = path.join(this.localScopePath, 'components', id);
    return this.readPackageJson(packageJsonFolderPath);
  }
  // #endregion

  // #region Git utils
  writeGitIgnore(list: string[]) {
    const gitIgnorePath = path.join(this.localScopePath, '.gitignore');
    return fs.writeFileSync(gitIgnorePath, list.join('\n'));
  }
  writeToGitHook(hookName: string, content: string) {
    const hookPath = path.join(this.localScopePath, '.git', 'hooks', hookName);
    return fs.outputFileSync(hookPath, content);
  }
  initNewGitRepo() {
    return this.runCmd('git init');
  }

  addGitConfig(key, val, location = 'local') {
    return this.runCmd(`git config --${location} ${key} ${val}`);
  }

  unsetGitConfig(key, location = 'local') {
    return this.runCmd(`git config --unset --${location} ${key}`);
  }
  mimicGitCloneLocalProject(cloneWithComponentsFiles: boolean = true) {
    fs.removeSync(path.join(this.localScopePath, '.bit'));
    if (!cloneWithComponentsFiles) fs.removeSync(path.join(this.localScopePath, 'components'));
    // delete all node-modules from all directories
    const directories = glob.sync(path.normalize('**/'), { cwd: this.localScopePath, dot: true });
    directories.forEach((dir) => {
      if (dir.includes('node_modules')) {
        fs.removeSync(path.join(this.localScopePath, dir));
      }
    });
    this.runCmd('bit init');
  }
  // #endregion

  // #region fixtures utils
  getFixturesDir() {
    return path.join(__dirname, 'fixtures');
  }

  copyFixtureComponents(dir: string = '', cwd: string = this.localScopePath) {
    const sourceDir = path.join(__dirname, 'fixtures', 'components', dir);
    fs.copySync(sourceDir, cwd);
  }

  copyFixtureFile(
    pathToFile: string = '',
    newName: string = path.basename(pathToFile),
    cwd: string = this.localScopePath
  ) {
    const sourceFile = path.join(__dirname, 'fixtures', pathToFile);
    const distFile = path.join(cwd, newName);
    if (this.debugMode) console.log(chalk.green(`copying fixture ${sourceFile} to ${distFile}\n`)); // eslint-disable-line
    fs.copySync(sourceFile, distFile);
  }
  // #endregion
}

function ensureAndWriteJson(filePath, fileContent) {
  fs.ensureFileSync(filePath);
  fs.writeJsonSync(filePath, fileContent, { spaces: 2 });
}

export { VERSION_DELIMITER };
