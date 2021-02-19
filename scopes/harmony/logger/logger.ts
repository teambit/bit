import loader from '@teambit/legacy/dist/cli/loader';
import logger, { IBitLogger } from '@teambit/legacy/dist/logger/logger';
import chalk from 'chalk';
import stc from 'string-to-color';

import { LongProcessLogger } from './long-process-logger';

export class Logger implements IBitLogger {
  constructor(private extensionName: string) {}

  trace(message: string, ...meta: any[]) {
    logger.trace(this.colorMessage(message), ...meta);
  }
  debug(message: string, ...meta: any[]) {
    logger.debug(this.colorMessage(message), ...meta);
  }
  info(message: string, ...meta: any[]) {
    logger.info(this.colorMessage(message), ...meta);
  }
  warn(message: string, ...meta: any[]) {
    logger.warn(this.colorMessage(message), ...meta);
  }
  error(message: string, ...meta: any[]) {
    logger.error(this.colorMessage(message), ...meta);
  }
  fatal(message: string, ...meta: any[]) {
    logger.fatal(this.colorMessage(message), ...meta);
  }

  get isLoaderStarted() {
    return loader.isStarted;
  }
  /**
   * use it for a long running process. upon creation it logs the `processDescription`.
   * if the process involves iteration over a list of items, such as running tag on a list of
   * components, then pass the `totalItems` as the total of the total components in the list.
   * later, during the iteration, call `LongProcessLogger.logProgress(componentName)`.
   * once done, call `LongProcessLogger.end()`
   * the status-line will show all messages in the terminal.
   */
  createLongProcessLogger(processDescription: string, totalItems?: number): LongProcessLogger {
    return new LongProcessLogger(this, this.extensionName, processDescription, totalItems);
  }
  /**
   * single status-line on the bottom of the screen.
   * the text is replaced every time this method is called.
   */
  setStatusLine(text: string) {
    loader.setTextAndRestart(text);
  }
  /**
   * remove the text from the last line on the screen.
   */
  clearStatusLine() {
    loader.stop();
  }
  /**
   * print to the screen. if message is empty, print the last logged message.
   */
  console(message?: string) {
    if (message) this.info(message);
    if (!loader.isStarted && logger.shouldWriteToConsole) {
      // eslint-disable-next-line no-console
      console.log(message);
    } else {
      loader.stopAndPersist({ text: message });
    }
  }
  /**
   * print to the screen as a title, with bold text.
   */
  consoleTitle(message: string) {
    this.info(message);
    loader.stopAndPersist({ text: chalk.bold(message) });
  }
  /**
   * print to the screen with a green `✔` prefix. if message is empty, print the last logged message.
   */
  consoleSuccess(message?: string) {
    if (message) this.info(message);
    loader.succeed(message);
  }

  /**
   * turn off the logger.
   */
  off() {
    return loader.off();
  }

  on() {
    return loader.on();
  }

  /**
   * print to the screen with a red `✖` prefix. if message is empty, print the last logged message.
   */
  consoleFailure(message?: string) {
    if (message) this.error(message);
    loader.fail(message);
  }
  /**
   * print to the screen with a red `⚠` prefix. if message is empty, print the last logged message.
   */
  consoleWarning(message?: string) {
    if (message) this.warn(message);
    loader.warn(message);
  }

  private colorMessage(message: string) {
    const text = `${this.extensionName}, ${message}`;
    if (logger.isJsonFormat) return text;
    return chalk.hex(stc(this.extensionName))(text);
  }
}
