// @flow
import fs from 'fs-extra';
import execa from 'execa';
import { ChildProcess } from 'child_process';
import Helper from './e2e-helper';

export default class NpmCiRegistry {
  registryServer: ChildProcess;
  helper: Helper;
  constructor(helper: Helper) {
    this.helper = helper;
  }
  async init() {
    await this.establishRegistry();
    this._addDefaultUser();
  }

  destroy() {
    this.registryServer.kill();
  }

  establishRegistry(): Promise<void> {
    return new Promise((resolve) => {
      this.registryServer = execa('verdaccio', { detached: true });
      this.registryServer.stdout.on('data', (data) => {
        if (this.helper.debugMode) console.log(`stdout: ${data}`);
        if (data.includes('4873')) {
          if (this.helper.debugMode) console.log('Verdaccio server is up and running');
          resolve();
        }
      });
      this.registryServer.stderr.on('data', (data) => {
        if (this.helper.debugMode) console.log(`stderr: ${data}`);
      });
      this.registryServer.on('close', (code) => {
        if (this.helper.debugMode) console.log(`child process exited with code ${code}`);
      });
    });
  }

  _addDefaultUser() {
    const addUser = `expect <<EOD
spawn npm adduser --registry http://localhost:4873 --scope=@ci
expect {
"Username:" {send "ci\r"; exp_continue}
"Password:" {send "secret\r"; exp_continue}
"Email: (this IS public)" {send "ci@ci.com\r"; exp_continue}
}
EOD`;
    fs.writeFileSync('adduser.sh', addUser);
    const addUserResult = execa.sync('sh', ['adduser.sh']);
    if (!addUserResult.stdout.includes('Logged in as ci to scope @ci')) {
      throw new Error(`failed executing npm adduser ${addUserResult.stderr}`);
    }
    if (this.helper.debugMode) console.log('default user has been added successfully to Verdaccio');
    fs.removeSync('adduser.sh');
  }
}
