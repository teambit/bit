import { ReplaySubject } from 'rxjs';
import ContainerExec from '../../isolator/capsule/container-exec';

export function createExecutionStream(exec: ContainerExec, id, time: Date = new Date()) {
  let message: any = null;
  const subscriber = new ReplaySubject();
  subscriber.next({
    type: 'task:start',
    id,
    value: time
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
    const endTime = new Date();
    subscriber.next({
      type: 'task:result',
      id,
      value: message,
      endTime,
      duration: endTime.getTime() - time.getTime(),
      code: exec.code
    });
    subscriber.complete();
  });
  return subscriber;
}
