import loader, { DEFAULT_SPINNER } from '@teambit/legacy/dist/cli/loader/loader';
import logger, { IBitLogger } from '@teambit/legacy/dist/logger/logger';
import chalk from 'chalk';

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
  setStatusLine(text: string, spinner = DEFAULT_SPINNER) {
    loader.setTextAndRestart(text, spinner);
  }
  /**
   * remove the text from the last line on the screen.
   */
  clearStatusLine(spinner = DEFAULT_SPINNER) {
    loader.stop(spinner);
  }
  /**
   * print to the screen. if message is empty, print the last logged message.
   */
  console(message?: string, ...meta: any[]) {
    if (message) this.info(message, meta);
    if (!loader.isStarted && logger.shouldWriteToConsole) {
      // eslint-disable-next-line no-console
      console.log(message, ...meta);
    } else {
      loader.stopAndPersist(message);
    }
  }

  /**
   * print to the screen as a title, with bold text.
   */
  consoleTitle(message: string, spinner = DEFAULT_SPINNER) {
    this.info(message);
    loader.stopAndPersist(message, spinner);
  }
  /**
   * print to the screen with a green `✔` prefix. if message is empty, print the last logged message.
   */
  consoleSuccess(message?: string, spinner = DEFAULT_SPINNER) {
    if (message) this.info(message);
    loader.succeed(message, spinner);
  }
  /**
   * print to the screen with a red `✖` prefix. if message is empty, print the last logged message.
   */
  consoleFailure(message?: string, spinner = DEFAULT_SPINNER) {
    if (message) this.error(message);
    loader.fail(message, spinner);
  }
  /**
   * print to the screen with a red `⚠` prefix. if message is empty, print the last logged message.
   */
  consoleWarning(message?: string, spinner = DEFAULT_SPINNER) {
    if (message) {
      this.warn(message);
      message = chalk.yellow(message);
    }
    loader.warn(message, spinner);
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

  profile(id: string, console?: boolean) {
    logger.profile(id, console);
  }

  /**
   * @deprecated
   * try using consoleWarning. if not possible, rename this method to a clearer one
   */
  consoleWarn(message?: string, ...meta: any[]) {
    if (message) this.warn(message, ...meta);
    if (!loader.isStarted && logger.shouldWriteToConsole) {
      // eslint-disable-next-line no-console
      console.warn(message, ...meta);
    } else {
      loader.stopAndPersist(message);
    }
  }

  /**
   * @deprecated
   * try using consoleFailure. if not possible, rename this method to a clearer one
   */
  consoleError(message?: string, ...meta: any[]) {
    if (message) this.error(message, ...meta);
    if (!loader.isStarted && logger.shouldWriteToConsole) {
      // eslint-disable-next-line no-console
      console.error(message, ...meta);
    } else {
      loader.stopAndPersist(message);
    }
  }

  private colorMessage(message: string) {
    if (logger.isJsonFormat) return `${this.extensionName}, ${message}`;
    return `${chalk.bold(this.extensionName)}, ${message}`;
  }
}
