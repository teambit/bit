import logger, { shouldDisableLoader } from '@teambit/legacy/dist/logger/logger';
import { CLIArgs, Command, Flags } from '@teambit/legacy/dist/cli/command';
import { loader } from '@teambit/legacy.loader';
import { handleErrorAndExit } from './handle-errors';
import { TOKEN_FLAG_NAME } from '@teambit/legacy/dist/constants';
import globalFlags from '@teambit/legacy/dist/cli/global-flags';
import { Analytics } from '@teambit/legacy.analytics';
import { OnCommandStartSlot } from './cli.main.runtime';
import pMapSeries from 'p-map-series';

type CommandResult = { data: any; exitCode: number };

export class CommandRunner {
  private commandName: string;
  constructor(
    private command: Command,
    private args: CLIArgs,
    private flags: Flags,
    private onCommandStartSlot: OnCommandStartSlot
  ) {
    this.commandName = parseCommandName(this.command.name);
  }

  /**
   * run command using one of the handler, "json"/"report"/"render". once done, exit the process.
   */
  async runCommand(shouldReturnResult = false): Promise<void | CommandResult> {
    try {
      this.bootstrapCommand();
      await this.invokeOnCommandStart();
      this.determineConsoleWritingDuringCommand();
      if (this.flags.json) {
        return await this.runJsonHandler(shouldReturnResult);
      }
      if (this.command.report) {
        return await this.runReportHandler(shouldReturnResult);
      }
      if (this.command.wait) {
        return await this.runWaitHandler();
      }
    } catch (err: any) {
      if (shouldReturnResult) throw err;
      return handleErrorAndExit(err, this.commandName);
    }

    throw new Error(`command "${this.commandName}" doesn't implement "render" nor "report" nor "wait" methods`);
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

  private async invokeOnCommandStart() {
    const funcs = this.onCommandStartSlot.values();
    await pMapSeries(funcs, (onCommandStart) => onCommandStart(this.commandName, this.args, this.flags));
  }

  /**
   * this works for both, Harmony commands and Legacy commands (the legacy-command-adapter
   * implements json() method)
   */
  private async runJsonHandler(shouldReturnResult = false): Promise<CommandResult | undefined> {
    if (!this.flags.json) return undefined;
    if (!this.command.json) throw new Error(`command "${this.commandName}" doesn't implement "json" method`);
    const result = await this.command.json(this.args, this.flags);
    const code = result.code || 0;
    const data = result.data || result;
    if (shouldReturnResult) return { data, exitCode: code };
    const isJsonStream = Boolean(this.flags.stream);
    if (isJsonStream) data.end = true;
    const jsonStr = isJsonStream ? `${JSON.stringify(data)}\n` : JSON.stringify(data, null, 2);
    await this.writeAndExit(jsonStr, code);
  }

  private async runReportHandler(shouldReturnResult = false): Promise<CommandResult | undefined> {
    if (!this.command.report) throw new Error('runReportHandler expects command.report to be implemented');
    const result = await this.command.report(this.args, this.flags);
    loader.off();
    const data = typeof result === 'string' ? result : result.data;
    const exitCode = typeof result === 'string' ? 0 : result.code;
    if (shouldReturnResult) return { data, exitCode };
    await this.writeAndExit(`${data}\n`, exitCode);
  }

  private async runWaitHandler() {
    if (!this.command.wait) throw new Error('runReportHandler expects command.wait to be implemented');
    await this.command.wait(this.args, this.flags);
  }

  /**
   * the loader and logger.console write output to the console during the command execution.
   * for internals commands, such as, _put, _fetch, the command.loader = false.
   */
  private determineConsoleWritingDuringCommand() {
    if (this.command.loader && !this.flags.json && !this.flags['get-yargs-completions'] && !shouldDisableLoader) {
      loader.on();
      loader.start(`running command "${this.commandName}"...`);
      logger.shouldWriteToConsole = true;
    } else {
      loader.off();
      logger.shouldWriteToConsole = false;
    }
  }

  private async writeAndExit(data: string, exitCode: number) {
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    return process.stdout.write(data, async () => logger.exitAfterFlush(exitCode, this.commandName, data));
  }
}

export function parseCommandName(commandName: string): string {
  if (!commandName) return '';
  return commandName.split(' ')[0];
}
