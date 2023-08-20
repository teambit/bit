import { Command, CommandOptions } from '@teambit/cli';

import { InstallMain } from './install.main.runtime';

type UpdateCmdOptions = {
  yes?: boolean;
  patterns?: string[];
  major?: boolean;
  minor?: boolean;
  patch?: boolean;
  compatible?: boolean;
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
        'a string list of package names, or patterns (separated by space), e.g. "@teambit/** @my-org/ui/**". The patterns should be in glob format. By default, all packages are selected.',
    },
  ];
  options = [
    [
      'y',
      'yes',
      'automatically update all outdated versions for packages specified in pattern (all if no pattern supplied) - use carefully as could result in breaking updates for dependencies',
    ],
    ['', 'patch', 'update to the latest patch version. Semver rules are ignored'],
    ['', 'minor', 'update to the latest minor version. Semver rules are ignored'],
    ['', 'major', 'update to the latest major version. Semver rules are ignored'],
    ['', 'compatible', 'update to the highest semver compatibe version'],
  ] as CommandOptions;

  constructor(private install: InstallMain) {}

  async report([patterns = []]: [string[]], options: UpdateCmdOptions) {
    let forceVersionBump: 'major' | 'minor' | 'patch' | 'compatible' | undefined;
    if (options.major) {
      forceVersionBump = 'major';
    } else if (options.minor) {
      forceVersionBump = 'minor';
    } else if (options.patch) {
      forceVersionBump = 'patch';
    } else if (options.compatible) {
      forceVersionBump = 'compatible';
    }
    await this.install.updateDependencies({
      all: options.yes === true,
      patterns,
      forceVersionBump,
    });
    return '';
  }
}
