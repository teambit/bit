// @flow
/* eslint no-console: 0 */
import rightpad from 'pad-right';
import chalk from 'chalk';
import childProcess, { ChildProcess } from 'child_process';
import Helper from './e2e-helper';
import { STARTED_WATCHING_MSG, WATCHER_COMPLETED_MSG } from '../src/consumer/component-ops/watch-components';

export default class WatchRunner {
  helper: Helper;
  watchProcess: ChildProcess;
  constructor(helper: Helper) {
    this.helper = helper;
  }
  watch(): Promise<void> {
    const cmd = `${this.helper.bitBin} watch --verbose`;
    if (this.helper.debugMode) console.log(rightpad(chalk.green('command: '), 20, ' '), cmd); // eslint-disable-line
    return new Promise((resolve, reject) => {
      this.watchProcess = childProcess.exec(cmd, { cwd: this.helper.localScopePath, detached: true });
      this.watchProcess.stdout.on('data', (data) => {
        if (this.helper.debugMode) console.log(`stdout: ${data}`);
        if (data.includes(STARTED_WATCHING_MSG)) {
          if (this.helper.debugMode) console.log('bit watch is up and running');
          resolve();
        }
      });
      this.watchProcess.stderr.on('data', (data) => {
        if (this.helper.debugMode) console.log(`stderr: ${data}`);
        reject(data);
      });
      this.watchProcess.on('close', (code) => {
        if (this.helper.debugMode) console.log(`child process exited with code ${code}`);
      });
    });
  }
  async waitForWatchToRebuildComponent() {
    return new Promise((resolve) => {
      this.watchProcess.stdout.on('data', (data) => {
        if (data.includes(WATCHER_COMPLETED_MSG)) {
          resolve(data);
        }
      });
    });
  }
  killWatcher() {
    const isWin = process.platform === 'win32';
    if (isWin) {
      childProcess.spawn('taskkill', ['/pid', this.watchProcess.pid.toString(), '/f', '/t']);
    } else {
      this.watchProcess.kill();
    }
  }
}
