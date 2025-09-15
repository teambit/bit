import chalk from 'chalk';
import type { Command } from '@teambit/cli';
import type { CloudMain } from './cloud.main.runtime';

export class LogoutCmd implements Command {
  name = 'logout';
  description = 'sign out of Bit Cloud and clear authentication tokens';
  extendedDescription = `removes stored authentication tokens and signs out of Bit Cloud.
clears local credentials while preserving .npmrc configurations.
use this to switch between accounts or when authentication tokens expire.`;
  group = 'auth';
  alias = '';
  options = [];
  loader = true;
  skipWorkspace = true;
  loadAspects = false;

  constructor(private cloud: CloudMain) {}

  async report(): Promise<string> {
    await this.cloud.logout();
    return chalk.green('logged out successfully.');
  }

  async json() {
    await this.cloud.logout();
    return { logout: true };
  }
}
