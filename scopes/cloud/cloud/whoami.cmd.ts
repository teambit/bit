import chalk from 'chalk';
import { Command } from '@teambit/cli';
import { CloudMain } from './cloud.main.runtime';

export class WhoamiCmd implements Command {
  name = 'whoami';
  description = 'display the currently logged in user';
  group = 'auth';
  alias = '';
  options = [];
  loader = true;
  skipWorkspace = true;

  constructor(private cloud: CloudMain) {}

  async report(): Promise<string> {
    // const currentUsername = await this.cloud.getUsername();
    // eslint-disable-next-line no-console
    // if(currentUsername) console.log(chalk.grey(`\nlocally logged in as ${currentUsername}, checking username in cloud ...`));
    const cloudUsername = await this.cloud.whoami();
    if (!cloudUsername) return chalk.yellow('not logged in. please run `bit login` to log in to bit cloud');
    return chalk.green(`logged in as ${cloudUsername}`);
  }

  async json() {
    const cloudUsername = await this.cloud.whoami();
    return { whoami: cloudUsername };
  }
}
