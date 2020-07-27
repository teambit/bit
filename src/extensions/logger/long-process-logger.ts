import { EventEmitter } from 'events';
import type { LogPublisher } from '../types';

export const LONG_PROCESS_EVENT = 'longProcess';

/**
 * use it for a long running process. upon creation it logs the `processDescription`.
 * if the process involves iteration over a list of items, such as running tag on a list of
 * components, then pass the `totalItems` as the total components in the list.
 * later, during the iteration, call `logProgress(componentName)`.
 * once done, call `end()`.
 * if the reporter is used, the status-line will show all messages in the terminal.
 * see README for more data.
 */
export class LongProcessLogger {
  constructor(
    private logPublisher: LogPublisher,
    private extensionName: string,
    private emitter: EventEmitter,
    private processDescription: string,
    private totalItems?: number,
    private currentItem = 0,
    private startTime = new Date().getTime()
  ) {
    this.start();
  }

  logProgress(itemName = '') {
    this.currentItem += 1;
    const message = `${this.extensionName}, ${this.processDescription} (${this.currentItem}/${this.totalItems}). ${itemName}`;
    this.logAndEmit(message);
  }

  end() {
    const duration = new Date().getTime() - this.startTime;
    const message = `${this.extensionName}, ${this.processDescription} (completed in ${duration}ms)`;
    this.logAndEmit(message);
  }

  private start() {
    const totalItemsStr = this.totalItems ? `(total: ${this.totalItems})` : '';
    const message = `${this.extensionName}, ${this.processDescription} ${totalItemsStr}`;
    this.logAndEmit(message);
  }

  private logAndEmit(message: string) {
    this.logPublisher.info(undefined, message);
    this.emitter.emit(LONG_PROCESS_EVENT, message);
  }
}
