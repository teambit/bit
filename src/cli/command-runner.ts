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

  async runCommand() {
    await this.runMigrateIfNeeded();
    try {
      await this.runJsonHandler();
      await this.runRenderHandler();
      return this.runReportHandler();
    } catch (err) {
      logger.error(
        `got an error from command ${this.command.name}: ${err}. Error serialized: ${JSON.stringify(
          err,
          Object.getOwnPropertyNames(err)
        )}`
      );
      loader.off();
      const errorHandled = defaultHandleError(err);
      if (this.command.private) return serializeErrAndExit(err, this.command.name);
      // uncomment this to see the entire error object on the console
      if (!this.command.private && errorHandled) return logErrAndExit(errorHandled, this.command.name);
      return logErrAndExit(err, this.command.name);
    }
  }

  private async runJsonHandler() {
    if (!this.flags.json) return null;
    if (!this.command.json) throw new Error(`command "${this.command.name}" doesn't implement "json" method`);
    const result = await this.command.json(this.args, this.flags);
    loader.off();
    const code = result.code || 0;
    const data = result.data || result;
    return process.stdout.write(JSON.stringify(data, null, 2), () => logger.exitAfterFlush(code, this.command.name));
  }

  private async runRenderHandler() {
    if (!this.command.render) return null;
    if (this.command.report && !process.stdout.isTTY) return null; // will be handled by "report"
    const result = await this.command.render(this.args, this.flags);
    loader.off();
    const { waitUntilExit } = render(result);
    await waitUntilExit();
    return logger.exitAfterFlush(result.props.code, this.command.name);
  }

  private async runReportHandler() {
    if (!this.command.report) {
      throw new Error(`command "${this.command.name}" doesn't implement "render" nor "report" methods`);
    }
    if (this.command.render && !process.stdout.isTTY) return null;
    const result = await this.command.report(this.args, this.flags);
    loader.off();
    return process.stdout.write(`${result.data}\n`, () => logger.exitAfterFlush(result.code, this.command.name));
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
  process.stderr.write(packCommand(buildCommandMessage(serializeError(err), undefined, false), false, false));
  const code = err.code && isNumeric(err.code) ? err.code : 1;
  return logger.exitAfterFlush(code, commandName);
}

export function logErrAndExit(msg: Error | string, commandName: string) {
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  if (msg.code) throw msg;
  console.error(msg); // eslint-disable-line
  logger.exitAfterFlush(1, commandName);
}
