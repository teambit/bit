import chalk from 'chalk';
import fs from 'fs-extra';
import path from 'path';
import { serializeError } from 'serialize-error';
import format from 'string-format';
import { Logger as PinoLogger, Level } from 'pino';
import yn from 'yn';
import pMapSeries from 'p-map-series';

import { Analytics } from '@teambit/legacy.analytics';
import { getConfig } from '@teambit/config-store';
import { defaultErrorHandler } from '@teambit/cli';
import { CFG_LOG_JSON_FORMAT, CFG_LOG_LEVEL, CFG_NO_WARNINGS, DEBUG_LOG } from '@teambit/legacy.constants';
import { getPinoLogger } from './pino-logger';
import { Profiler } from './profiler';
import { loader } from '@teambit/legacy.loader';
import { rotateLogDaily } from './rotate-log-daily';

export { Level as LoggerLevel };

const jsonFormat =
  yn(getConfig(CFG_LOG_JSON_FORMAT), { default: false }) || yn(process.env.JSON_LOGS, { default: false });

export const shouldDisableLoader = yn(process.env.BIT_DISABLE_SPINNER);
export const shouldDisableConsole =
  yn(process.env.BIT_DISABLE_CONSOLE) || process.argv.includes('--json') || process.argv.includes('-j');

const LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace'];

const DEFAULT_LEVEL = 'debug';

const logLevel = getLogLevel();

rotateLogDaily(DEBUG_LOG);

const { pinoLogger, pinoLoggerConsole, pinoSSELogger } = getPinoLogger(logLevel, jsonFormat);

export interface IBitLogger {
  trace(message: string, ...meta: any[]): void;

  debug(message: string, ...meta: any[]): void;

  warn(message: string, ...meta: any[]): void;

  info(message: string, ...meta: any[]): void;

  error(message: string, ...meta: any[]): void;

  fatal(message: string, ...meta: any[]): void;

  console(msg: string): void;
}

const commandHistoryFile = 'command-history';

/**
 * the method signatures of debug/info/error/etc are similar to Winston.logger.
 * the way how it is formatted in the log file is according to the `customPrint` function above.
 *
 * Note about logging Error objects (with stacktrace).
 * when throwing an error in the code, it shows it formatted nicely in the log. and also in the console when
 * BIT_LOG is used.
 * when using logger.error(error), it shows undefined, because it expects a message as the first parameter.
 * when using logger.error(message, error), it shows the error serialized and unclear.
 * normally, no need to call logger.error(). once an error is thrown, it is already logged.
 */
class BitLogger implements IBitLogger {
  logger: PinoLogger;
  private profiler: Profiler;
  private onBeforeExitFns: Function[] = [];

  isDaemon = false; // 'bit cli' is a daemon as it should never exit the process, unless the user kills it
  /**
   * being set on command-registrar, once the flags are parsed. here, it's a workaround to have
   * it set before the command-registrar is loaded. at this stage we don't know for sure the "-j"
   * is actually "json". that's why this variable is overridden once the command-registrar is up.
   */
  shouldWriteToConsole = !shouldDisableConsole;
  /**
   * helpful to get a list in the .bit/command-history of all commands that were running on this workspace.
   * it's written only if the consumer is loaded. otherwise, the commandHistory.fileBasePath is undefined
   */
  commandHistoryBasePath: string | undefined;
  shouldConsoleProfiler = false;
  constructor(logger: PinoLogger) {
    this.logger = logger;
    this.profiler = new Profiler();
  }

  /**
   * @deprecated use trace instead
   */
  silly(message: string, ...meta: any[]) {
    this.logger.trace(message, ...meta);
  }

  trace(message: string, ...meta: any[]) {
    this.logger.trace(message, ...meta);
  }

  debug(message: string, ...meta: any[]) {
    this.logger.debug(message, ...meta);
  }

  warn(message: string, ...meta: any[]) {
    this.logger.warn(message, ...meta);
  }

  info(message: string, ...meta: any[]) {
    this.logger.info(message, ...meta);
  }

  error(message: string, ...meta: any[]) {
    this.logger.error(message, ...meta);
  }

  fatal(message: string, ...meta: any[]) {
    this.logger.fatal(message, ...meta);
  }

  get isJsonFormat() {
    return jsonFormat;
  }

