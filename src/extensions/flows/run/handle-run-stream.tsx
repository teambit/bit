import { ReplaySubject } from 'rxjs';
import { Reporter } from '../../reporter';
import { flattenReplaySubject } from '../util/flatten-nested-map';
import { LogPublisher, Logger } from '../../logger';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const print = (level = 'info') => (msg: any, logger: LogPublisher, _verbose = true): void => {
  logger[level](msg.id.toString(), msg.value);
};

const printMessage = (customMessage: string, level = 'info', customPrint = print) => (
  msg: any,
  reporter: LogPublisher,
  verbose: boolean
) => {
  return customPrint(level)({ ...msg, value: customMessage || msg.value }, reporter, verbose);
};

const strategies: { [k: string]: (msg: any, reporter: LogPublisher, verbose: boolean) => void } = {
  'task:stdout': (msg: any, logger: LogPublisher, verbose = true): void => {
    verbose && logger.info(msg.id.toString(), msg.value);
  },
  'task:stderr': print('error'),
  'flow:start': printMessage('***** Flow Started *****'),
  'flow:result': print(),
  'network:start': printMessage('***** Run Flows Started *****'),
  'network:result': printMessage('***** Run Flows Finished *****')
};

export function reportRunStream(stream: ReplaySubject<any>, reporter: LogPublisher, verbose: boolean) {
  let result;
  return new Promise((resolve, reject) => {
    flattenReplaySubject(stream).subscribe({
      next(message: any) {
        if (message.type === 'network:result') {
          result = message;
        }
        if (strategies[message.type]) {
          strategies[message.type](message, reporter, verbose);
        } else {
          reporter.info(
            message.id.toString(),
            `got unknown message from network: ${message.type} from ${message.id.toString()}`
          );
        }
        return result;
      },
      complete: () => {
        return resolve(result);
      },
      error: reject
    });
  });
}
