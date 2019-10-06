import * as path from 'path';
// @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
import os from 'os';
import fs from 'fs-extra';
import { generateRandomStr } from './e2e-helper';

export default class ScopesData {
  e2eDir: string;
  local: string;
  localPath: string;
  remote: string;
  remotePath: string;
  env: string;
  envPath: string;
  constructor() {
    this.e2eDir = path.join(os.tmpdir(), 'bit', 'e2e');
    this.setLocalScope();
    this.setRemoteScope();
    this.setEnvScope();
  }
  setLocalScope(localScope?: string) {
    this.local = localScope || `${generateRandomStr()}-local`;
    this.localPath = path.join(this.e2eDir, this.local);
    fs.ensureDirSync(this.localPath);
  }
  setRemoteScope() {
    this.remote = `${generateRandomStr()}-remote`;
    this.remotePath = path.join(this.e2eDir, this.remote);
  }
  setEnvScope() {
    this.env = `${generateRandomStr()}-env`;
    this.envPath = path.join(this.e2eDir, this.env);
  }
}
