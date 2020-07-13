import chalk from 'chalk';
import yn from 'yn';
import { serializeError } from 'serialize-error';
import format from 'string-format';
// @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
import winston, { Logger } from 'winston';
import * as path from 'path';
import { GLOBAL_LOGS, DEBUG_LOG, CFG_LOG_JSON_FORMAT, CFG_NO_WARNINGS, CFG_LOG_LEVEL } from '../constants';
import { Analytics } from '../analytics/analytics';
import { getSync } from '../api/consumer/lib/global-config';
import defaultHandleError from '../cli/default-error-handler';

// Store the extensionsLoggers to prevent create more than one logger for the same extension
// in case the extension developer use api.logger more than once
const extensionsLoggers = new Map();

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
  tailable: true
};

export function getFormat() {
  return winston.format.combine(
    winston.format.metadata(),
    winston.format.colorize(),
    winston.format.timestamp(),
    winston.format.splat(), // does nothing?
    winston.format.errors({ stack: true }),
    winston.format.prettyPrint({ depth: 3, colorize: true }), // does nothing?
    winston.format.printf(info => customPrint(info))
  );

  function customPrint(info) {
    const getMetadata = () => {
      if (!Object.keys(info.metadata).length) return '';
      try {
        return JSON.stringify(info.metadata, null, 2);
      } catch (err) {
        return `logger error: logging failed to stringify the metadata Json. (error: ${err.message})`;
      }
    };
    return `${info.timestamp} ${info.level}: ${info.message} ${getMetadata()}`;
  }
}

const exceptionsFileTransportOpts = Object.assign({}, baseFileTransportOpts, {
  filename: path.join(GLOBAL_LOGS, 'exceptions.log')
});

class BitLogger {
  logger: Logger;
  /**
   * being set on command-registrar, once the flags are parsed. here, it's a workaround to have
   * it set before the command-registrar is loaded. at this stage we don't know for sure the "-j"
   * is actually "json". that's why this variable is overridden once the command-registrar is up.
   */
  shouldWriteToConsole = !process.argv.includes('--json') && !process.argv.includes('-j');

  constructor(logger: Logger) {
    this.logger = logger;
    logger.on('error', err => {
      // eslint-disable-next-line no-console
      console.log('got an error from the logger', err);
    });
  }

  silly(...args: any[]) {
    // @ts-ignore
    this.logger.silly(...args);
  }

  debug(...args: any[]) {
    // @ts-ignore
    this.logger.debug(...args);
  }

  warn(...args: any[]) {
    // @ts-ignore
    this.logger.warn(...args);
  }

  info(...args: any[]) {
    // @ts-ignore
    this.logger.info(...args);
  }

  error(...args: any[]) {
    // @ts-ignore
    this.logger.error(...args);
  }

  console(msg: string | Error, level = 'info', color?: string) {
    let actualMessage = msg;
    if (msg instanceof Error) {
      const { message } = defaultHandleError(msg);
      actualMessage = message;
    }
    if (!this.shouldWriteToConsole) {
      this[level](actualMessage);
      return;
    }
    if (color) {
      try {
        // @ts-ignore
        actualMessage = chalk.keyword(color)(actualMessage);
      } catch (e) {
        this.silly('a wrong color provided to logger.console method');
      }
    }
    winston.loggers.get('consoleOnly')[level](actualMessage);
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
    this.logger[level](msg);
    await waitForLogger();
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

  addToLoggerAndToBreadCrumb(
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
}

const winstonLogger = winston.createLogger({
  transports: [new winston.transports.File(baseFileTransportOpts)],
  exceptionHandlers: [new winston.transports.File(exceptionsFileTransportOpts)],
  exitOnError: false
});

const logger = new BitLogger(winstonLogger);

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
    label: extensionName
  });
  const extLogger = winston.createLogger({
    transports: [new winston.transports.File(extensionFileTransportOpts)],
    exceptionHandlers: [new winston.transports.File(extensionFileTransportOpts)],
    exitOnError: false
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

/**
 * @credit dpraul from https://github.com/winstonjs/winston/issues/1250
 * it solves an issue when exiting the code explicitly and the log file is not written
 *
 * there are still two issues though.
 * 1. sometimes, an error is thrown "write after end". can be reproduced by running the
 * performance e2e-test on 3,000 components, 100 dependencies, on export.
 * 2. sometimes, it doesn't write all messages to the log. can be reproduced by the same method as
 * above, but even with 300 components and 10 dependencies.
 *
 * if you try to fix these issues, please make sure that after your fix, the following are working:
 * 1. the two cases should work.
 * 2. when error is thrown, it exists successfully with the correct error-code. (the standard
 * e2e-tests cover this multiple times).
 * 3. the ssh is working. (not covered by the e2e-tests). run a simple export to an ssh and make
 * sure it doesn't hang.
 *
 * for the record, the following was working for #1 and #2 but not for #3.
 * ```
 * const loggerDone = new Promise(resolve => logger.logger.on(code ? 'finish' : 'close', resolve));
 * if (code) logger.logger.end();
 * ```
 */
async function waitForLogger() {
  const loggerDone = new Promise(resolve => logger.logger.on('finish', resolve));
  logger.logger.end();
  return loggerDone;
}

function addBreadCrumb(category: string, message: string, data: Record<string, any> = {}, extraData) {
  const hashedData = {};
  Object.keys(data).forEach(key => (hashedData[key] = Analytics.hashData(data[key])));
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
  const levels = ['error', 'warn', 'info', 'verbose', 'debug', 'silly'];
  const isLevel = levels.includes(process.env.BIT_LOG);
  const prefixes = process.env.BIT_LOG.split(',');
  const filterPrefix = winston.format(info => {
    if (isLevel) return info;
    if (prefixes.some(prefix => info.message.startsWith(prefix))) return info;
    return false;
  });
  logger.logger.add(
    new winston.transports.Console({
      level: isLevel ? process.env.BIT_LOG : 'silly',
      format: winston.format.combine(
        filterPrefix(),
        winston.format.printf(info => info.message)
      )
    })
  );
}

/**
 * useful when in the middle of the process, Bit needs to print to the console.
 * it's better than using `console.log` because, this way, it's possible to turn it on/off
 */
winston.loggers.add('consoleOnly', {
  format: winston.format.combine(winston.format.printf(info => info.message)),
  transports: [new winston.transports.Console({ level: 'silly' })]
});

export default logger;
