import chalk from 'chalk';
import { PaperError } from '../../cli';

export default class InvalidConfigFile extends PaperError {
  showDoctorMessage: boolean;
  constructor(readonly path: string) {
    super(generateMessage(path));
    this.showDoctorMessage = true;
  }

  report() {
    return this.message;
  }
}

function generateMessage(path: string) {
  return `error: invalid workspace.jsonc: ${chalk.bold(path)} is not a valid JSON file.
consider running ${chalk.bold('bit init --reset')} to recreate the file`;
}
