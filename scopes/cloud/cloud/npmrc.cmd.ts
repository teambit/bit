/* eslint-disable max-classes-per-file */
import chalk from 'chalk';
import yesno from 'yesno';
import { Command, CommandOptions, Flags } from '@teambit/cli';
import { CloudMain } from './cloud.main.runtime';

export class NpmrcGenerateCmd implements Command {
  name = 'generate';
  description = 'update npmrc file with scope, registry, and token information from bit.cloud';
  group = 'cloud';
  alias = '';
  options = [['', 'dry-run', 'show the .npmrc file content that will be written']] as CommandOptions;
  skipWorkspace = false;

  private port?: string;

  constructor(private cloud: CloudMain, _port?: number) {
    this.port = _port?.toString();
  }

  async report(_, flags: Flags): Promise<string> {
    this.cloud.logger.clearStatusLine();
    const isLoggedIn = await this.cloud.isLoggedIn();
    if (!isLoggedIn) {
      const loginOk = await yesno({
        question: `You are not logged in.\n\n${chalk.bold('Would you like to login? [yes(y)/no(n)]')}`,
      });
      if (!loginOk) {
        throw new Error('the operation has been canceled');
      }
      await this.cloud.login(this.port);
    }
    const config = await this.cloud.generateNpmrc({ dryRun: flags.dryRun });
    if (flags.dryRun) {
      return chalk.green(`.npmrc file content that will be written:\n${config}`);
    }
    return chalk.green(`.npmrc file has been updated successfully`);
  }

  async json() {
    const config = await this.cloud.generateNpmrc();
    return { config };
  }
}

export class NpmrcCmd implements Command {
  name = 'npmrc [sub-command]';
  description = 'manage npmrc file with scope, registry, and token information from bit.cloud';
  group = 'cloud';
  alias = '';
  options = [];
  loader = true;
  skipWorkspace = true;
  commands: Command[] = [];

  async report([unrecognizedSubcommand]: [string]) {
    return chalk.red(
      `"${unrecognizedSubcommand}" is not a subcommand of "npmrc", please run "bit npmrc --help" to list the subcommands`
    );
  }
}
