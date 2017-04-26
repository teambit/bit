/** @flow */
import { fork } from 'child_process';
import path from 'path';
import { writeJsonSync, removeSync } from 'fs-extra';


export default ({ deps, dir, silent = true }:
  { deps: [{ name: string, version: string}], dir: string, silent?: bool }) => {
  writeJsonSync('./package.json', { dependencies: deps });
  return new Promise((resolve, reject) => {
    const child = fork(path.join(__dirname, 'npm-worker.js'), {
      silent,
      env: {
        __dir__: dir,
      }
    });

    process.on('exit', () => {
      removeSync('./package.json');
      child.kill('SIGKILL');
    });

    child.on('message', ({ type, payload }: { type: string, payload: Object }) => {
      removeSync('./package.json');
      if (type === 'error') return reject(payload);
      return resolve(payload);
    });

    child.on('error', (e) => {
      removeSync('./package.json');
      reject(e);
    });
  });
};
