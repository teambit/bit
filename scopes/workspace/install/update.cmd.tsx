import { Command, CommandOptions } from '@teambit/cli';

import { InstallMain } from './install.main.runtime';

type UpdateCmdOptions = {
  yes?: boolean;
};

export default class UpdateCmd implements Command {
  name = 'update';
  description = 'update dependencies';
  helpUrl = 'docs/dependencies/configuring-dependencies/#update-dependencies';
  alias = 'up';
  group = 'development';
  options = [['y', 'yes', 'automatically update all outdated packages']] as CommandOptions;

  constructor(private install: InstallMain) {}

  async report(args: [string[]], options: UpdateCmdOptions) {
    await this.install.updateDependencies({
      all: options.yes === true,
    });
    return '';
  }
}
