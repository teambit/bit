import { Command, CommandOptions } from '@teambit/cli';

import { InstallMain } from './install.main.runtime';

type UpdateCmdOptions = {
  yes?: boolean;
  patterns?: string[];
};

export default class UpdateCmd implements Command {
  name = 'update [package-patterns...]';
  description = 'update dependencies';
  helpUrl = 'docs/dependencies/configuring-dependencies/#update-dependencies';
  alias = 'up';
  group = 'development';
  arguments = [
    {
      name: 'package-patterns...',
      description:
        'a list of package names, or patterns (separated by space). The patterns should be in glob format. By default, all packages are selected.',
    },
  ];
  options = [['y', 'yes', 'automatically update all outdated packages']] as CommandOptions;

  constructor(private install: InstallMain) {}

  async report([patterns = []]: [string[]], options: UpdateCmdOptions) {
    await this.install.updateDependencies({
      all: options.yes === true,
      patterns,
    });
    return '';
  }
}
