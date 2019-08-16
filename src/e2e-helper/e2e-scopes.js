// @flow
import path from 'path';
import os from 'os';
import fs from 'fs-extra';
import { generateRandomStr } from './e2e-helper';

export default class ScopesData {
  e2eDir: string;
  localScope: string;
  localScopePath: string;
  remoteScope: string;
  remoteScopePath: string;
  envScope: string;
  envScopePath: string;
  constructor() {
    this.e2eDir = path.join(os.tmpdir(), 'bit', 'e2e');
    this.setLocalScope();
    this.setRemoteScope();
    this.setEnvScope();
  }
  setLocalScope(localScope?: string) {
    this.localScope = localScope || `${generateRandomStr()}-local`;
    this.localScopePath = path.join(this.e2eDir, this.localScope);
    fs.ensureDirSync(this.localScopePath);
  }
  setRemoteScope() {
    this.remoteScope = `${generateRandomStr()}-remote`;
    this.remoteScopePath = path.join(this.e2eDir, this.remoteScope);
  }
  setEnvScope() {
    this.envScope = `${generateRandomStr()}-env`;
    this.envScopePath = path.join(this.e2eDir, this.envScope);
  }
}
