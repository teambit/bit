// @flow
import R from 'ramda';
import path from 'path';
import fs from 'fs-extra';
import set from 'lodash.set';
import ScopesData from './e2e-scopes';

export default class BitJsonHelper {
  scopes: ScopesData;
  constructor(scopes: ScopesData) {
    this.scopes = scopes;
  }
  read(bitJsonDir?: string = this.scopes.localPath) {
    const bitJsonPath = path.join(bitJsonDir, 'bit.json');
    return fs.existsSync(bitJsonPath) ? fs.readJSONSync(bitJsonPath) : {};
  }
  write(bitJson: Object, bitJsonDir?: string = this.scopes.localPath) {
    const bitJsonPath = path.join(bitJsonDir, 'bit.json');
    return fs.writeJSONSync(bitJsonPath, bitJson, { spaces: 2 });
  }
  addKeyVal(bitJsonDir: string = this.scopes.localPath, key: string, val: any) {
    const bitJson = this.read(bitJsonDir);
    bitJson[key] = val;
    this.write(bitJson, bitJsonDir);
  }
  addOverrides(overrides: Object) {
    const bitJson = this.read();
    bitJson.overrides = overrides;
    this.write(bitJson);
  }
  getEnvByType(bitJson: Object, envType: 'compiler' | 'tester') {
    const basePath = ['env', envType];
    const env = R.path(basePath, bitJson);
    const envName = Object.keys(env)[0];
    return env[envName];
  }
  addFileToEnv(
    bitJsonPath: string = this.scopes.localPath,
    fileName: string,
    filePath: string,
    envType: 'compiler' | 'tester'
  ) {
    this._addKeyValToEnvProp(bitJsonPath, 'files', fileName, filePath, envType);
  }
  addToRawConfigOfEnv(
    bitJsonPath: string = this.scopes.localPath,
    key: string,
    val: string,
    envType: 'compiler' | 'tester'
  ) {
    this._addKeyValToEnvProp(bitJsonPath, 'rawConfig', key, val, envType);
  }
  manageWorkspaces(withWorkspaces: boolean = true) {
    const bitJson = this.read();
    bitJson.packageManager = 'yarn';
    bitJson.manageWorkspaces = withWorkspaces;
    bitJson.useWorkspaces = withWorkspaces;
    this.write(bitJson);
  }
  setComponentsDir(content: string) {
    const bitJson = this.read();
    bitJson.componentsDefaultDirectory = content;
    this.write(bitJson);
  }
  corrupt(bitJsonPath: string = path.join(this.scopes.localPath, 'bit.json')) {
    fs.writeFileSync(bitJsonPath, '"corrupted');
  }
  modifyField(key: string, value: string) {
    const bitJson = this.read();
    bitJson[key] = value;
    this.write(bitJson);
  }
  _getEnvNameByType(bitJson: Object, envType: 'compiler' | 'tester') {
    const env = bitJson.env[envType];
    const envName = typeof env === 'string' ? env : Object.keys(env)[0];
    return envName;
  }
  _addKeyValToEnvProp(
    bitJsonDir: string = this.scopes.localPath,
    propName: string,
    key: string,
    val: string,
    envType: 'compiler' | 'tester'
  ) {
    const bitJson = this.read(bitJsonDir);
    const envName = this._getEnvNameByType(bitJson, envType);
    const propPath = ['env', envType, envName, propName];
    const prop = R.pathOr({}, propPath, bitJson);
    prop[key] = val;
    set(bitJson, propPath, prop);
    this.write(bitJson, bitJsonDir);
  }
}
