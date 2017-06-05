import os from 'os';
import path from 'path';
import childProcess from 'child_process';
import fs from 'fs-extra';
import { v4 } from 'uuid';

export default class Helper {
  constructor() {
    this.verbose = false;
    this.localScope = v4();
    this.remoteScope = v4();
    this.e2eDir = path.join(os.tmpdir(), 'bit', 'e2e');
    this.localScopePath = path.join(this.e2eDir, this.localScope);
    this.remoteScopePath = path.join(this.e2eDir, this.remoteScope);
    this.bitBin = process.env.npm_config_bit_bin || 'bit'; // e.g. npm run e2e-test --bit_bin=bit-dev
  }

  runCmd(cmd, cwd = this.localScopePath) {
    if (cmd.startsWith('bit ')) cmd = cmd.replace('bit', this.bitBin);
    if (this.verbose) console.log('running: ', cmd); // eslint-disable-line
    const cmdOutput = childProcess.execSync(cmd, { cwd });
    if (this.verbose) console.log(cmdOutput.toString()); // eslint-disable-line
    return cmdOutput.toString();
  }

  cleanEnv() {
    fs.emptyDirSync(this.localScopePath);
    fs.emptyDirSync(this.remoteScopePath);
  }

  destroyEnv() {
    fs.removeSync(this.localScopePath);
    fs.removeSync(this.remoteScopePath);
  }
}
