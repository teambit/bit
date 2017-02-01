/** @flow */
import path from 'path';
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

  return new Promise((resolve, reject) => {
    const child = fork(path.join(__dirname, 'worker.js'), {
      // execArgv: ['--debug=26304'],
      stdio: [null, null, 2, 'ipc'],
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
