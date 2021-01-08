import fs from 'fs-extra';
// @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
import os from 'os';
import * as path from 'path';

import { generateRandomStr } from '../utils';

export const DEFAULT_OWNER = 'ci';

export type ScopesOptions = {
  remoteScopeWithDot?: boolean;
  remoteScopePrefix?: string; // if not specify, and remoteScopeWithDot is true, it defaults to DEFAULT_OWNER.
};
export default class ScopesData {
  e2eDir: string;
  local: string;
  localPath: string;
  remote: string;
  remotePath: string;
  env: string;
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
  setRemoteScope(remoteScopeWithDot = false, prefix = DEFAULT_OWNER, remoteScope?: string) {
    if (remoteScope) {
      this.remote = remoteScope;
    } else if (remoteScopeWithDot) {
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
  get remoteWithoutOwner(): string {
    if (!this.remote.includes('.')) return this.remote;
    const [, remoteScope] = this.remote.split('.');
    return remoteScope;
  }
}
