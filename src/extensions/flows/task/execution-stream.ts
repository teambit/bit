import { Exec } from '@teambit/capsule';
import { Observable } from 'rxjs';

export function createExecutionStream(exec: Exec, id, time: Date = new Date()) {
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

    exec.on('end', function() {
      console.log('close');
      const endTime = new Date();
      subscriber.next({
        type: 'result',
        id,
        value: message,
        endTime,
        duration: endTime.getTime() - time.getTime(),
        status: exec
      });
      subscriber.complete();
    });
  });
}
