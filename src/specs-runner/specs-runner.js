/** @flow */
import path from 'path';
import { fork } from 'child_process';
import Scope from '../scope/scope';

type Results = { // TODO - write
 
}

type Tester = {
  run: (filePath: string) => Promise<Results>;
  globals: Object;
  modules: Object;
}

function run({ scope, testerFilePath, implSrc, specsSrc }:
{ scope: Scope, testerFilePath: string, implSrc: string, specsSrc: string }) {
  const implFilePath = scope.tmp.saveSync(implSrc); // TODO - implement
  const specsFilePath = scope.tmp.saveSync(specsSrc); // TODO - implement

  const removeTmpFiles = () => {
    scope.tmp.removeSync(implFilePath);
    scope.tmp.removeSync(specsFilePath);
  };

  return new Promise((resolve, reject) => {
    const child = fork(path.join(__dirname, 'worker.js'), {
      // execArgv: ['--debug=26304'],
      silent: true, // TODO - change to true when working
      env: {
        ___impl___: implFilePath,
        ___specs___: specsFilePath,
        ___tester___: testerFilePath
      }
    });

    child.on('message', (results) => {
      // console.log('the results are: \n', results);
      removeTmpFiles();
      resolve(results);
    });
     
    child.on('error behold:', (e) => {
      console.error(e);
      removeTmpFiles();
      reject(e);
    });

    // TODO - take care of more cases then error & message
  });
}

export default {
  run,
};
