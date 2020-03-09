/* eslint-disable max-classes-per-file */

import { Subject, from } from 'rxjs';
import { join } from 'path';
import { readFile } from 'fs-extra';
import { createExecutionStream } from './execution-stream';
import ContainerExec from '../../isolator/capsule/container-exec';
import { Capsule } from '../../isolator/capsule';

export const PackageMarker = '#';

export class Task {
  static execute(task: string, capsule: Capsule): Subject<any> {
    const isExtension = (taskString: string) => (taskString || '').trim().startsWith(PackageMarker);

    const time = new Date();
    const exec: ContainerExec = new ContainerExec();

    const stream = createExecutionStream(exec, `${capsule.id}:${task}`, time);
    if (isExtension(task)) {
      from(createHostScript(capsule, task)).subscribe(({ host, pathToScript }) => {
        return capsule.execNode(host, { args: [pathToScript] }, exec);
      });
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

async function createHostScript(capsule: Capsule, task: string) {
  const parts = task
    .trim()
    .slice(1)
    .split(':');
  const host = '__bit_container.js';
  const containerScript = await readFile(join(__dirname, 'container-script.js'), { encoding: 'utf8' });
  capsule.fs.writeFileSync(host, containerScript, { encoding: 'utf8' });
  return { host, pathToScript: join(...parts) };
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
