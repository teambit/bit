import prettyTime from 'pretty-time';
import type { Logger } from './logger';

/**
 * use it for a long running process. upon creation it logs the `processDescription`.
 * if the process involves iteration over a list of items, such as running tag on a list of
 * components, then pass the `totalItems` as the total components in the list.
 * later, during the iteration, call `logProgress(componentName)`.
 * once done, call `end()`.
 * the status-line will show all messages in the terminal.
 * see README for more data.
 */
export class LongProcessLogger {
  constructor(
    private logPublisher: Logger,
    private extensionName: string,
    private processDescription: string,
    private totalItems?: number,
    private currentItem = 0,
    private startTime = process.hrtime()
  ) {
    this.start();
  }

  logProgress(itemName = '') {
    this.currentItem += 1;
    const message = `${this.processDescription} (${this.currentItem}/${this.totalItems}). ${itemName}`;
    this.logPublisher.debug(message);
    this.logPublisher.setStatusLine(`${this.extensionName}, ${message}`);
  }

  end() {
    const duration = process.hrtime(this.startTime);
    const message = `${this.processDescription} (completed in ${prettyTime(duration)})`;
    this.logAndConsole(message);
  }

  private start() {
    const totalItemsStr = this.totalItems ? `(total: ${this.totalItems})` : '';
    const message = `${this.processDescription} ${totalItemsStr}`;
    this.logAndConsole(message);
  }

  private logAndConsole(message: string) {
    this.logPublisher.info(message);
    this.logPublisher.setStatusLine(`${this.extensionName}, ${message}`);
  }
}