  /**
   * use this instead of calling `console.log()`, this way it won't break commands that don't
   * expect output during the execution.
   */
  console(msg?: string | Error, level: Level = 'info', color?: string) {
    if (!msg) {
      return;
    }
    let messageStr: string;
    if (msg instanceof Error) {
      const { message } = defaultErrorHandler(msg);
      messageStr = message;
    } else {
      messageStr = msg;
    }
    if (!this.shouldWriteToConsole) {
      this[level](messageStr);
      return;
    }
    if (color) {
      try {
        messageStr = chalk.keyword(color)(messageStr);
      } catch {
        this.trace('a wrong color provided to logger.console method');
      }
    }
    loader.stopAndPersist({ text: messageStr });
  }

  /**
   * useful to get an idea how long it takes from one point in the code to another point.
   * to use it, choose an id and call `logger.profile(your-id)` before and after the code you want
   * to measure. e.g.
   * ```
   * logger.profile('loadingComponent');
   * consumer.loadComponent(id);
   * logger.profile('loadingComponent');
   * ```
   * once done, the log writes the time it took to execute the code between the two calls.
   * if this is a repeated code it also shows how long this code was executed in total.
   * an example of the output:
   * [2020-12-04 16:24:46.100 -0500] INFO	 (31641): loadingComponent: 14ms. (total repeating 14ms)
   * [2020-12-04 16:24:46.110 -0500] INFO	 (31641): loadingComponent: 18ms. (total repeating 32ms)
   */
  profile(id: string, console?: boolean, level: Level = 'info') {
    const msg = this.profiler.profile(id);
    if (!msg) return;
    const fullMsg = `${id}: ${msg}`;
    console || this.shouldConsoleProfiler ? this.console(fullMsg) : this[level](fullMsg);
  }

  registerOnBeforeExitFn(fn: Function) {
    this.onBeforeExitFns.push(fn);
  }

  async runOnBeforeExitFns() {
    return pMapSeries(this.onBeforeExitFns, (fn) => fn());
  }

  async exitAfterFlush(code = 0, commandName: string, cliOutput = '') {
    await Analytics.sendData();
    const isSuccess = code === 0;
    const level = isSuccess ? 'info' : 'error';
    if (cliOutput) {
      this.logger.info(`[+] CLI-OUTPUT: ${cliOutput}`);
    }
    const msg = isSuccess
      ? `[*] the command "${commandName}" has been completed successfully`
      : `[*] the command "${commandName}" has been terminated with an error code ${code}`;
    // this should have been helpful to not miss any log message when using `sync: false` in the
    // Pino opts, but sadly, it doesn't help.
    // const finalLogger = pino.final(pinoLogger);
    // finalLogger[level](msg);
    this.logger[level](msg);
    this.writeCommandHistoryEnd(code);
    await this.runOnBeforeExitFns();
    if (!this.isDaemon) process.exit(code);
  }

  private commandHistoryMsgPrefix() {
    return `${new Date().toISOString()} ${process.pid} ${process.argv.slice(2).join(' ')}`;
  }

  writeCommandHistoryStart() {
    const str = `${this.commandHistoryMsgPrefix()}, started`;
    this.writeToCommandHistory(str);
  }

  private writeCommandHistoryEnd(code: number) {
    const endStr = code === 0 ? 'succeeded' : 'failed';
    const str = `${this.commandHistoryMsgPrefix()}, ${endStr}`;
    this.writeToCommandHistory(str);
  }

  /**
   * keep this method sync. for some reason, if it's promise, the exit-code is zero when Jest/Mocha tests fail.
   */
  private writeToCommandHistory(str: string) {
    if (!this.commandHistoryBasePath) return;
    try {
      fs.appendFileSync(path.join(this.commandHistoryBasePath, commandHistoryFile), `${str}\n`);
    } catch {
      // never mind
    }
  }

  debugAndAddBreadCrumb(
    category: string,
    message: string,
    data?: Record<string, any>,
    extraData?: Record<string, any>
  ) {
    this.addToLoggerAndToBreadCrumb('debug', category, message, data, extraData);
  }

  warnAndAddBreadCrumb(category: string, message: string, data?: Record<string, any>, extraData?: Record<string, any>) {
    this.addToLoggerAndToBreadCrumb('warn', category, message, data, extraData);
  }

