import { expect } from 'chai';
import { fork } from 'child_process';
import path from 'path';

describe('worker', () => {
  it('should throw an error for a mismatch tester interface', (done) => {
    const child = fork(path.join(__dirname, '..', '..', 'src', 'specs-runner', 'worker.js'), {
      silent: false,
      env: {
        __impl__: '',
        __specs__: '',
        __tester__: path.join(__dirname, 'fixtures', 'invalid-tester.js'),
        __testerId__: 'myScope/box/my-component'
      }
    });

    process.on('exit', () => {
      child.kill('SIGKILL');
    });

    child.on('message', ({ type, payload }: { type: string, payload: Object }) => {
      expect(type).to.equal('error');
      expect(payload).to.equal('"myScope/box/my-component" doesn\'t have a valid tester interface');
      done();
    });
  });
});
