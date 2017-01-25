/** @flow */
import path from 'path';
import { fork } from 'child_process';
import Scope from '../scope/scope';

export type ErrorObj = {
  message: string,
  stack: string,
}

export type Test = {
  title: string,
  pass: bool,
  err: ?ErrorObj
}

export type Stats = {
  start: string,
  end: string
}

export type Results = {
 tests: Test[],
 stats: Stats
}

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
        ___impl___: implFilePath,
        ___specs___: specsFilePath,
        ___tester___: testerFilePath
      }
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

    // TODO - take care of more cases then error & messages
  });
}

export default {
  run,
};
