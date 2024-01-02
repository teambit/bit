import prettyTime from 'pretty-time';
import type { Logger } from './logger';

export type ConsoleOnStart = 'normal' | 'title';

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
  private currentItem = 0;
  private startTime = process.hrtime();
  constructor(
    private logPublisher: Logger,
    private extensionName: string,
    private processDescription: string,
    private totalItems?: number,
    shouldConsole?: ConsoleOnStart
  ) {
    this.start(shouldConsole);
  }

  logProgress(itemName = '', showProcessDescription = true) {
    this.currentItem += 1;
    const processDesc = showProcessDescription ? `${this.processDescription} ` : '';
    const message = `${processDesc}${this.getProgress()} ${itemName}`;
    this.logPublisher.debug(message);
    this.logPublisher.setStatusLine(message, true);
  }

  end(shouldConsole?: 'success' | 'error') {
    if (process.env.CI && !shouldConsole) shouldConsole = 'success';
    const description = this.processDescription;
    const duration = process.hrtime(this.startTime);
    const completedOrFailedStr = !shouldConsole || shouldConsole === 'success' ? 'Succeeded' : 'Failed';
    const message = `${description}. ${completedOrFailedStr} in ${prettyTime(duration)}`;
    this.logPublisher.info(message);
    if (shouldConsole) {
      if (shouldConsole === 'success') this.logPublisher.consoleSuccess(message);
      else this.logPublisher.consoleFailure(message);
    } else this.logPublisher.setStatusLine(message);
  }

  getProgress() {
    return `(${this.currentItem}/${this.totalItems})`;
  }

  private start(shouldConsole?: ConsoleOnStart) {
    if (process.env.CI && !shouldConsole) shouldConsole = 'normal';
    const totalItemsStr = this.totalItems ? `(total: ${this.totalItems})` : '';
    const message = `${this.processDescription} ${totalItemsStr}`;
    this.logPublisher.info(message);
    if (shouldConsole) {
      if (shouldConsole === 'title') this.logPublisher.consoleTitle(message);
      else this.logPublisher.console(message);
    } else this.logPublisher.setStatusLine(message);
  }
}
