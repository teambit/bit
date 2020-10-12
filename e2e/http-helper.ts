/* eslint no-console: 0 */
import chalk from 'chalk';
import childProcess, { ChildProcess } from 'child_process';
import rightpad from 'pad-right';

import Helper from '../src/e2e-helper/e2e-helper';

const HTTP_TIMEOUT_FOR_MSG = 60000; // 1 min

export class HttpHelper {
  httpProcess: ChildProcess;
  constructor(private helper: Helper) {}
  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      const cmd = `${this.helper.command.bitBin} start --verbose`;
      const cwd = this.helper.scopes.remotePath;
      if (this.helper.debugMode) console.log(rightpad(chalk.green('cwd: '), 20, ' '), cwd); // eslint-disable-line no-console
      if (this.helper.debugMode) console.log(rightpad(chalk.green('command: '), 20, ' '), cmd); // eslint-disable-line
      this.httpProcess = childProcess.exec(cmd, { cwd });
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      this.httpProcess.stdout.on('data', (data) => {
        if (this.helper.debugMode) console.log(`stdout: ${data}`);
        const msg = 'Starting the development servers';
        if (data.includes(msg)) {
          if (this.helper.debugMode) console.log('http server is up and running');
          resolve();
        }
      });
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      this.httpProcess.stderr.on('data', (data) => {
        if (this.helper.debugMode) console.log(`stderr: ${data}`);
        reject(new Error(`http failed with the following stderr ${data}`));
      });
      this.httpProcess.on('close', (code) => {
        if (this.helper.debugMode) console.log(`child process exited with code ${code}`);
      });
    });
  }
  async waitForHttpToPrintMsg(msg: string, timeoutAfter: number = HTTP_TIMEOUT_FOR_MSG) {
    return new Promise((resolve, reject) => {
      // create a timeout to reject promise if not resolved
      const timer = setTimeout(() => {
        reject(new Error(`http exceed the limit of ${timeoutAfter} ms, the message "${msg}" was not received`));
      }, timeoutAfter);
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      this.httpProcess.stdout.on('data', (data) => {
        if (data.includes(msg)) {
          clearTimeout(timer);
          resolve(data);
        }
      });
    });
  }
  killHttp() {
    const isWin = process.platform === 'win32';
    if (isWin) {
      childProcess.execSync(`taskkill /pid ${this.httpProcess.pid.toString()} /f /t`);
    } else {
      this.httpProcess.kill('SIGINT');
    }
  }
}
