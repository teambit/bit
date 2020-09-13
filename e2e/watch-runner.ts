/* eslint no-console: 0 */
import chalk from 'chalk';
// @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
import childProcess, { ChildProcess } from 'child_process';
import rightpad from 'pad-right';

// @todo: move this file to the watch extension and then move the following constants to the extension
import { STARTED_WATCHING_MSG, WATCHER_COMPLETED_MSG } from '../src/constants';
import Helper from '../src/e2e-helper/e2e-helper';

const WATCH_TIMEOUT_FOR_MSG = 60000; // 1 min

const STARTED_WATCHING_MSG_HARMONY = 'Watching for component changes in workspace';
const WATCHER_COMPLETED_MSG_HARMONY = 'Watching for component changes';

export default class WatchRunner {
  watchProcess: ChildProcess;
  constructor(private helper: Helper, private isHarmony: boolean) {}
  watch(): Promise<void> {
    const cmd = `${this.helper.command.bitBin} watch --verbose`;
    if (this.helper.debugMode) console.log(rightpad(chalk.green('command: '), 20, ' '), cmd); // eslint-disable-line
    return new Promise((resolve, reject) => {
      this.watchProcess = childProcess.exec(cmd, { cwd: this.helper.scopes.localPath });
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      this.watchProcess.stdout.on('data', (data) => {
        if (this.helper.debugMode) console.log(`stdout: ${data}`);
        const msg = this.isHarmony ? STARTED_WATCHING_MSG_HARMONY : STARTED_WATCHING_MSG;
        if (data.includes(msg)) {
          if (this.helper.debugMode) console.log('bit watch is up and running');
          resolve();
        }
      });
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      this.watchProcess.stderr.on('data', (data) => {
        if (this.helper.debugMode) console.log(`stderr: ${data}`);
        reject(new Error(`watcher failed with the following stderr ${data}`));
      });
      this.watchProcess.on('close', (code) => {
        if (this.helper.debugMode) console.log(`child process exited with code ${code}`);
      });
    });
  }
  async waitForWatchToRebuildComponent() {
    const msg = this.isHarmony ? WATCHER_COMPLETED_MSG_HARMONY : WATCHER_COMPLETED_MSG;
    return this.waitForWatchToPrintMsg(msg);
  }
  async waitForWatchToPrintMsg(msg: string, timeoutAfter: number = WATCH_TIMEOUT_FOR_MSG) {
    return new Promise((resolve, reject) => {
      // create a timeout to reject promise if not resolved
      const timer = setTimeout(() => {
        reject(new Error(`watcher exceed the limit of ${timeoutAfter} ms, the message "${msg}" was not received`));
      }, timeoutAfter);
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      this.watchProcess.stdout.on('data', (data) => {
        if (data.includes(msg)) {
          clearTimeout(timer);
          resolve(data);
        }
      });
    });
  }
  killWatcher() {
    const isWin = process.platform === 'win32';
    if (isWin) {
      childProcess.execSync(`taskkill /pid ${this.watchProcess.pid.toString()} /f /t`);
    } else {
      this.watchProcess.kill('SIGINT');
    }
  }
}
