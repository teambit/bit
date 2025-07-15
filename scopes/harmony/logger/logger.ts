import Spinnies from 'dreidels';
import { loader } from '@teambit/legacy.loader';
import { logger, IBitLogger } from '@teambit/legacy.logger';
import chalk from 'chalk';
import { platform } from 'os';
import { ConsoleOnStart, LongProcessLogger } from './long-process-logger';

export class Logger implements IBitLogger {
  private spinnies?: Spinnies;
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

  get isSpinning() {
    return loader.isSpinning;
  }

  get multiSpinner(): Spinnies {
    if (!this.spinnies) this.spinnies = new Spinnies();
    return this.spinnies;
  }

  /**
   * use it for a long running process. upon creation it logs the `processDescription`.
   * if the process involves iteration over a list of items, such as running tag on a list of
   * components, then pass the `totalItems` as the total of the total components in the list.
   * later, during the iteration, call `LongProcessLogger.logProgress(componentName)`.
   * once done, call `LongProcessLogger.end()`
   * the status-line will show all messages in the terminal.
   */
  createLongProcessLogger(
    processDescription: string,
    totalItems?: number,
    shouldConsole?: ConsoleOnStart
  ): LongProcessLogger {
    return new LongProcessLogger(this, this.extensionName, processDescription, totalItems, shouldConsole);
  }
  /**
   * single status-line on the bottom of the screen.
   * the text is replaced every time this method is called.
   */
  setStatusLine(text: string, shouldPrintOnCI = false) {
    if (process.env.CI && !shouldPrintOnCI) return;
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
  console(message?: string, ...meta: any[]) {
    if (message) this.info(message, meta);
    if (!loader.isStarted && logger.shouldWriteToConsole) {
      // eslint-disable-next-line no-console
      console.log(message, ...meta);
    } else {
      loader.stopAndPersist({ text: message });
    }
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
      loader.stopAndPersist({ text: message });
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
  consoleSuccess(message?: string, startTime?: [number, number]) {
    if (message) this.info(message);
    loader.succeed(message, startTime);
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
   * by default, the "profile" writes the message as "info". use this method to write it as "trace".
   */
  profileTrace(id: string) {
    logger.profile(id, false, 'trace');
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
    if (message) {
      this.warn(message);
      message = chalk.yellow(message);
    }
    loader.warn(message);
  }

  private colorMessage(message: string) {
    if (logger.isJsonFormat) return `${this.extensionName}, ${message}`;
    return `${chalk.bold(this.extensionName)}, ${message}`;
  }

  /**
   * a recent change on Windows caused the check mark to be printed as purple.
   * see https://github.com/chalk/chalk/issues/625
   */
  static successSymbol() {
    return platform() === 'win32' ? chalk.green('✓') : chalk.green('✔');
  }
}
