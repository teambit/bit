import { ContainerExec } from '@teambit/isolator';
import logger from '@teambit/legacy/dist/logger/logger';
import { ReplaySubject, Subject } from 'rxjs';

export function listenToExecutionStream(exec: ContainerExec, id: string, time: Date = new Date()): Subject<unknown> {
  logger.debug(`flowsExt, createExecutionStream of ${id} started`);
  let message: any = null;
  const subscriber = new ReplaySubject();
  subscriber.next({
    type: 'task:start',
    id,
    startTime: time,
  });

  exec.stdout.on('data', function (data) {
    subscriber.next({
      type: 'task:stdout',
      id,
      value: data.toString(),
    });
  });

  exec.stderr.on('data', function (data) {
    logger.error(`flowsExt, createExecutionStream of ${id} got error: ${data.toString()}`);
    subscriber.next({
      type: 'task:stderr',
      id,
      value: data.toString(),
    });
  });

  exec.on('message', function (data) {
    message = data;
  });

  exec.on('close', function () {
    logger.debug(`flowsExt, createExecutionStream of ${id} completed!`);
    const streamMessage = {
      type: 'task:result',
      id,
      value: message,
      startTime: time,
      duration: new Date().getTime() - time.getTime(),
      code: exec.code,
    };
    subscriber.next(streamMessage);
    subscriber.complete();
  });
  return subscriber;
}
