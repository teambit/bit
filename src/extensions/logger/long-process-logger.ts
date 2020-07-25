import { EventEmitter } from 'events';
import type { LogPublisher } from '../types';

export const LONG_PROCESS_EVENT = 'longProcess';

export class LogLongProcess {
  constructor(
    private logPublisher: LogPublisher,
    private extensionName: string,
    private emitter: EventEmitter,
    private processDescription: string,
    private totalItems: number,
    private currentItem = 0,
    private start = new Date().getTime()
  ) {
    const output = `${this.extensionName}, ${this.processDescription} (total: ${this.totalItems})`;
    logPublisher.info(undefined, output);
    emitter.emit(LONG_PROCESS_EVENT, output);
  }

  processItem(itemName = '') {
    this.currentItem += 1;
    const output = `${this.extensionName}, ${this.processDescription} (${this.totalItems}/${this.currentItem}). ${itemName}`;
    this.logPublisher.info(undefined, output);
    this.emitter.emit(LONG_PROCESS_EVENT, output);
  }

  done() {
    const duration = new Date().getTime() - this.start;
    this.logPublisher.info(undefined, `${this.extensionName}, ${this.processDescription} (completed in ${duration}ms)`);
    this.emitter.emit(LONG_PROCESS_EVENT, '');
  }
}
