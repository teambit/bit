/** @flow */
import { fork } from 'child_process';
import path from 'path';

export default ({ name, version, dir, silent = true }:
{ name: string, version: string, dir: string, silent?: bool }) => {
  return new Promise((resolve, reject) => {
    const child = fork(path.join(__dirname, 'npm-worker.js'), {
      silent,
      env: {
        __name__: name,
        __version__: version,
        __dir__: dir,
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
};
