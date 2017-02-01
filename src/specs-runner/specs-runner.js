/** @flow */
import path from 'path';
import R from 'ramda';
import { fork } from 'child_process';
import Scope from '../scope/scope';
import { Results } from '../consumer/specs-results';

export type Tester = {
  run: (filePath: string) => Promise<Results>;
  globals: Object;
  modules: Object;
}

function run({ scope, testerFilePath, implSrc, specsSrc }:
{ scope: Scope, testerFilePath: string, implSrc: string, specsSrc: string }) {
  const implFilePath = scope.tmp.saveSync(implSrc);
  const specsFilePath = scope.tmp.saveSync(specsSrc);

  const removeTmpFiles = () => {
    scope.tmp.removeSync(implFilePath);
    scope.tmp.removeSync(specsFilePath);
  };

  function getDebugPort(): ?number {
    const debugPortArgName = '--debug-brk';
    try {
      const execArgv = process.execArgv.map(arg => arg.split('='));
      const execArgvObj = R.fromPairs(execArgv);
      if (execArgvObj[debugPortArgName]) return parseInt(execArgvObj[debugPortArgName]);
    } catch (e) { return null; }
    
    return null;
  }

  return new Promise((resolve, reject) => {
    const debugPort = getDebugPort();
    const openPort = debugPort ? debugPort + 1 : null; 

    const child = fork(path.join(__dirname, 'worker.js'), {
      execArgv: openPort ? [`--debug=${openPort.toString()}`] : [],
      silent: true,
      env: {
        __impl__: implFilePath,
        __specs__: specsFilePath,
        __tester__: testerFilePath
      }
    });

    process.on('exit', () => {
      child.kill('SIGKILL');
    });

    child.on('message', ({ type, payload }: { type: string, payload: Object }) => {
      removeTmpFiles();
      if (type === 'error') return reject(payload);
      return resolve(payload);
    });

    child.on('error', (e) => {
      removeTmpFiles();
      reject(e);
    });
  });
}

export default {
  run,
};
