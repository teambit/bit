/* eslint-disable max-classes-per-file */

import { Subject } from 'rxjs';
import { join } from 'path';
import { createExecutionStream } from './execution-stream';
import ContainerExec from '../../isolator/capsule/container-exec';
import { Capsule } from '../../isolator/capsule';

export const PackageMarker = '#';

export class Task {
  static execute(task: string, capsule: Capsule): Subject<any> {
    const isExtension = (taskString: string) => (taskString || '').trim().startsWith(PackageMarker);

    const time = new Date();
    const exec: ContainerExec = new ContainerExec();
    const stream = createExecutionStream(exec, `${capsule.component.id.toString()}:${task}`, time);
    if (isExtension(task)) {
      const { host, pathToScript } = createHostScript(capsule, task);
      capsule.execNode(host, { args: [pathToScript] }, exec);
    } else {
      capsule.typedExec(
        {
          command: task.trim().split(' '),
          stdio: 'ipc',
          cwd: ''
        } as any,
        exec
      );
    }
    return stream;
  }
}

function createHostScript(capsule: Capsule, task: string) {
  const parts = task
    .trim()
    .slice(1)
    .split(':');
  const host = '__bit_container.js';
  const containerScript = getContainerScript();
  capsule.fs.writeFileSync(host, containerScript, { encoding: 'utf8' });
  return { host, pathToScript: join(...parts) };
}

function getContainerScript() {
  return `function handleError(error) {
    process && process.send ? process.send({ error }) : console.error(error);
    process.exit(1);
  }

  const pathToTask = process.argv.find(function(value, index, arr) {
    if (!index) {
      return false;
    }
    return __filename.endsWith(arr[index - 1]);
  });

  let userTask;
  try {
    userTask = require(pathToTask);
  } catch (e) {
    handleError(new Error('script-container can not find user task'));
  }

  const toExecute = userTask.default || userTask;

  if (typeof toExecute === 'function') {
    const getPromisedResult = () => {
      const executed = toExecute();
      return executed && executed.then ? executed : Promise.resolve(executed);
    };
    getPromisedResult()
      .then(userTaskResult => {
        process.on('beforeExit', async code => {
          const toSend = userTaskResult || { exitCode: code };
          process.send ? process.send(toSend) : Promise.resolve();
        });
      })
      .catch(handleError);
  }
  `;
}

/*
{
           PackageMarker                                                PipeMarker
           ^                                                            ^
           |                                                            |
  build: ['#bit/envs.react:compile-ts', 'tsc -d', 'cp -r temp/ dist/', '*test', 'node node_modules/bin/tsc'],
  test: ['jest --something *.spec.js']
}
*/
