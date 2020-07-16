import { serializeError } from 'serialize-error';
import { render } from 'ink';
import { Command, CLIArgs, Flags } from './command';
import { migrate } from '../api/consumer';
import defaultHandleError from './default-error-handler';
import { isNumeric, buildCommandMessage, packCommand } from '../utils';
import loader from './loader';
import logger from '../logger/logger';

export class CommandRunner {
  constructor(private command: Command, private args: CLIArgs, private flags: Flags) {}

  /**
   * run command using one of the handler, "json"/"report"/"render". once done, exit the process.
   */
  async runCommand() {
    try {
      await this.runMigrateIfNeeded();
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
      return handleErrorAndExit(err, this.command.name, this.command.internal);
    }

    throw new Error(`command "${this.command.name}" doesn't implement "render" nor "report" methods`);
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

  private async runJsonHandler() {
    if (!this.flags.json) return null;
    if (!this.command.json) throw new Error(`command "${this.command.name}" doesn't implement "json" method`);
    const result = await this.command.json(this.args, this.flags);
    loader.off();
    const code = result.code || 0;
    const data = result.data || result;
    return this.writeAndExit(JSON.stringify(data, null, 2), code);
  }

  private async runRenderHandler() {
    if (!this.command.render) throw new Error('runRenderHandler expects command.render to be implemented');
    const result = await this.command.render(this.args, this.flags);
    loader.off();
    const { waitUntilExit } = render(result);
    await waitUntilExit();
    return logger.exitAfterFlush(result.props.code, this.command.name);
  }

  private async runReportHandler() {
    if (!this.command.report) throw new Error('runReportHandler expects command.report to be implemented');
    const result = await this.command.report(this.args, this.flags);
    loader.off();
    const data = typeof result === 'string' ? result : result.data;
    const exitCode = typeof result === 'string' ? 0 : result.code;
    return this.writeAndExit(`${data}\n`, exitCode);
  }

  private writeAndExit(data: string, exitCode: number) {
    return process.stdout.write(data, () => logger.exitAfterFlush(exitCode, this.command.name));
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
  return process.stderr.write(data, () => logger.exitAfterFlush(code, commandName));
}

export function handleErrorAndExit(err: Error, commandName: string, shouldSerialize = false) {
  loader.off();
  logger.error(`got an error from command ${commandName}: ${err}`);
  logger.error(err.stack || '<no error stack was found>');
  const { message, error } = defaultHandleError(err);
  if (shouldSerialize) return serializeErrAndExit(error, commandName);
  return logErrAndExit(message, commandName);
}

export function handleUnhandledRejection(err: Error | null | undefined | {}) {
  // eslint-disable-next-line no-console
  console.error('** unhandled rejection found, please make sure the promise is resolved/rejected correctly! **');
  if (err instanceof Error) {
    return handleErrorAndExit(err, process.argv[2]);
  }
  console.error(err); // eslint-disable-line
  return handleErrorAndExit(new Error(`unhandledRejections found. err ${err}`), process.argv[2]);
}

export function logErrAndExit(err: Error | string, commandName: string) {
  if (!err) throw new Error(`logErrAndExit expects to get either an Error or a string, got nothing`);
  console.error(err); // eslint-disable-line
  logger.exitAfterFlush(1, commandName);
}
