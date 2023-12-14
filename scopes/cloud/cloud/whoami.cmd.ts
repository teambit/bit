import chalk from 'chalk';
import { Command } from '@teambit/cli';
import { CloudMain } from './cloud.main.runtime';

export class WhoamiCmd implements Command {
  name = 'whoami';
  description = 'display the currently logged in user';
  group = 'general';
  alias = '';
  options = [];
  loader = true;
  skipWorkspace = true;

  constructor(private cloud: CloudMain) {}

  async report(): Promise<string> {
    const cloudUsername = await this.cloud.whoami();
    if (!cloudUsername) return chalk.yellow('not logged in');
    return chalk.green(`logged in as ${cloudUsername}`);
  }

  async json() {
    const cloudUsername = await this.cloud.whoami();
    return { whoami: cloudUsername };
  }
}
