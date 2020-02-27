import { Observable } from 'rxjs';
import ContainerExec from '../../capsule-ext/container-exec';

export function createExecutionStream(exec: ContainerExec, id, time: Date = new Date()) {
  let message: any = null;
  return new Observable(function(subscriber) {
    subscriber.next({
      type: 'start',
      id,
      value: time
    });

    exec.stdout.on('data', function(data) {
      subscriber.next({
        type: 'stdout',
        id,
        value: data.toString()
      });
    });

    exec.stderr.on('data', function(data) {
      subscriber.next({
        type: 'stderr',
        id,
        value: data.toString()
      });
    });

    // @ts-ignore
    exec.on('message', function(data) {
      message = data;
    });

    exec.on('close', function() {
      const endTime = new Date();
      subscriber.next({
        type: 'result',
        id,
        value: message,
        endTime,
        duration: endTime.getTime() - time.getTime(),
        code: exec.code
      });
      subscriber.complete();
    });
  });
}
