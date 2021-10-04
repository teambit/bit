import { render } from 'ink';
import { migrate } from '@teambit/legacy/dist/api/consumer';
import logger, { LoggerLevel } from '@teambit/legacy/dist/logger/logger';
import { CLIArgs, Command, Flags, RenderResult } from '@teambit/legacy/dist/cli/command';
import { parseCommandName } from '@teambit/legacy/dist/cli/command-registry';
import loader from '@teambit/legacy/dist/cli/loader';
import { handleErrorAndExit } from '@teambit/legacy/dist/cli/handle-errors';
import { TOKEN_FLAG_NAME } from '@teambit/legacy/dist/constants';
import globalFlags from '@teambit/legacy/dist/cli/global-flags';
import { Analytics } from '@teambit/legacy/dist/analytics/analytics';

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
      this.bootstrapCommand();
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
    } catch (err: any) {
      return handleErrorAndExit(err, this.commandName, this.command.internal);
    }

    throw new Error(`command "${this.commandName}" doesn't implement "render" nor "report" methods`);
  }

  private bootstrapCommand() {
    Analytics.init(this.commandName, this.flags, this.args);
    logger.info(`[*] started a new command: "${this.commandName}" with the following data:`, {
      args: this.args,
      flags: this.flags,
    });
    const token = this.flags[TOKEN_FLAG_NAME];
    if (token) {
      globalFlags.token = token.toString();
    }
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

    const { data, code } = toRenderResult(result);

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
    if (this.command.loader && !this.flags.json && !this.flags['get-yargs-completions']) {
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

function toRenderResult(obj: RenderResult | React.ReactElement) {
  return isRenderResult(obj) ? obj : { data: obj, code: 0 };
}

function isRenderResult(obj: RenderResult | any): obj is RenderResult {
  // eslint-disable-next-line no-prototype-builtins
  return typeof obj === 'object' && typeof obj.code === 'number' && obj.hasOwnProperty('data');
}
