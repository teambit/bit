import chalk from 'chalk';
import type { Command } from './command';
import { readCommandDetails } from './command-details';

export class DetailsCmd implements Command {
  name = 'details';
  description = 'show expanded details from the last mutative command (e.g. tag, snap)';
  alias = '';
  group = 'info-analysis';
  loader = false;
  options = [];

  async report() {
    const details = readCommandDetails();
    if (!details) {
      return chalk.yellow('no details available. run a command like "bit tag" or "bit snap" first.');
    }
    return details;
  }
}
