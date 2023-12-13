import chalk from 'chalk';
import { Command, CommandOptions } from '@teambit/cli';
import { CloudMain } from './cloud.main.runtime';

export class LogoutCmd implements Command {
  name = 'logout';
  description = 'log the CLI out of Bit';
  group = 'general';
  alias = '';
  options = [];

  constructor(private cloud: CloudMain) {}

  async report(): Promise<string> {
    await this.cloud.logout();
    return chalk.green('logged out successfully.');
  }
}
