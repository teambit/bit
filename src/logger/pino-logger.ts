import pino, { Logger as PinoLogger, LoggerOptions } from 'pino';
import { DEBUG_LOG } from '../constants';

export function getPinoLogger(
  logLevel: string,
  jsonFormat: string
): { pinoLogger: PinoLogger; pinoLoggerConsole: PinoLogger } {
  // https://cloud.google.com/logging/docs/reference/v2/rest/v2/LogEntry#logseverity
  const PinoLevelToSeverityLookup = {
    trace: 'DEBUG',
    debug: 'DEBUG',
    info: 'INFO',
    warn: 'WARNING',
    error: 'ERROR',
    fatal: 'CRITICAL',
  };

  const formatters = {
    level(label: string, number: number) {
      return {
        severity: PinoLevelToSeverityLookup[label] || PinoLevelToSeverityLookup.info,
        level: number,
      };
    },
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
    formatters,
    level: logLevel,
  };

  const prettyPrint = {
    colorize: true,
    translateTime: 'SYS:standard',
    ignore: 'hostname,severity',
  };

  const prettyPrintConsole = {
    colorize: true,
    ignore: 'hostname,pid,time,level,severity',
  };

  const transportFile = {
    target: jsonFormat ? 'pino/file' : 'pino-pretty',
    options: { ...(!jsonFormat ? prettyPrint : {}), destination: DEBUG_LOG, sync: true, mkdir: true }, // use 2 for stderr
  };

  const transportConsole = {
    // target: 'pino-pretty',
    target: jsonFormat ? 'pino/file' : 'pino-pretty',
    options: { ...(!jsonFormat ? prettyPrintConsole : {}), destination: 1, sync: true, mkdir: false }, // use 2 for stderr
  };

  const pinoFileOpts = {
    ...opts,
    transport: transportFile,
  };

  const pinoConsoleOpts = {
    ...opts,
    transport: transportConsole,
    // transport: jsonFormat
    // ? { targets: [{...transportFile, level: logLevel}, {...transportConsole, level: logLevel}] }
    // ? { targets: [transportFile, transportConsole] }
    // : transportConsole,
  };

  const pinoLogger = pino(pinoFileOpts);
  const pinoLoggerConsole = pino(pinoConsoleOpts);

  return { pinoLogger, pinoLoggerConsole };
}
