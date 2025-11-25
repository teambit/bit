import prettifier from 'pino-pretty';
import type { PrettyOptions } from 'pino-pretty';
import type { Logger as PinoLogger, LoggerOptions } from 'pino';
import pino from 'pino';
import { DEBUG_LOG } from '@teambit/legacy.constants';
import { Writable } from 'stream';
import { sendEventsToClients } from '@teambit/harmony.modules.send-server-sent-events';

export type PinoLoggerResult = {
  pinoLogger: PinoLogger;
  pinoLoggerConsole: PinoLogger;
  pinoSSELogger: PinoLogger;
};

export function getPinoLogger(logLevel: string, jsonFormat: string, useWorkers = false): PinoLoggerResult {
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
    ignore: 'hostname,pid,level,severity',
  };

  if (useWorkers) {
    return getPinoLoggerWithWorkers(jsonFormat, opts, prettyPrint, prettyPrintConsole);
  }
  return getPinoLoggerWithoutWorkers(jsonFormat, opts, prettyPrint, prettyPrintConsole);
}

export function getPinoLoggerWithWorkers(
  jsonFormat: string,
  loggerOptions: LoggerOptions,
  prettyOptions: PrettyOptions,
  prettyOptionsConsole: PrettyOptions
): PinoLoggerResult {
  const transportFile = {
    target: jsonFormat ? 'pino/file' : 'pino-pretty',
    options: { ...(!jsonFormat ? prettyOptions : {}), destination: DEBUG_LOG, sync: true, mkdir: true }, // use 2 for stderr
  };

  const transportConsole = {
    // target: 'pino-pretty',
    target: jsonFormat ? 'pino/file' : 'pino-pretty',
    options: { ...(!jsonFormat ? prettyOptionsConsole : {}), destination: 1, sync: true, mkdir: false }, // use 2 for stderr
  };

  const pinoFileOpts = {
    ...loggerOptions,
    transport: transportFile,
  };

  const pinoConsoleOpts = {
    ...loggerOptions,
    transport: transportConsole,
    // transport: jsonFormat
    // ? { targets: [{...transportFile, level: logLevel}, {...transportConsole, level: logLevel}] }
    // ? { targets: [transportFile, transportConsole] }
    // : transportConsole,
  };

  const pinoLogger = pino(pinoFileOpts);
  const pinoLoggerConsole = pino(pinoConsoleOpts);
  const pinoSSELogger = pino(pinoConsoleOpts);

  return { pinoLogger, pinoLoggerConsole, pinoSSELogger };
}

export class ServerSendOutStream extends Writable {
  _write(chunk, enc, next) {
    sendEventsToClients('onLogWritten', { message: chunk.toString() });
    next();
  }
}

export function getPinoLoggerWithoutWorkers(
  jsonFormat: string,
  loggerOptions: LoggerOptions,
  prettyOptions: PrettyOptions,
  prettyOptionsConsole: PrettyOptions
): PinoLoggerResult {
  const dest = pino.destination({
    dest: DEBUG_LOG, // omit for stdout
    sync: true, // no choice here :( otherwise, it looses data especially when an error is thrown (although pino.final is used to flush)
  });

  const prettyStream = prettifier({
    ...prettyOptions,
    destination: dest,
    sync: true,
  });

  const fileStream = jsonFormat ? dest : prettyStream;

  const destConsole = pino.destination({
    sync: true, // no choice here :( otherwise, it looses data especially when an error is thrown (although pino.final is used to flush)
  });

  const prettyConsoleStream = prettifier({
    ...prettyOptionsConsole,
    // it's important to use process.stdout here (and not "1"), otherwise, for cli-server when monkey patching the stdout it won't work
    destination: process.stdout,
    sync: true,
  });

  const prettySSEStream = prettifier({
    ...prettyOptionsConsole,
    destination: new ServerSendOutStream(),
    sync: true,
  });

  const consoleStream = jsonFormat ? destConsole : prettyConsoleStream;

  const pinoLogger = pino(loggerOptions, fileStream);

  const pinoLoggerConsole = pino(loggerOptions, consoleStream);

  const prettySSELogger = pino(loggerOptions, prettySSEStream);

  return { pinoLogger, pinoLoggerConsole, pinoSSELogger: prettySSELogger };
}
