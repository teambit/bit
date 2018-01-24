// @flow
import glob from 'glob';
import os from 'os';
import path from 'path';
import childProcess from 'child_process';
import fs from 'fs-extra';
import json from 'comment-json';
import v4 from 'uuid';
import { VERSION_DELIMITER } from '../src/constants';

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
  constructor() {
    this.debugMode = !!process.env.npm_config_debug;
    this.remoteScope = `${v4()}-remote`;
    this.e2eDir = path.join(os.tmpdir(), 'bit', 'e2e');
    this.setLocalScope();
    this.remoteScopePath = path.join(this.e2eDir, this.remoteScope);
    this.bitBin = process.env.npm_config_bit_bin || 'bit'; // e.g. npm run e2e-test --bit_bin=bit-dev
    this.envScope = `${v4()}-env`;
    this.envScopePath = path.join(this.e2eDir, this.envScope);
    this.compilerCreated = false;
  }

  setLocalScope(localScope?: string) {
    this.localScope = localScope || `${v4()}-local`;
    this.localScopePath = path.join(this.e2eDir, this.localScope);
  }

  runCmd(cmd: string, cwd: string = this.localScopePath) {
    if (this.debugMode) console.log('cwd: ', cwd); // eslint-disable-line
    if (cmd.startsWith('bit ')) cmd = cmd.replace('bit', this.bitBin);
    if (this.debugMode) console.log('command: ', cmd); // eslint-disable-line
    const cmdOutput = childProcess.execSync(cmd, { cwd });
    if (this.debugMode) console.log('output: ', cmdOutput.toString()); // eslint-disable-line
    return cmdOutput.toString();
  }

  setHubDomain(domain: string = 'hub.bitsrc.io') {
    this.runCmd(`bit config set hub_domain ${domain}`);
  }

  addBitJsonDependencies(bitJsonPath: string, dependencies: Object, packageDependencies: Object) {
    const bitJson = fs.existsSync(bitJsonPath) ? fs.readJSONSync(bitJsonPath) : {};
    bitJson.dependencies = bitJson.dependencies || {};
    bitJson.packageDependencies = bitJson.packageDependencies || {};
    Object.assign(bitJson.dependencies, dependencies);
    Object.assign(bitJson.packageDependencies, packageDependencies);
    fs.writeJSONSync(bitJsonPath, bitJson);
  }

  readBitJson(bitJsonPath: string = path.join(this.localScopePath, 'bit.json')) {
    return fs.readJSONSync(bitJsonPath) || {};
  }

  createPackageJson(
    name: string = 'test',
    version: string = '0.0.1',
    packageJsonPath: string = path.join(this.localScopePath, 'package.json')
  ) {
    const packageJson = { name, version };
    fs.writeJSONSync(packageJsonPath, packageJson);
  }
  manageWorkspaces(withWorkspaces: boolean = true, bitJsonPath: string = path.join(this.localScopePath, 'bit.json')) {
    const bitJson = this.readBitJson(bitJsonPath);
    bitJson.packageManager = 'yarn';
    bitJson.manageWorkspaces = withWorkspaces;
    bitJson.useWorkspaces = withWorkspaces;
    this.writeBitJson(bitJson);
  }
  addkeyValueToPackageJson(data: Object, pkgJsonPath: string = path.join(this.localScopePath)) {
    const pkgJson = this.readPackageJson(pkgJsonPath);
    fs.writeJSONSync(path.join(pkgJsonPath, 'package.json'), Object.assign(pkgJson, data));
  }
  readPackageJson(packageJsonFolder: string = this.localScopePath) {
    const packageJsonPath = path.join(packageJsonFolder, 'package.json');
    return fs.readJSONSync(packageJsonPath) || {};
  }

  catScope() {
    const result = this.runCmd('bit cat-scope --json');
    return JSON.parse(result);
  }

  writeBitJson(bitJson: Object) {
    const bitJsonPath = path.join(this.localScopePath, 'bit.json');
    return fs.writeJSONSync(bitJsonPath, bitJson);
  }

  readBitMap(bitMapPath: string = path.join(this.localScopePath, '.bitmap'), withoutComment: boolean = true) {
    const map = fs.readFileSync(bitMapPath) || {};
    return json.parse(map.toString('utf8'), null, withoutComment);
  }

  readBitMapWithoutVersion() {
    const bitMap = this.readBitMap();
    delete bitMap.version;
    return bitMap;
  }

  writeBitMap(bitMap: Object) {
    const bitMapPath = path.join(this.localScopePath, '.bitmap');
    return fs.writeJSONSync(bitMapPath, bitMap);
  }
  setComponentsDirInBitJson(content: string, bitJsonPath: string = path.join(this.localScopePath, 'bit.json')) {
    const bitJson = this.readBitJson(bitJsonPath);
    bitJson.componentsDefaultDirectory = content;
    this.writeBitJson(bitJson);
  }
  writeGitIgnore(list: string[]) {
    const gitIgnorePath = path.join(this.localScopePath, '.gitignore');
    return fs.writeFileSync(gitIgnorePath, list.join('\n'));
  }

  cleanEnv() {
    fs.emptyDirSync(this.localScopePath);
    fs.emptyDirSync(this.remoteScopePath);
  }

  destroyEnv() {
    fs.removeSync(this.localScopePath);
    fs.removeSync(this.remoteScopePath);
    if (this.cache) {
      fs.removeSync(this.cache.localScopePath);
      fs.removeSync(this.cache.remoteScopePath);
    }
    if (this.clonedScopes && this.clonedScopes.length) {
      this.clonedScopes.forEach(scopePath => fs.removeSync(scopePath));
    }
  }

  reInitLocalScope() {
    fs.emptyDirSync(this.localScopePath);
    this.initLocalScope();
  }

  initLocalScope() {
    return this.runCmd('bit init');
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
    const bitmapFile = path.join(cwd, oldBitMapFile ? '.bit.map.json' : '.bitmap');

    const bitmap = {
      version: '0.11.1-testing'
    };
    Object.keys(componentObject).forEach(key => (bitmap[key] = componentObject[key]));
    fs.ensureFileSync(bitmapFile);
    return fs.writeJsonSync(bitmapFile, bitmap);
  }
  setNewLocalAndRemoteScopes() {
    if (!this.cache) {
      this.reInitLocalScope();
      this.reInitRemoteScope();
      this.addRemoteScope();
      this.cache = {
        localScopePath: path.join(this.e2eDir, v4()),
        remoteScopePath: path.join(this.e2eDir, v4())
      };
      if (this.debugMode) {
        console.log(`not in the cache. cloning a scope from ${this.localScopePath} to ${this.cache.localScopePath}`);
      }
      fs.copySync(this.localScopePath, this.cache.localScopePath);
      fs.copySync(this.remoteScopePath, this.cache.remoteScopePath);
    } else {
      if (this.debugMode) console.log(`cloning a scope from ${this.cache.localScopePath} to ${this.localScopePath}`);
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

  initNewGitRepo() {
    return this.runCmd('git init');
  }

  addGitConfig(key, val, location = 'local') {
    return this.runCmd(`git config --${location} ${key} ${val}`);
  }

  unsetGitConfig(key, location = 'local') {
    return this.runCmd(`git config --unset --${location} ${key}`);
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

  listRemoteScope(bare: boolean = true) {
    return this.runCmd(`bit list ${this.remoteScope} ${bare ? '--bare' : ''}`);
  }
  listLocalScope(options: string = '') {
    return this.runCmd(`bit list ${options}`);
  }

  getNewBareScope() {
    const scopeName = v4();
    const scopePath = path.join(this.e2eDir, scopeName);
    fs.emptyDirSync(scopePath);
    this.runCmd('bit init --bare', scopePath);
    this.addRemoteScope(this.remoteScopePath, scopePath);
    return { scopeName, scopePath };
  }

  mimicGitCloneLocalProject(withDist = false) {
    fs.removeSync(path.join(this.localScopePath, '.bit'));
    fs.removeSync(path.join(this.localScopePath, 'components'));
    this.runCmd('bit init');
    this.addRemoteScope();
    return withDist ? this.runCmd('bit import --force') : this.runCmd('bit import --ignore-dist --force');
  }

  mimicGitCloneLocalProjectWithoutImport() {
    fs.removeSync(path.join(this.localScopePath, '.bit'));
    this.runCmd('bit init');
    const directories = glob.sync(path.normalize('**/'), { cwd: this.localScopePath, dot: true });
    // delete all node-modules from all directories
    directories.forEach((dir) => {
      if (dir.includes('node_modules')) {
        fs.removeSync(path.join(this.localScopePath, dir));
      }
    });
  }

  getConsumerFiles(ext: string = '*.{js,ts}', includeDot: boolean = true) {
    return glob
      .sync(path.normalize(`**/${ext}`), { cwd: this.localScopePath, dot: includeDot })
      .map(x => path.normalize(x));
  }

  commitComponent(id: string, commitMsg: string = 'commit-message', options: string = '') {
    return this.runCmd(`bit tag ${id} -m ${commitMsg} ${options}`);
  }
  tagWithoutMessage(id: string, options: string = '') {
    return this.runCmd(`bit tag ${id} ${options}`);
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

  exportComponent(id: string, scope: string = this.remoteScope) {
    return this.runCmd(`bit export ${scope} ${id}`);
  }

  exportAllComponents() {
    return this.runCmd(`bit export ${this.remoteScope}`);
  }

  importComponent(id) {
    return this.runCmd(`bit import ${this.remoteScope}/${id}`);
  }

  importComponentWithOptions(id: string = 'bar/foo.js', options: ?Object) {
    const value = Object.keys(options)
      .map(key => `-${key} ${options[key]}`)
      .join(' ');
    return this.runCmd(`bit import ${this.remoteScope}/${id} ${value}`);
  }

  isolateComponent(id: string, flags: string): string {
    const isolatedEnvOutput = this.runCmd(`bit isolate ${this.remoteScope}/${id} ${this.remoteScopePath} ${flags}`);
    const isolatedEnvOutputArray = isolatedEnvOutput.split('\n').filter(str => str);
    return isolatedEnvOutputArray[isolatedEnvOutputArray.length - 1];
  }

  createCompiler() {
    if (this.compilerCreated) return this.addRemoteScope(this.envScopePath);

    const tempScope = `${v4()}-temp`;
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

  importCompiler(id?) {
    if (!id) {
      id = `${this.envScope}/compilers/babel`;
      this.createCompiler();
    }
    // Temporary - for checking new serializaion against the stage env
    // this.setHubDomain('hub-stg.bitsrc.io');
    return this.runCmd(`bit import ${id} --compiler`);
  }

  importTester(id) {
    // Temporary - for checking new serializaion against the stage env
    // this.setHubDomain('hub-stg.bitsrc.io');
    this.runCmd(`bit import ${id} --tester`);
  }

  build(id?: string = '') {
    return this.runCmd(`bit build ${id}`);
  }

  createComponentBarFoo(impl?: string) {
    this.createComponent(undefined, undefined, impl);
  }

  pack(component: string, output: string = this.localScopePath) {
    return this.runCmd(`bit pack ${this.remoteScope}/${component}  -d ${output} -l -w -o`, this.remoteScopePath);
  }
  addComponentBarFoo() {
    return this.addComponent();
  }

  commitComponentBarFoo() {
    return this.commitComponent('bar/foo');
  }

  // TODO: delete and use create file below? it's not a comonent unless we add it only a file
  createComponent(namespace: string = 'bar', name: string = 'foo.js', impl?: string) {
    const fixture = impl || "module.exports = function foo() { return 'got foo'; };";
    const filePath = path.join(this.localScopePath, namespace, name);
    fs.outputFileSync(filePath, fixture);
  }
  corruptBitJson(bitJsonPath: string = path.join(this.localScopePath, 'bit.json')) {
    const bitJson = this.readBitJson();
    bitJson.corrupt = '"corrupted';
    fs.writeFileSync(bitJsonPath, bitJson.toString());
  }
  modifyFieldInBitJson(key: string, value: string, bitJsonPath: string = path.join(this.localScopePath, 'bit.json')) {
    const bitJson = this.readBitJson();
    bitJson[key] = value;
    fs.writeJsonSync(bitJsonPath, bitJson);
  }
  addNpmPackage(name: string = 'lodash.get', version: string = '4.4.2') {
    const packageJsonFixture = JSON.stringify({ name, version });
    this.createFile(`node_modules/${name}`, 'index.js');
    this.createFile(`node_modules/${name}`, 'package.json', packageJsonFixture);
  }

  createFile(folder: string = 'bar', name: string = 'foo.js', impl?: string) {
    const fixture = impl || "module.exports = function foo() { return 'got foo'; };";
    const filePath = path.join(this.localScopePath, folder, name);
    fs.outputFileSync(filePath, fixture);
  }

  deleteFile(relativePathToLocalScope: string) {
    return fs.removeSync(path.join(this.localScopePath, relativePathToLocalScope));
  }

  addComponent(filePaths: string = path.normalize('bar/foo.js'), cwd = this.localScopePath) {
    return this.runCmd(`bit add ${filePaths}`, cwd);
  }

  untrackComponent(id: string = '', cwd = this.localScopePath) {
    return this.runCmd(`bit untrack ${id}`, cwd);
  }

  copyFixtureComponents(dir: string = '', cwd = this.localScopePath) {
    const sourceDir = path.join(__dirname, 'fixtures', 'components');
    fs.copySync(sourceDir, cwd);
    // update with the correct remote-scope
    const heroPath = path.join(cwd, 'hero', 'Hero.js');
    const heroContent = fs.readFileSync(heroPath).toString();
    const newContent = heroContent.replace(/{remoteScope}/g, this.remoteScope);
    fs.writeFileSync(heroPath, newContent);
  }

  addFixtureComponents() {}
  addComponentWithOptions(filePaths: string = 'bar/foo.js', options: ?Object, cwd = this.localScopePath) {
    const value = Object.keys(options)
      .map(key => `-${key} ${options[key]}`)
      .join(' ');
    return this.runCmd(`bit add ${filePaths} ${value}`, cwd);
  }

  testComponent(id) {
    return this.runCmd(`bit test ${id || ''}`);
  }

  searchComponent(args) {
    return this.runCmd(`bit search ${args}`);
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

  /**
   * Sometimes many tests need to do the exact same steps to init the local-scope, such as importing compiler/tester.
   * To make it faster, use this method before all tests, and then use getClonedLocalScope method to restore from the
   * cloned scope.
   */
  cloneLocalScope() {
    const clonedScope = v4();
    const clonedScopePath = path.join(this.e2eDir, clonedScope);
    if (this.debugMode) console.log(`cloning a scope from ${this.localScopePath} to ${clonedScopePath}`);
    fs.copySync(this.localScopePath, clonedScopePath);
    this.clonedScopes.push(clonedScopePath);
    return clonedScopePath;
  }

  getClonedLocalScope(clonedScopePath) {
    fs.removeSync(this.localScopePath);
    if (this.debugMode) console.log(`cloning a scope from ${clonedScopePath} to ${this.localScopePath}`);
    fs.copySync(clonedScopePath, this.localScopePath);
  }

  cloneRemoteScope() {
    const clonedScope = v4();
    const clonedScopePath = path.join(this.e2eDir, clonedScope);
    if (this.debugMode) console.log(`cloning a scope from ${this.remoteScopePath} to ${clonedScopePath}`);
    fs.copySync(this.remoteScopePath, clonedScopePath);
    this.clonedScopes.push(clonedScopePath);
    return clonedScopePath;
  }

  getClonedRemoteScope(clonedScopePath) {
    fs.removeSync(this.remoteScopePath);
    if (this.debugMode) console.log(`cloning a scope from ${clonedScopePath} to ${this.remoteScopePath}`);
    fs.copySync(clonedScopePath, this.remoteScopePath);
  }

  getRequireBitPath(box, name) {
    return `@bit/${this.remoteScope}.${box}.${name}`;
  }

  createRemoteScopeWithComponentsFixture() {
    if (this.compilerCreated) return this.addRemoteScope(this.envScopePath);

    const tempScope = `${v4()}-temp`;
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
}

function ensureAndWriteJson(filePath, fileContent) {
  fs.ensureFileSync(filePath);
  fs.writeJsonSync(filePath, fileContent);
}

export { VERSION_DELIMITER };
