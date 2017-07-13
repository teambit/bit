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

  readBitMap(bitJsonPath = path.join(this.localScopePath, '.bit.map.json')) {
    return fs.readJSONSync(bitJsonPath) || {};
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
    return this.runCmd(`bit export @${this.remoteScope} ${id}`);
  }

  importComponent(id) {
    return this.runCmd(`bit import @${this.remoteScope}/${id}`);
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

  createComponent(namespace: string = 'bar', name: string = 'foo.js' , impl?: string) {
    const fixture = impl || "module.exports = function foo() { return 'got foo'; };";
    const filePath = path.join(this.localScopePath, namespace, name);
    fs.outputFileSync(filePath, fixture);
  }

  addComponent(filePaths: string = "bar/foo.js") {
    return this.runCmd(`bit add ${filePaths}`);
  }
}
