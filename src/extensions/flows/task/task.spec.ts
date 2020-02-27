import { rmdir } from 'fs-extra';
import { expect } from 'chai';
import { createFakeCapsule } from '../util/create-capsule';
import { Task } from './task';

describe.only('task', function() {
  describe.only('should run bash commands', function() {
    it('with stdout', async function() {
      const message = 'hello-world';
      const stream = await runTask(`echo ${message}`);
      return expectMessage(stream, message);
    });

    it('with stderr', async function() {
      const message = 'hello-world';
      const stream = await runTask(`1>&2 echo ${message} && false`);

      return expectMessage(stream, message, 'stderr', 1);
    });
  });

  describe('should run module', function() {
    it('with stdout', function() {});
    it('with stderr', function() {});
    it('with result', function() {});
  });
});

function expectMessage(stream, message: string, pipeName = 'stdout', code = 0) {
  let out = '';
  return new Promise(resolve =>
    stream.subscribe({
      next(data) {
        if (data.type === pipeName) {
          out += data.value.toString();
        } else if (data.type === 'result') {
          expect(data.code).to.equal(code);
        }
      },
      complete() {
        expect(out).to.equal(`${message}\n`);
        resolve();
      }
    })
  );
}

async function runTask(task: string, id = '@bit/button1') {
  const test = getTestCase(id);
  const capsule = await createFakeCapsule(test, id);
  const stream = await Task.execute(task, capsule);
  return stream;
}

function getTestCase(name: string) {
  const main = 'src/index.js';
  return {
    [main]: `console.log('hello-world')`,
    'package.json': JSON.stringify({ main, name }, null, 2)
  };
}
