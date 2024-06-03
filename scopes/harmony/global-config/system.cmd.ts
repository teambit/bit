// eslint-disable-next-line max-classes-per-file
import { Command, CommandOptions } from '@teambit/cli';
import fs from 'fs-extra';
import chalk from 'chalk';
import cp from 'child_process';
import { DEBUG_LOG } from '@teambit/legacy/dist/constants';

export class SystemCmd implements Command {
  name = 'system <sub-command>';
  description = `system operations`;
  group = 'workspace';
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
  group = 'workspace';
  alias = '';
  loader = false;
  options = [
    ['t', 'tail', 'similar to "tail -f" command, print the log file to the screen as it is being written'],
  ] as CommandOptions;

  // @ts-ignore
  async report([]: [], { tail }: { tail?: boolean }) {
    if (tail) {
      cp.execSync(`tail -f ${DEBUG_LOG}`, { stdio: 'inherit' });
      // wait indefinitely for a promise to keep the process running
      return new Promise(() => {});
    }
    const logFile = fs.readFileSync(DEBUG_LOG, 'utf8');
    return logFile;
  }
}
