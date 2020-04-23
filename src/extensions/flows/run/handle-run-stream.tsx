import { ReplaySubject } from 'rxjs';
import { tap, filter } from 'rxjs/operators';
import { flattenNestedMap } from '../util/flatten-nested-map';
import { LogPublisher } from '../../logger';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const print = (level = 'info') => (msg: any, logger: LogPublisher, _verbose = true): void => {
  logger[level](msg.id, msg.value);
};

const printMessage = (customMessage: string, level = 'info', customPrint = print) => (
  msg: any,
  reporter: LogPublisher,
  verbose: boolean
) => {
  return customPrint(level)({ ...msg, value: customMessage || msg.value }, reporter, verbose);
};

const strategies: { [k: string]: (msg: any, logger: LogPublisher, verbose: boolean) => void } = {
  'task:stdout': (msg: any, logger: LogPublisher, verbose = true): void => {
    verbose && logger.info(msg.id, msg.value);
  },
  'task:stderr': print('error'),
  'flow:start': printMessage('***** Flow Started *****'),
  'flow:result': print(),
  'network:start': printMessage('***** Run Flows Started *****'),
  'network:result': printMessage('***** Run Flows Finished *****')
};

export function reportRunStream(runStream: ReplaySubject<any>, logger: LogPublisher, verbose: boolean) {
  return runStream
    .pipe(
      flattenNestedMap(),
      tap((message: any) => {
        if (strategies[message.type]) {
          strategies[message.type](message, logger, verbose);
        } else {
          logger.info(
            message.id.toString(),
            `got unknown message from network: ${message.type} from ${message.id.toString()}`
          );
        }
      }),
      filter((message: any) => message.type === 'network:result')
    )
    .toPromise();
}
