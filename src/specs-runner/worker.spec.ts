import { expect } from 'chai';
import { fork } from 'child_process';
import * as path from 'path';

describe('worker', () => {
  // TODO: fix this test, the worker now do a different process than before
  it.skip('should throw an error for a mismatch tester interface', (done) => {
    const child = fork(path.join(__dirname, '..', '..', 'dist', 'specs-runner', 'worker.js'), {
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      silent: false,
      env: {
        __impl__: '',
        __specs__: '',
        __tester__: path.join(__dirname, '../../', 'fixtures', 'invalid-tester.js'),
        __testerId__: 'myScope/my-component',
      },
    });

    process.on('exit', () => {
      child.kill('SIGKILL');
    });

    child.on('message', ({ type, payload }) => {
      expect(type).to.equal('error');
      expect(payload).to.equal('"myScope/my-component" doesn\'t have a valid tester interface');
      done();
    });
  });
});
