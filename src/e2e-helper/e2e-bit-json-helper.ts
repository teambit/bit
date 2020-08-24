import fs from 'fs-extra';
import set from 'lodash.set';
import * as path from 'path';
import R from 'ramda';

import ScopesData from './e2e-scopes';

export default class BitJsonHelper {
  scopes: ScopesData;
  constructor(scopes: ScopesData) {
    this.scopes = scopes;
  }
  read(bitJsonDir: string = this.scopes.localPath) {
    const bitJsonPath = path.join(bitJsonDir, 'bit.json');
    return fs.existsSync(bitJsonPath) ? fs.readJSONSync(bitJsonPath) : {};
  }
  write(bitJson: Record<string, any>, bitJsonDir: string = this.scopes.localPath) {
    const bitJsonPath = path.join(bitJsonDir, 'bit.json');
    return fs.writeJSONSync(bitJsonPath, bitJson, { spaces: 2 });
  }
  addKeyVal(key: string, val: any, bitJsonDir: string = this.scopes.localPath) {
    const bitJson = this.read(bitJsonDir);
    bitJson[key] = val;
    this.write(bitJson, bitJsonDir);
  }
  addOverrides(overrides: Record<string, any>) {
    const bitJson = this.read();
    bitJson.overrides = overrides;
    this.write(bitJson);
  }
  addDefaultScope(scope = this.scopes.remote) {
    this.addKeyVal('defaultScope', scope);
  }
  getEnvByType(bitJson: Record<string, any>, envType: 'compiler' | 'tester') {
    const basePath = ['env', envType];
    const env = R.path(basePath, bitJson);
    const envName = Object.keys(env)[0];
    return env[envName];
  }
  addToRawConfigOfEnv(
    bitJsonPath: string = this.scopes.localPath,
    key: string,
    val: string,
    envType: 'compiler' | 'tester'
  ) {
    this._addKeyValToEnvProp(bitJsonPath, 'rawConfig', key, val, envType);
  }
  manageWorkspaces(withWorkspaces = true) {
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
  _getEnvNameByType(bitJson: Record<string, any>, envType: 'compiler' | 'tester') {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
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
