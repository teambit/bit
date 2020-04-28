import { ReplaySubject, Subject } from 'rxjs';
import ContainerExec from '../../isolator/capsule/container-exec';

export function createExecutionStream(exec: ContainerExec, id: string, time: Date = new Date()): Subject<any> {
  let message: any = null;
  const subscriber = new ReplaySubject();
  subscriber.next({
    type: 'task:start',
    id,
    startTime: time
  });

  exec.stdout.on('data', function(data) {
    subscriber.next({
      type: 'task:stdout',
      id,
      value: data.toString()
    });
  });

  exec.stderr.on('data', function(data) {
    subscriber.next({
      type: 'task:stderr',
      id,
      value: data.toString()
    });
  });

  exec.on('message', function(data) {
    message = data;
  });

  exec.on('close', function() {
    const streamMessage = {
      type: 'task:result',
      id,
      value: message,
      startTime: time,
      duration: new Date().getTime() - time.getTime(),
      code: exec.code
    };
    subscriber.next(streamMessage);
    subscriber.complete();
  });
  return subscriber;
}
