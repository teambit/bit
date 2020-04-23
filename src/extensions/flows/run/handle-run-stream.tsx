import { ReplaySubject } from 'rxjs';
import { flattenReplaySubject, flattenNestedMap } from '../util/flatten-nested-map';
import { LogPublisher } from '../../logger';

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

const strategies: { [k: string]: (msg: any, logger: LogPublisher, verbose: boolean) => void } = {
  'task:stdout': (msg: any, logger: LogPublisher, verbose = true): void => {
    verbose && logger.info(msg.id.toString(), msg.value);
  },
  'task:stderr': print('error'),
  'flow:start': printMessage('***** Flow Started *****'),
  'flow:result': print(),
  'network:start': printMessage('***** Run Flows Started *****'),
  'network:result': printMessage('***** Run Flows Finished *****')
};

export function reportRunStream(stream: ReplaySubject<any>, logger: LogPublisher, verbose: boolean) {
  let result;
  return new Promise((resolve, reject) => {
    stream.pipe(flattenNestedMap()).subscribe({
      next(message: any) {
        console.log(`got message of type ${message.type} from ${message.id} `);
        if (message.type === 'network:result') {
          result = message;
        }
        if (strategies[message.type]) {
          strategies[message.type](message, logger, verbose);
        } else {
          logger.info(
            message.id.toString(),
            `got unknown message from network: ${message.type} from ${message.id.toString()}`
          );
        }
        return result;
      },
      complete: () => {
        console.log('done ---- > VICTORY!');
        return resolve(result);
      },
      error: reject
    });
  });
}
