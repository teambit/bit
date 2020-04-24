import { ReplaySubject } from 'rxjs';
import { tap, filter } from 'rxjs/operators';
import { flattenNestedMap } from '../util/flatten-nested-map';
import { LogPublisher } from '../../logger';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const print = (level = 'info') => (msg: any, logger: LogPublisher, _verbose = true): void => {
  logger[level](msg.id, msg.value);
};

const strategies: { [k: string]: (msg: any, logger: LogPublisher, verbose: boolean) => void } = {
  'task:stdout': (msg: any, logger: LogPublisher, verbose = true) => {
    verbose && logger.info(msg.id, msg.value);
  },
  'task:stderr': print('error'),
  'flow:start': print(),
  'flow:result': print(),
  'network:start': print(),
  'network:result': print()
};

export function reportRunStream(runStream: ReplaySubject<any>, logger: LogPublisher, verbose: boolean) {
  return runStream
    .pipe(
      flattenNestedMap(),
      tap((message: any) => {
        console.log(' I HAVE', message.type);
        if (strategies[message.type]) {
          strategies[message.type](message, logger, verbose);
        } else {
          logger.debug(message.id, `got unknown message from network: ${message.type} from ${message.id}`);
        }
      }),
      filter((message: any) => message.type.trim() === 'network:result'),
      tap(message => console.log('tap message:', message.type))
    )
    .toPromise()
    .then((result: any) => {
      console.log('then');
      return result;
    });
}
