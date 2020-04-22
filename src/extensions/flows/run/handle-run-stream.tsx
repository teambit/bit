import { ReplaySubject } from 'rxjs';
import { Reporter } from '../../reporter';
import { flattenReplaySubject } from '../util/flatten-nested-map';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const print = (level = 'info') => (msg: any, reporter: Reporter, _verbose = true): void => {
  reporter.createLogger(msg.id)[level](msg.value);
};

const printMessage = (customMessage: string, level = 'info', customPrint = print) => (
  msg: any,
  reporter: Reporter,
  verbose: boolean
) => {
  return customPrint(level)({ ...msg, value: customMessage || msg.value }, reporter, verbose);
};

const strategies: { [k: string]: (msg: any, reporter: Reporter, verbose: boolean) => void } = {
  'task:stdout': (msg: any, reporter: Reporter, verbose = true): void => {
    verbose && reporter.createLogger(msg.id).info(msg.value);
  },
  'task:stderr': print('error'),
  'flow:start': printMessage('***** Flow Started *****'),
  'flow:result': print(),
  'network:start': printMessage('***** Run Flows Started *****'),
  'network:result': printMessage('***** Run Flows Finished *****')
};

export function reportRunStream(stream: ReplaySubject<any>, reporter: Reporter, verbose: boolean) {
  let result;
  return new Promise((resolve, reject) => {
    flattenReplaySubject(stream).subscribe({
      next(message: any) {
        if (message.type === 'network:result') {
          result = message;
        }
        if (strategies[message.type]) {
          strategies[message.type(message, reporter, verbose)];
        } else {
          reporter
            .createLogger(message.id)
            .info('got unknown message from network: ', message.type, 'from', message.id);
        }
        return result;
      },
      complete: () => resolve(result),
      error: reject
    });
  });
}
