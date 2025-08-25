// eslint-disable-next-line max-classes-per-file
import type { Command, CommandOptions } from '@teambit/cli';
import fs from 'fs-extra';
import chalk from 'chalk';
import cp from 'child_process';
import { DEBUG_LOG } from '@teambit/legacy.constants';

export class SystemCmd implements Command {
  name = 'system <sub-command>';
  description = `system operations`;
  group = 'system';
  alias = '';
  options = [] as CommandOptions;
  commands: Command[] = [];

  async report([unrecognizedSubcommand]: [string]) {
    return chalk.red(
      `"${unrecognizedSubcommand}" is not a subcommand of "system", please run "bit system --help" to list the subcommands`
    );
  }
}

export class SystemLogCmd implements Command {
  name = 'log';
  description = `print debug.log to the screen`;
  group = 'system';
  alias = '';
  loader = false;
  options = [] as CommandOptions;

  async report() {
    const logFile = fs.readFileSync(DEBUG_LOG, 'utf8');
    return logFile;
  }
}

export class SystemTailLogCmd implements Command {
  name = 'tail-log';
  description = `print the log file to the screen as it is being written`;
  extendedDescription = 'similar to linux "tail -f" command';
  group = 'system';
  alias = '';
  loader = false;
  options = [] as CommandOptions;

  async wait() {
    cp.execSync(`tail -f ${DEBUG_LOG}`, { stdio: 'inherit' });
  }
}
