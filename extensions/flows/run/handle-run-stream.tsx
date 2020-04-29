import { ReplaySubject } from 'rxjs';
import { EventEmitter } from 'events';
import { tap, filter, take } from 'rxjs/operators';
import { flattenNestedMap } from '../util/flatten-nested-map';
import { LogPublisher } from '@bit/bit.core.logger';

export const flowEvents = new EventEmitter();

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const print = (level = 'info') => (msg: any, logger: LogPublisher, _verbose = true): void => {
  [logger].forEach(log => log[level](msg.id, msg.value));
};
const printAll = (logs: LogPublisher[], id: string, msg: string) => {
  logs.forEach(log => log.info(id, msg));
};

const strategies: { [k: string]: (msg: any, logger: LogPublisher, verbose: boolean) => void } = {
  'task:stdout': (msg: any, logger: LogPublisher, verbose = true) => {
    verbose && printAll([logger, console], msg.id, msg.value);
  },
  'task:stderr': function(msg, logger: LogPublisher) {
    [logger, console].forEach(log => log.info(msg.id, msg.value));
  },
  'flow:start': function(msg: any) {
    flowEvents.emit('flowStarted', msg.id.toString());
    print();
  },
  'flow:result': function(msg: any) {
    flowEvents.emit('flowExecuted', msg.id.toString());
    print();
  },
  'network:start': print(),
  'network:result': print()
};

/**
 * Takes a Reporter (currently logger) with an execution stream and display results to the UI
 * TODO: Replace event emitter with in flows with reporter handling here.
 *
 * @param runStream network stream from execution
 * @param logger way to publish logs - TODO should change to reporter
 * @param verbose UI option to verbose log everything
 */
export function reportRunStream(runStream: ReplaySubject<any>, logger: LogPublisher, verbose: boolean) {
  return runStream
    .pipe(
      flattenNestedMap(),
      tap((message: any) => {
        if (strategies[message.type]) {
          strategies[message.type](message, logger, verbose);
        } else {
          logger.debug(message.id, `got unknown message from network: ${message.type} from ${message.id}`);
        }
      }),
      filter((message: any) => message.type.trim() === 'network:result'),
      // tap(message => console.log('tap message:', message.type)),
      take(1)
    )
    .toPromise();
}
