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
  readBitJson(bitJsonDir: string = this.scopes.localPath) {
    const bitJsonPath = path.join(bitJsonDir, 'bit.json');
    return fs.existsSync(bitJsonPath) ? fs.readJSONSync(bitJsonPath) : {};
  }
  writeBitJson(bitJson: Object, bitJsonDir: string = this.scopes.localPath) {
    const bitJsonPath = path.join(bitJsonDir, 'bit.json');
    return fs.writeJSONSync(bitJsonPath, bitJson, { spaces: 2 });
  }
  addKeyValToBitJson(bitJsonDir: string = this.scopes.localPath, key: string, val: any) {
    const bitJson = this.readBitJson(bitJsonDir);
    bitJson[key] = val;
    this.writeBitJson(bitJson, bitJsonDir);
  }
  addOverridesToBitJson(overrides: Object) {
    const bitJson = this.readBitJson();
    bitJson.overrides = overrides;
    this.writeBitJson(bitJson);
  }
  getEnvFromBitJsonByType(bitJson: Object, envType: 'compiler' | 'tester') {
    const basePath = ['env', envType];
    const env = R.path(basePath, bitJson);
    const envName = Object.keys(env)[0];
    return env[envName];
  }
  addFileToEnvInBitJson(
    bitJsonPath: string = this.scopes.localPath,
    fileName: string,
    filePath: string,
    envType: 'compiler' | 'tester'
  ) {
    this._addKeyValToEnvPropInBitJson(bitJsonPath, 'files', fileName, filePath, envType);
  }
  addToRawConfigOfEnvInBitJson(
    bitJsonPath: string = this.scopes.localPath,
    key: string,
    val: string,
    envType: 'compiler' | 'tester'
  ) {
    this._addKeyValToEnvPropInBitJson(bitJsonPath, 'rawConfig', key, val, envType);
  }
  manageWorkspaces(withWorkspaces: boolean = true) {
    const bitJson = this.readBitJson();
    bitJson.packageManager = 'yarn';
    bitJson.manageWorkspaces = withWorkspaces;
    bitJson.useWorkspaces = withWorkspaces;
    this.writeBitJson(bitJson);
  }
  setComponentsDirInBitJson(content: string) {
    const bitJson = this.readBitJson();
    bitJson.componentsDefaultDirectory = content;
    this.writeBitJson(bitJson);
  }
  corruptBitJson(bitJsonPath: string = path.join(this.scopes.localPath, 'bit.json')) {
    fs.writeFileSync(bitJsonPath, '"corrupted');
  }
  modifyFieldInBitJson(key: string, value: string) {
    const bitJson = this.readBitJson();
    bitJson[key] = value;
    this.writeBitJson(bitJson);
  }
  _getEnvNameFromBitJsonByType(bitJson: Object, envType: 'compiler' | 'tester') {
    const env = bitJson.env[envType];
    const envName = typeof env === 'string' ? env : Object.keys(env)[0];
    return envName;
  }
  _addKeyValToEnvPropInBitJson(
    bitJsonDir: string = this.scopes.localPath,
    propName: string,
    key: string,
    val: string,
    envType: 'compiler' | 'tester'
  ) {
    const bitJson = this.readBitJson(bitJsonDir);
    const envName = this._getEnvNameFromBitJsonByType(bitJson, envType);
    const propPath = ['env', envType, envName, propName];
    const prop = R.pathOr({}, propPath, bitJson);
    prop[key] = val;
    set(bitJson, propPath, prop);
    this.writeBitJson(bitJson, bitJsonDir);
  }
}
