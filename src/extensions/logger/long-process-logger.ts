import { EventEmitter } from 'events';
import type { LogPublisher } from '../types';

const EVENT = 'setStatus';

export class LogLongProcess {
  constructor(
    private logPublisher: LogPublisher,
    private extensionName: string,
    private emitter: EventEmitter,
    private message: string,
    private totalItems: number,
    private currentItem = 0
  ) {
    const output = `${this.extensionName}, ${this.message} (total: ${this.totalItems})`;
    logPublisher.info(undefined, output);
    emitter.emit(EVENT, output);
  }

  processItem(itemName = '') {
    this.currentItem += 1;
    const output = `${this.extensionName}, ${this.message} (${this.totalItems}/${this.currentItem}). ${itemName}`;
    this.logPublisher.info(undefined, output);
    this.emitter.emit(EVENT, output);
  }

  done() {
    this.logPublisher.info(undefined, `${this.extensionName}, ${this.message} (finished)`);
    this.emitter.emit(EVENT, '');
  }
}
