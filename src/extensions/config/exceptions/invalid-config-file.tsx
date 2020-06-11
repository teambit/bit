// eslint-disable-next-line @typescript-eslint/no-unused-vars
import React from 'react';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Color } from 'ink';
import chalk from 'chalk';
import { PaperError } from '../../paper';

export default class InvalidConfigFile extends PaperError {
  showDoctorMessage: boolean;

  render() {
    return <Color red>{this.message}</Color>;
  }

  constructor(readonly path: string) {
    super(generateMessage(path));
    this.showDoctorMessage = true;
  }
}

function generateMessage(path: string) {
  return `error: invalid workspace.jsonc: ${chalk.bold(path)} is not a valid JSON file.
consider running ${chalk.bold('bit init --reset')} to recreate the file`;
}
