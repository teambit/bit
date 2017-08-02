import os from 'os';
import path from 'path';
import childProcess from 'child_process';
import fs from 'fs-extra';
import { v4 } from 'uuid';

export default class Helper {
  constructor() {
    this.debugMode = !!process.env.npm_config_debug;
    this.localScope = v4();
    this.remoteScope = v4();
    this.e2eDir = path.join(os.tmpdir(), 'bit', 'e2e');
    this.localScopePath = path.join(this.e2eDir, this.localScope);
    this.remoteScopePath = path.join(this.e2eDir, this.remoteScope);
    this.bitBin = process.env.npm_config_bit_bin || 'bit'; // e.g. npm run e2e-test --bit_bin=bit-dev
  }

  runCmd(cmd, cwd = this.localScopePath) {
    if (this.debugMode) console.log('cwd: ', cwd); // eslint-disable-line
    if (cmd.startsWith('bit ')) cmd = cmd.replace('bit', this.bitBin);
    if (this.debugMode) console.log('command: ', cmd); // eslint-disable-line
    const cmdOutput = childProcess.execSync(cmd, { cwd });
    if (this.debugMode) console.log('output: ', cmdOutput.toString()); // eslint-disable-line
    return cmdOutput.toString();
  }

  addBitJsonDependencies(bitJsonPath, dependencies, packageDependencies) {
    const bitJson = fs.existsSync(bitJsonPath) ? fs.readJSONSync(bitJsonPath) : {};
    bitJson.dependencies = bitJson.dependencies || {};
    bitJson.packageDependencies = bitJson.packageDependencies || {};
    Object.assign(bitJson.dependencies, dependencies);
    Object.assign(bitJson.packageDependencies, packageDependencies);
    fs.writeJSONSync(bitJsonPath, bitJson);
  }

  readBitJson(bitJsonPath = path.join(this.localScopePath, 'bit.json')) {
    return fs.readJSONSync(bitJsonPath) || {};
  }

  readBitMap(bitMapPath = path.join(this.localScopePath, '.bit.map.json')) {
    return fs.readJSONSync(bitMapPath) || {};
  }

  writeBitMap(bitMap) {
    const bitMapPath = path.join(this.localScopePath, '.bit.map.json');
    return fs.writeJSONSync(bitMapPath, bitMap);
  }

  cleanEnv() {
    fs.emptyDirSync(this.localScopePath);
    fs.emptyDirSync(this.remoteScopePath);
  }

  destroyEnv() {
    fs.removeSync(this.localScopePath);
    fs.removeSync(this.remoteScopePath);
  }

  reInitLocalScope() {
    fs.emptyDirSync(this.localScopePath);
    return this.runCmd('bit init');
  }

  addRemoteScope(remoteScopePath = this.remoteScopePath) {
    if (process.env.npm_config_with_ssh) {
      return this.runCmd(`bit remote add ssh://\`whoami\`@127.0.0.1:/${remoteScopePath}`);
    }
    return this.runCmd(`bit remote add file://${remoteScopePath}`);
  }

  reInitRemoteScope() {
    fs.emptyDirSync(this.remoteScopePath);
    return this.runCmd('bit init --bare', this.remoteScopePath);
  }

  commitComponent(id:string = 'bar/foo', commitMsg: string = 'commit-message') {
    return this.runCmd(`bit commit ${id} -m ${commitMsg}`);
  }

  commitAllComponents(commitMsg: string = 'commit-message') {
    return this.runCmd(`bit commit -am ${commitMsg}`);
  }

  exportComponent(id) {
    return this.runCmd(`bit export ${this.remoteScope} ${id}`);
  }

  exportAllComponents() {
    return this.runCmd(`bit export ${this.remoteScope}`);
  }

  importComponent(id) {
    return this.runCmd(`bit import ${this.remoteScope}/${id}`);
  }

  importCompiler(id: string = 'bit.envs/compilers/babel4') {
    this.runCmd('bit config set hub_domain hub-stg.bitsrc.io'); // todo: once the new babel compiler is on prod, remove this line
    this.runCmd(`bit import ${id} --compiler`);
  }

  createComponentBarFoo(impl?: string) {
    this.createComponent(undefined, undefined, impl);
  }

  addComponentBarFoo() {
    return this.addComponent();
  }

  commitComponentBarFoo() {
    return this.commitComponent();
  }

  // TODO: delete and use create file below? it's not a comonent unless we add it only a file
  createComponent(namespace: string = 'bar', name: string = 'foo.js' , impl?: string) {
    const fixture = impl || "module.exports = function foo() { return 'got foo'; };";
    const filePath = path.join(this.localScopePath, namespace, name);
    fs.outputFileSync(filePath, fixture);
  }

  createFile(folder: string = 'bar', name: string = 'foo.js' , impl?: string) {
    const fixture = impl || "module.exports = function foo() { return 'got foo'; };";
    const filePath = path.join(this.localScopePath, folder, name);
    fs.outputFileSync(filePath, fixture);
  }

  addComponent(filePaths: string = "bar/foo.js") {
    return this.runCmd(`bit add ${filePaths}`);
  }

  addComponentWithOptions(filePaths: string = 'bar/foo.js', options:? Object) {
    const value = Object.keys(options).map(key => `-${key} ${options[key]}`).join(' ');
    return this.runCmd(`bit add ${filePaths} ${value}`);
  }

  showComponent(id: string = "bar/foo") {
    return this.runCmd(`bit show ${id}`);
  }

  showComponentWithOptions(id: string = "bar/foo", options:? Object) {
    const value = Object.keys(options).map(key => `-${key} ${options[key]}`).join(' ');
    return this.runCmd(`bit show ${id} ${value}`);
  }
}
