import * as path from 'path';
// @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
import os from 'os';
import fs from 'fs-extra';
import { generateRandomStr } from '../utils';

export type ScopesOptions = {
  remoteScopeWithDot?: boolean;
  remoteScopePrefix?: string;
};
export default class ScopesData {
  e2eDir: string;
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  local: string;
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  localPath: string;
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  remote: string;
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  remotePath: string;
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  env: string;
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  envPath: string;
  globalRemote: string;
  globalRemotePath: string;
  constructor(scopesOptions?: ScopesOptions) {
    this.e2eDir = path.join(os.tmpdir(), 'bit', 'e2e');
    this.setLocalScope();
    this.setRemoteScope(scopesOptions?.remoteScopeWithDot, scopesOptions?.remoteScopePrefix);
    this.setEnvScope();
    this.globalRemote = 'global-remote';
    this.globalRemotePath = path.join(this.e2eDir, this.globalRemote);
  }
  setLocalScope(localScope?: string) {
    this.local = localScope || `${generateRandomStr()}-local`;
    this.localPath = path.join(this.e2eDir, this.local);
    fs.ensureDirSync(this.localPath);
  }
  setRemoteScope(remoteScopeWithDot = false, prefix = generateRandomStr()) {
    if (remoteScopeWithDot) {
      this.remote = `${prefix}.${generateRandomStr()}-remote`;
    } else {
      this.remote = `${generateRandomStr()}-remote`;
    }
    this.remotePath = path.join(this.e2eDir, this.remote);
  }
  setEnvScope() {
    this.env = `${generateRandomStr()}-env`;
    this.envPath = path.join(this.e2eDir, this.env);
  }
}
