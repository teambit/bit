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
  options = [
    ['', 'dry-run', 'show the .npmrc file content that will be written'],
    ['f', 'force', 'force update the .npmrc file even if there are conflicts'],
  ] as CommandOptions;
  skipWorkspace = false;

  private port?: string;

  constructor(
    private cloud: CloudMain,
    _port?: number
  ) {
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

    const updateResult = await this.cloud.generateNpmrc({ force: flags.force, dryRun: flags.dryRun });

    if (flags.dryRun) {
      let message = chalk.green(`.npmrc file content that would be written:\n\n${updateResult.configUpdates}`);
      if (updateResult.conflicts && updateResult.conflicts.length > 0) {
        const conflictDetails = this.extractConflictDetails(updateResult.conflicts);
        message += `\n\n${chalk.yellow('Conflicts detected:')} \n${conflictDetails}\n${chalk.yellow(
          'Use --force to override these conflicts.'
        )}`;
      }
      return message;
    }
    if (updateResult.conflicts && updateResult.conflicts.length > 0) {
      return this.handleNpmrcConflicts(updateResult.conflicts);
    }
    return chalk.green('The .npmrc file has been updated successfully.');
  }

  async json() {
    const config = await this.cloud.generateNpmrc();
    return { config };
  }

  extractConflictDetails(conflicts) {
    return conflicts
      .map(
        (conflict, index) =>
          `${chalk.yellow(`Conflict #${index + 1}:`)}
Original: ${chalk.red(conflict.original)}
Modification: ${chalk.green(conflict.modifications)}`
      )
      .join('\n\n');
  }

  async handleNpmrcConflicts(conflicts): Promise<string> {
    const conflictDetails = this.extractConflictDetails(conflicts);
    const question = `\n${chalk.yellow(
      'Conflict detected in .npmrc file with the following configurations:'
    )}\n${conflictDetails}\n${chalk.yellow(
      'Do you want to override these configurations and continue? [yes(y)/no(n)]'
    )}`;

    const ok = await yesno({ question });
    if (!ok) {
      return chalk.red('Updating .npmrc was aborted due to conflicts.');
    }
    await this.cloud.generateNpmrc({ force: true });
    return chalk.green('.npmrc has been updated successfully after resolving conflicts.');
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
