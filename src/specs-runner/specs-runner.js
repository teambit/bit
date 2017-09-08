/** @flow */
import path from 'path';
import R from 'ramda';
import { fork } from 'child_process';
import Scope from '../scope/scope';
import { Results } from '../consumer/specs-results';

export type Tester = {
  run: (filePath: string) => Promise<Results>,
  globals: Object,
  modules: Object
};

function run({
  testerFilePath,
  testerId,
  mainFile,
  testFilePath
}: {
  scope: Scope,
  testerFilePath: string,
  testerId: Object,
  mainFile: string,
  testFilePath: string
}) {
  function getDebugPort(): ?number {
    const debugPortArgName = '--debug-brk';
    try {
      const execArgv = process.execArgv.map(arg => arg.split('='));
      const execArgvObj = R.fromPairs(execArgv);
      if (execArgvObj[debugPortArgName]) return parseInt(execArgvObj[debugPortArgName]);
    } catch (e) {
      return null;
    }

    return null;
  }

  return new Promise((resolve, reject) => {
    const debugPort = getDebugPort();
    const openPort = debugPort ? debugPort + 1 : null;

    const child = fork(path.join(__dirname, 'worker.js'), {
      execArgv: openPort ? [`--debug=${openPort.toString()}`] : [],
      silent: false,
      env: {
        __mainFile__: mainFile,
        __testFilePath__: testFilePath,
        __tester__: testerFilePath,
        __testerId__: testerId.toString()
      }
    });

    process.on('exit', () => {
      child.kill('SIGKILL');
    });

    child.on('message', ({ type, payload }: { type: string, payload: Object }) => {
      if (type === 'error') return reject(payload);
      return resolve(payload);
    });

    child.on('error', (e) => {
      reject(e);
    });
  });
}

export default {
  run
};
