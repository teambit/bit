import { Command, CommandOptions } from '../cli';

export class DumCmd implements Command {
  name = 'dum';
  options = [] as CommandOptions;

  async report() {
    return 'hi there';
  }
}
