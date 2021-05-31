import { render } from 'ink';
import { serializeError } from 'serialize-error';
import { migrate } from '../api/consumer';
import logger, { LoggerLevel } from '../logger/logger';
import { buildCommandMessage, isNumeric, packCommand } from '../utils';
import { CLIArgs, Command, Flags } from './command';
import { parseCommandName } from './command-registry';
import defaultHandleError from './default-error-handler';
import loader from './loader';

export class CommandRunner {
  private commandName: string;
  constructor(private command: Command, private args: CLIArgs, private flags: Flags) {
    this.commandName = parseCommandName(this.command.name);
  }

  /**
   * run command using one of the handler, "json"/"report"/"render". once done, exit the process.
   */
  async runCommand() {
    try {
      await this.runMigrateIfNeeded();
      this.determineConsoleWritingDuringCommand();
      if (this.flags.json) {
        return await this.runJsonHandler();
      }
      if (this.shouldRunRender()) {
        return await this.runRenderHandler();
      }
      if (this.command.report) {
        return await this.runReportHandler();
      }
    } catch (err) {
      return handleErrorAndExit(err, this.commandName, this.command.internal);
    }

    throw new Error(`command "${this.commandName}" doesn't implement "render" nor "report" methods`);
  }

  /**
   * when both "render" and "report" were implemented, check whether it's a terminal.
   * if it's a terminal, use "render", if not, use "report" because "report" is just a string
   */
  private shouldRunRender() {
    const isTerminal = process.stdout.isTTY;
    if (this.command.report && !isTerminal) {
      return false;
    }
    return Boolean(this.command.render);
  }

  /**
   * this works for both, Harmony commands and Legacy commands (the legacy-command-adapter
   * implements json() method)
   */
  private async runJsonHandler() {
    if (!this.flags.json) return null;
    if (!this.command.json) throw new Error(`command "${this.commandName}" doesn't implement "json" method`);
    const result = await this.command.json(this.args, this.flags);
    const code = result.code || 0;
    const data = result.data || result;
    return this.writeAndExit(JSON.stringify(data, null, 2), code);
  }

  private async runRenderHandler() {
    if (!this.command.render) throw new Error('runRenderHandler expects command.render to be implemented');
    const result = await this.command.render(this.args, this.flags);
    loader.off();
    // @ts-ignore
    // eslint-disable-next-line no-prototype-builtins
    const data = result.data && result.hasOwnProperty('code') ? result.data : result;
    // @ts-ignore
    // eslint-disable-next-line no-prototype-builtins
    const code = result.data && result.hasOwnProperty('code') ? result.code : 0;
    const { waitUntilExit } = render(data);
    await waitUntilExit();
    return logger.exitAfterFlush(code, this.commandName);
  }

  private async runReportHandler() {
    if (!this.command.report) throw new Error('runReportHandler expects command.report to be implemented');
    const result = await this.command.report(this.args, this.flags);
    loader.off();
    const data = typeof result === 'string' ? result : result.data;
    const exitCode = typeof result === 'string' ? 0 : result.code;
    return this.writeAndExit(`${data}\n`, exitCode);
  }

  /**
   * the loader and logger.console write output to the console during the command execution.
   * for internals commands, such as, _put, _fetch, the command.loader = false.
   */
  private determineConsoleWritingDuringCommand() {
    if (this.command.loader && !this.flags.json) {
      loader.on();
      loader.start(`running command "${this.commandName}"...`);
      logger.shouldWriteToConsole = true;
    } else {
      loader.off();
      logger.shouldWriteToConsole = false;
    }
    if (this.flags.log) {
      const logValue = typeof this.flags.log === 'string' ? this.flags.log : undefined;
      logger.switchToConsoleLogger(logValue as LoggerLevel);
    }
  }

  private async writeAndExit(data: string, exitCode: number) {
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    return process.stdout.write(data, async () => logger.exitAfterFlush(exitCode, this.commandName));
  }

  private async runMigrateIfNeeded(): Promise<any> {
    // @ts-ignore LegacyCommandAdapter has .migration
    if (this.command.migration) {
      logger.debug('Checking if a migration is needed');
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      return migrate(null, false);
    }
    return null;
  }
}

function serializeErrAndExit(err, commandName: string) {
  const data = packCommand(buildCommandMessage(serializeError(err), undefined, false), false, false);
  const code = err.code && isNumeric(err.code) ? err.code : 1;
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  return process.stderr.write(data, () => logger.exitAfterFlush(code, commandName));
}

export async function handleErrorAndExit(err: Error, commandName: string, shouldSerialize = false): Promise<void> {
  try {
    loader.off();
    logger.error(`got an error from command ${commandName}: ${err}`);
    logger.error(err.stack || '<no error stack was found>');
    const { message, error } = defaultHandleError(err);
    if (shouldSerialize) serializeErrAndExit(error, commandName);
    else await logErrAndExit(message, commandName);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('failed to log the error properly, failure error', e);
    // eslint-disable-next-line no-console
    console.error('failed to log the error properly, original error', err);
    process.exit(1);
  }
}

export async function handleUnhandledRejection(err: Error | null | undefined | {}) {
  // eslint-disable-next-line no-console
  console.error('** unhandled rejection found, please make sure the promise is resolved/rejected correctly! **');
  if (err instanceof Error) {
    return handleErrorAndExit(err, process.argv[2]);
  }
  console.error(err); // eslint-disable-line
  return handleErrorAndExit(new Error(`unhandledRejections found. err ${err}`), process.argv[2]);
}

export async function logErrAndExit(err: Error | string, commandName: string) {
  if (!err) throw new Error(`logErrAndExit expects to get either an Error or a string, got nothing`);
  console.error(err); // eslint-disable-line
  await logger.exitAfterFlush(1, commandName);
}
