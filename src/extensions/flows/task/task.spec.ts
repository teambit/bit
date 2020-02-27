import { rmdir } from 'fs-extra';
import { expect } from 'chai';
import { createFakeCapsule } from '../util/create-capsule';
import { Task } from './task';

describe.only('task', function() {
  describe('should run bash commands', function() {
    it.only('with stdout', async function() {
      this.timeout(100 * 10000);
      const message = 'hello world';
      const taskString = `echo ${message}`;
      const id = '@bit/button1';
      const test = getTestCase(id);
      const capsule = await createFakeCapsule(test, id);
      const stream = await Task.execute(taskString, capsule);
      let out = '';
      try {
        await new Promise(resolve =>
          stream.subscribe({
            next(data) {
              // debugger;
              console.log('data');
              if (data.type === 'stdout') {
                console.log('out');
                out += data.value;
                console.log('log', data.value.toString());
              }
            },
            complete() {
              console.log('yo');
              expect(out).to.equal('skjdksj');
              resolve();
            }
          })
        );
      } catch (e) {
        debugger;
      }
      // expect(out).to.equal(message);
      // await rmdir(capsule.wrkDir)
    });

    it('with stderr', function() {});
  });

  describe('should run module', function() {
    it('with stdout', function() {});
    it('with stderr', function() {});
    it('with result', function() {});
  });
});

function getTestCase(name: string) {
  const main = 'src/index.js';
  return {
    [main]: `console.log('hello-world')`,
    'package.json': JSON.stringify({ main, name }, null, 2)
  };
}
