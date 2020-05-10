import { remove } from 'fs-extra';
import { expect } from 'chai';
import { createFakeCapsule } from '../util/create-capsule';
import { executeTask } from './task';

describe('task', function() {
  this.afterAll(async function() {
    return remove('/tmp/@bit-test');
  });
  describe('should run bash commands', function() {
    it('with stdout', async function() {
      const message = 'hello-world';
      const stream = await runTask(`echo ${message}`);
      return expectMessage(stream, message);
    });

    it('with stderr', async function() {
      const message = 'hello-world';
      const stream = await runTask(`1>&2 echo ${message} && false`);

      return expectMessage(stream, message, 'task:stderr', 1);
    });
  });

  describe('should run module', function() {
    it('with stdout and result', async function() {
      const stream = await runTask('@bit/extension', '@bit-test/button0', createModuleTestCase);
      return expectMessage(stream, 'hello-module', 'task:stdout', 0, { message: 'hello-module' });
    });

    it('with stderr and result', async function() {
      const stream = await runTask('@bit/ext-err', '@bit-test/button1', getErrorCase as any);
      return expectMessage(stream, 'hello-module', 'task:stderr', 0, { message: 'hello-module' });
    });
  });
});

function expectMessage(stream, message: string, pipeName = 'task:stdout', code = 0, value: any = null) {
  let out = '';
  return new Promise(resolve =>
    stream.subscribe({
      next(data) {
        if (data.type === pipeName) {
          out += data.value.toString();
        } else if (data.type === 'result') {
          expect(data.code).to.equal(code);
          expect(data.value).to.deep.equal(value);
        }
      },
      complete() {
        expect(out).to.equal(`${message}\n`);
        resolve();
      }
    })
  );
}

async function runTask(task: string, id = '@bit-test/button', getter = getTestCase) {
  const test = getter(id);
  const capsule = await createFakeCapsule(test, id);
  const stream = executeTask(task, capsule);
  return stream;
}

export function getTestCase(name: string, main = 'src/index.js') {
  return {
    [main]: `console.log('hello-world')`,
    'package.json': JSON.stringify({ main, name }, null, 2)
  };
}

function createModuleTestCase(name: string) {
  const testCase = getTestCase(name);
  const main = 'node_modules/@bit/extension/index.js';
  testCase['node_modules/@bit/extension/index.js'] = `
    module.exports = function helloModule() {
      console.log('hello-module')
      return {
        message: 'hello-module'
      }
    }
  `;
  testCase['node_modules/@bit/extension/package.json'] = JSON.stringify({ main, name }, null, 2);
  return testCase;
}

function getErrorCase(id: string) {
  const testCase = getTestCase(id);
  testCase['node_modules/@bit/ext-err/index.js'] = `
    module.exports = function printErr() {
      console.error('hello-module')
      return {
        message: 'hello-module'
      }
    }
  `;
  return testCase;
}
