/** @flow */
import { fork } from 'child_process';
import path from 'path';
import { writeJsonSync, removeSync } from 'fs-extra';


export default ({ deps, dir, silent = true }:
  { deps: [{ name: string, version: string}], dir: string, silent?: bool }) => {
  const packageJson = path.join(dir, 'package.json'); // TODO: make sure it works for all cases. Otherwise, make is a flag with a default "./package.json".
  writeJsonSync(packageJson, { dependencies: deps });
  return new Promise((resolve, reject) => {
    const child = fork(path.join(__dirname, 'npm-worker.js'), {
      silent,
      env: {
        __dir__: dir,
      }
    });

    process.on('exit', () => {
      removeSync(packageJson);
      child.kill('SIGKILL');
    });

    child.on('message', ({ type, payload }: { type: string, payload: Object }) => {
      removeSync(packageJson);
      if (type === 'error') return reject(payload);
      return resolve(payload);
    });

    child.on('error', (e) => {
      removeSync(packageJson);
      reject(e);
    });
  });
};