  errorAndAddBreadCrumb(
    category: string,
    message: string,
    data?: Record<string, any>,
    extraData?: Record<string, any>
  ) {
    this.addToLoggerAndToBreadCrumb('error', category, message, data, extraData);
  }

  private addToLoggerAndToBreadCrumb(
    level: string,
    category: string,
    message: string,
    data?: Record<string, any>,
    extraData?: Record<string, any> | null | undefined
  ) {
    if (!category) throw new TypeError('addToLoggerAndToBreadCrumb, category is missing');
    if (!message) throw new TypeError('addToLoggerAndToBreadCrumb, message is missing');
    const messageWithData = data ? format(message, data) : message;
    this.logger[level](`${category}, ${messageWithData}`, extraData);
    addBreadCrumb(category, message, data, extraData);
  }

  switchToConsoleLogger(level?: Level) {
    this.logger = pinoLoggerConsole;
    this.logger.level = level || DEFAULT_LEVEL;
  }

  switchToSSELogger(level?: Level) {
    this.logger = pinoSSELogger;
    this.logger.level = level || DEFAULT_LEVEL;
  }

  switchToLogger(logger: PinoLogger, level?: Level) {
    this.logger = logger;
    this.logger.level = level || DEFAULT_LEVEL;
  }
}

const logger = new BitLogger(pinoLogger);

export const printWarning = (msg: string) => {
  const cfgNoWarnings = getConfig(CFG_NO_WARNINGS);
  if (cfgNoWarnings !== 'true') {
    // eslint-disable-next-line no-console
    console.log(chalk.yellow(`Warning: ${msg}`));
  }
};

function addBreadCrumb(category: string, message: string, data: Record<string, any> = {}, extraData) {
  const hashedData = {};
  Object.keys(data).forEach((key) => (hashedData[key] = Analytics.hashData(data[key])));
  const messageWithHashedData = format(message, hashedData);
  extraData = extraData instanceof Error ? serializeError(extraData) : extraData;
  Analytics.addBreadCrumb(category, messageWithHashedData, extraData);
}

function determineWritingLogToScreen() {
  /**
   * prefix BIT_LOG to the command, provides the ability to log into the console.
   * two options are available here:
   * 1) use the level. e.g. `BIT_LOG=error bit import`.
   * 2) use the message prefix, e.g. `BIT_LOG=ssh bit import`.
   * 3) use multiple message prefixes, e.g. `BIT_LOG=ssh,env bit import`.
   */
  if (process.env.BIT_LOG) {
    writeLogToScreen(process.env.BIT_LOG);
    return;
  }

  if (process.argv.includes(`--log=profile`)) {
    logger.shouldConsoleProfiler = true;
  }
  const level = getLevelFromArgv(process.argv);
  if (level) {
    logger.switchToConsoleLogger(level);
  }
}

determineWritingLogToScreen();

/**
 * more common scenario is when the user enters `--log` flag. It can be just "--log", which defaults to info.
 * or it can have a level: `--log=error` or `--log error`: both syntaxes are supported
 */
export function getLevelFromArgv(argv: string[]): Level | undefined {
  let foundLevel: Level | undefined;
  if (argv.includes('--log')) {
    const found = process.argv.find((arg) => LEVELS.includes(arg)) as Level | undefined;
    return found || DEFAULT_LEVEL;
  }
  LEVELS.forEach((level) => {
    if (argv.includes(`--log=${level}`)) {
      foundLevel = level as Level;
    }
  });
  return foundLevel;
}

function getLogLevel(): Level {
  const defaultLevel = 'debug';
  const level = getConfig(CFG_LOG_LEVEL) || defaultLevel;
  if (isLevel(level)) return level;
  const levelsStr = LEVELS.join(', ');
  // eslint-disable-next-line no-console
  console.error(
    `fatal: level "${level}" coming from ${CFG_LOG_LEVEL} configuration is invalid. permitted levels are: ${levelsStr}`
  );
  return defaultLevel;
}

function isLevel(maybeLevel: Level | string): maybeLevel is Level {
  return LEVELS.includes(maybeLevel);
}

export function writeLogToScreen(levelOrPrefix = '') {
  if (isLevel(levelOrPrefix)) {
    logger.switchToConsoleLogger(levelOrPrefix);
  }
  if (levelOrPrefix === 'profile') {
    logger.shouldConsoleProfiler = true;
  }
}

export default logger;
