import type { Command, CommandOptions } from '@teambit/cli';

import type { InstallMain } from './install.main.runtime';

type UpdateCmdOptions = {
  yes?: boolean;
  patterns?: string[];
  major?: boolean;
  minor?: boolean;
  patch?: boolean;
  semver?: boolean;
};

export default class UpdateCmd implements Command {
  name = 'update [package-patterns...]';
  description = 'update dependencies. By default, dependencies are updated to the highest semver compatible versions.';
  helpUrl = 'reference/dependencies/configuring-dependencies/#update-dependencies';
  alias = 'up';
  group = 'dependencies';
  arguments = [
    {
      name: 'package-patterns...',
      description:
        'a string list of package names, or patterns (separated by spaces or commas), e.g. "@teambit/**,@my-org/ui.**". The patterns should be in glob format. By default, all packages are selected.',
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
    ['', 'semver', 'update to the newest version respecting semver'],
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
    } else if (options.semver) {
      forceVersionBump = 'compatible';
    }
    await this.install.updateDependencies({
      all: options.yes === true,
      patterns: splitPatterns(patterns),
      forceVersionBump,
    });
    return '';
  }
}

function splitPatterns(patterns: string[]): string[] {
  const splittedPatterns: string[] = [];
  for (const pattern of patterns) {
    splittedPatterns.push(...pattern.split(/[, ]/));
  }
  return splittedPatterns;
}
