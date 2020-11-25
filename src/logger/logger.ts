import chalk from 'chalk';
import * as path from 'path';
import { serializeError } from 'serialize-error';
import format from 'string-format';
import winston, { LogEntry } from 'winston';
import pino, { Logger as PinoLogger, Level, LoggerOptions } from 'pino';
import yn from 'yn';
import { Analytics } from '../analytics/analytics';
import { getSync } from '../api/consumer/lib/global-config';
import defaultHandleError from '../cli/default-error-handler';
import { CFG_LOG_JSON_FORMAT, CFG_LOG_LEVEL, CFG_NO_WARNINGS, DEBUG_LOG, GLOBAL_LOGS } from '../constants';

export { Level as LoggerLevel };

const jsonFormat = yn(getSync(CFG_LOG_JSON_FORMAT), { default: false });

const logLevel = getSync(CFG_LOG_LEVEL) || 'debug';

export const baseFileTransportOpts = {
  filename: DEBUG_LOG,
  format: jsonFormat ? winston.format.combine(winston.format.timestamp(), winston.format.json()) : getFormat(),
  level: logLevel,
  maxsize: 10 * 1024 * 1024, // 10MB
  maxFiles: 10,
  // If true, log files will be rolled based on maxsize and maxfiles, but in ascending order.
  // The filename will always have the most recent log lines. The larger the appended number, the older the log file
  tailable: true,
};

function getMetadata(info) {
  if (!Object.keys(info.metadata).length) return '';
  if ((info.level === 'error' || info.level === '\u001b[31merror\u001b[39m') && info.metadata.stack) {
    // this is probably an instance of Error, show the stack nicely and not serialized.
    return `\n${info.metadata.stack}`;
  }
  try {
    return JSON.stringify(info.metadata, null, 2);
  } catch (err) {
    return `logger error: logging failed to stringify the metadata Json. (error: ${err.message})`;
  }
}

export function getFormat() {
  return winston.format.combine(
    winston.format.metadata(),
    winston.format.colorize(),
    winston.format.timestamp(),
    winston.format.splat(), // does nothing?
    winston.format.errors({ stack: true }),
    winston.format.prettyPrint({ depth: 3, colorize: true }), // does nothing?
    winston.format.printf((info) => `${info.timestamp} ${info.level}: ${info.message} ${getMetadata(info)}`)
  );
}

/**
 * leave the Winston for now to get the file-rotation we're missing from Pino and the "profile"
 * functionality.
 * also, this should start BEFORE Pino. otherwise, Pino starts creating the debug.log file first
 * and it throws an error if the file doesn't exists on Docker/CI.
 */
const winstonLogger = winston.createLogger({
  transports: [new winston.transports.File(baseFileTransportOpts)],
  exitOnError: false,
});

const dest = pino.destination({
  dest: DEBUG_LOG, // omit for stdout
  sync: true, // no choice here :( otherwise, it looses data especially when an error is thrown (although pino.final is used to flush)
});

// Store the extensionsLoggers to prevent create more than one logger for the same extension
// in case the extension developer use api.logger more than once
const extensionsLoggers = new Map();

const prettyPrint = {
  colorize: true,
  translateTime: 'SYS:standard',
  ignore: 'hostname',
};

const prettyPrintConsole = {
  colorize: true,
  ignore: 'hostname,pid,time,level',
};

/**
 * by default, Pino expects the first parameter to be an object and the second to be the message
 * string. since all current log messages were written using Winston, they're flipped - message
 * first and then other data.
 * this hook flips the first two arguments, so then it's fine to have the message as the first arg.
 */
const hooks = {
  logMethod(inputArgs, method) {
    if (inputArgs.length >= 2 && inputArgs[1] !== undefined) {
      const arg1 = inputArgs.shift();
      const arg2 = inputArgs.shift();
      return method.apply(this, [arg2, arg1]);
    }
    return method.apply(this, inputArgs);
  },
};

const opts: LoggerOptions = {
  hooks,
};

if (!jsonFormat) {
  opts.prettyPrint = prettyPrint;
}

const pinoLogger: PinoLogger = pino(opts, dest);
pinoLogger.level = logLevel;

const pinoLoggerConsole = pino({ hooks, prettyPrint: prettyPrintConsole });
pinoLoggerConsole.level = logLevel;

// eslint-disable-next-line @typescript-eslint/interface-name-prefix
export interface IBitLogger {
  trace(message: string, ...meta: any[]): void;

  debug(message: string, ...meta: any[]): void;

  warn(message: string, ...meta: any[]): void;

  info(message: string, ...meta: any[]): void;

  error(message: string, ...meta: any[]): void;

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
  /**
   * being set on command-registrar, once the flags are parsed. here, it's a workaround to have
   * it set before the command-registrar is loaded. at this stage we don't know for sure the "-j"
   * is actually "json". that's why this variable is overridden once the command-registrar is up.
   */
  shouldWriteToConsole = !process.argv.includes('--json') && !process.argv.includes('-j');

  constructor(logger: PinoLogger) {
    this.logger = logger;
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

  profile(id: string, meta?: LogEntry) {
    winstonLogger.profile(id, meta);
  }

  async exitAfterFlush(code = 0, commandName: string) {
    await Analytics.sendData();
    let level;
    let msg;
    if (code === 0) {
      level = 'info';
      msg = `[*] the command ${commandName} has been completed successfully`;
    } else {
      level = 'error';
      msg = `[*] the command ${commandName} has been terminated with an error code ${code}`;
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

/**
 * Create a logger instance for extension
 * The extension name will be added as label so it will appear in the begining of each log line
 * The logger is cached for each extension so there is no problem to use getLogger few times for the same extension
 * @param {string} extensionName
 */
export const createExtensionLogger = (extensionName: string) => {
  // Getting logger from cache
  const existingLogger = extensionsLoggers.get(extensionName);

  if (existingLogger) {
    return existingLogger;
  }
  const extensionFileTransportOpts = Object.assign({}, baseFileTransportOpts, {
    filename: path.join(GLOBAL_LOGS, 'extensions.log'),
    label: extensionName,
  });
  const extLogger = winston.createLogger({
    transports: [new winston.transports.File(extensionFileTransportOpts)],
    exceptionHandlers: [new winston.transports.File(extensionFileTransportOpts)],
    exitOnError: false,
  });
  extensionsLoggers.set(extensionName, extLogger);
  return extLogger;
};

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

function isLevel(maybeLevel: Level | string): maybeLevel is Level {
  const levels = ['fatal', 'error', 'warn', 'info', 'debug', 'trace'];
  return levels.includes(maybeLevel);
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

export default logger;
