import { EventEmitter } from 'events';
import type { LogPublisher } from '../types';

export const LONG_PROCESS_EVENT = 'longProcess';

export class LogLongProcess {
  constructor(
    private logPublisher: LogPublisher,
    private extensionName: string,
    private emitter: EventEmitter,
    private processDescription: string,
    private totalItems?: number,
    private currentItem = 0,
    private start = new Date().getTime()
  ) {
    const totalItemsStr = totalItems ? `(total: ${this.totalItems})` : '';
    const output = `${this.extensionName}, ${this.processDescription} ${totalItemsStr}`;
    logPublisher.info(undefined, output);
    emitter.emit(LONG_PROCESS_EVENT, output);
  }

  processItem(itemName = '') {
    this.currentItem += 1;
    const output = `${this.extensionName}, ${this.processDescription} (${this.currentItem}/${this.totalItems}). ${itemName}`;
    this.logPublisher.info(undefined, output);
    this.emitter.emit(LONG_PROCESS_EVENT, output);
  }

  done() {
    const duration = new Date().getTime() - this.start;
    const output = `${this.extensionName}, ${this.processDescription} (completed in ${duration}ms)`;
    this.logPublisher.info(undefined, output);
    this.emitter.emit(LONG_PROCESS_EVENT, output);
  }
}
