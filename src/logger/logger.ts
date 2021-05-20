/**
 * leave the Winston for now to get the file-rotation we're missing from Pino and the "profile"
 * functionality.
 * also, Winston should start BEFORE Pino. otherwise, Pino starts creating the debug.log file first
 * and it throws an error if the file doesn't exists on Docker/CI.
 */
import chalk from 'chalk';
import { serializeError } from 'serialize-error';
import format from 'string-format';
import { Logger as PinoLogger, Level } from 'pino';
import yn from 'yn';
import { Analytics } from '../analytics/analytics';
import { getSync } from '../api/consumer/lib/global-config';
import defaultHandleError from '../cli/default-error-handler';
import { CFG_LOG_JSON_FORMAT, CFG_LOG_LEVEL, CFG_NO_WARNINGS } from '../constants';
import { getWinstonLogger } from './winston-logger';
import { getPinoLogger } from './pino-logger';
import { Profiler } from './profiler';

export { Level as LoggerLevel };

const jsonFormat =
  yn(getSync(CFG_LOG_JSON_FORMAT), { default: false }) || yn(process.env.JSON_LOGS, { default: false });

const LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace'];

const logLevel = getLogLevel();

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const { winstonLogger, createExtensionLogger } = getWinstonLogger(logLevel, jsonFormat);

const { pinoLogger, pinoLoggerConsole } = getPinoLogger(logLevel, jsonFormat);

export interface IBitLogger {
  trace(message: string, ...meta: any[]): void;

  debug(message: string, ...meta: any[]): void;

  warn(message: string, ...meta: any[]): void;

  info(message: string, ...meta: any[]): void;

  error(message: string, ...meta: any[]): void;

  fatal(message: string, ...meta: any[]): void;

  console(msg: string): void;
}

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
  profiler: Profiler;
  /**
   * being set on command-registrar, once the flags are parsed. here, it's a workaround to have
   * it set before the command-registrar is loaded. at this stage we don't know for sure the "-j"
   * is actually "json". that's why this variable is overridden once the command-registrar is up.
   */
  shouldWriteToConsole = !process.argv.includes('--json') && !process.argv.includes('-j');

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
      const { message } = defaultHandleError(msg);
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
      } catch (e) {
        this.trace('a wrong color provided to logger.console method');
      }
    }
    pinoLoggerConsole[level](messageStr);
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
  profile(id: string, console?: boolean) {
    const msg = this.profiler.profile(id);
    if (!msg) return;
    const fullMsg = `${id}: ${msg}`;
    console ? this.console(fullMsg) : this.info(fullMsg);
  }

  async exitAfterFlush(code = 0, commandName: string) {
    await Analytics.sendData();
    let level;
    let msg;
    if (code === 0) {
      level = 'info';
      msg = `[*] the command "${commandName}" has been completed successfully`;
    } else {
      level = 'error';
      msg = `[*] the command "${commandName}" has been terminated with an error code ${code}`;
    }
    // this should have been helpful to not miss any log message when using `sync: false` in the
    // Pino opts, but sadly, it doesn't help.
    // const finalLogger = pino.final(pinoLogger);
    // finalLogger[level](msg);
    this.logger[level](msg);
    process.exit(code);
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
    this.logger.level = level || 'debug';
  }
}

const logger = new BitLogger(pinoLogger);

export const printWarning = (msg: string) => {
  const cfgNoWarnings = getSync(CFG_NO_WARNINGS);
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

/**
 * prefix BIT_LOG to the command, provides the ability to log into the console.
 * two options are available here:
 * 1) use the level. e.g. `BIT_LOG=error bit import`.
 * 2) use the message prefix, e.g. `BIT_LOG=ssh bit import`.
 * 3) use multiple message prefixes, e.g. `BIT_LOG=ssh,env bit import`.
 */
if (process.env.BIT_LOG) {
  writeLogToScreen(process.env.BIT_LOG);
}

function getLogLevel(): Level {
  const defaultLevel = 'debug';
  const level = getSync(CFG_LOG_LEVEL) || defaultLevel;
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
  // @todo: implement
  // const prefixes = levelOrPrefix.split(',');
  // const filterPrefix = winston.format((info) => {
  //   if (isLevel) return info;
  //   if (prefixes.some((prefix) => info.message.startsWith(prefix))) return info;
  //   return false;
  // });
  // logger.logger.add(
  //   new winston.transports.Console({
  //     level: isLevel ? levelOrPrefix : 'info',
  //     format: winston.format.combine(
  //       filterPrefix(),
  //       winston.format.metadata(),
  //       winston.format.errors({ stack: true }),
  //       winston.format.printf((info) => `${info.message} ${getMetadata(info)}`)
  //     ),
  //   })
  // );
}

export { createExtensionLogger };

export default logger;
