import { BitError } from '@teambit/bit-error';
import chalk from 'chalk';

export class CommandNotFound extends BitError {
  commandName: string;
  suggestion?: string;
  constructor(commandName: string, suggestion?: string) {
    super(`command ${commandName} was not found`);
    this.commandName = commandName;
    this.suggestion = suggestion;
  }
  report() {
    let output = chalk.yellow(
      `warning: '${chalk.bold(this.commandName)}' is not a valid command.
see 'bit --help' for additional information`
    );
    if (this.suggestion) {
      output += `\nDid you mean ${chalk.bold(this.suggestion)}?`;
    }
    return output;
  }
}
