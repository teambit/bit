import type { Command, CommandOptions } from '@teambit/cli';
import { COMPONENT_PATTERN_HELP } from '@teambit/legacy.constants';
import type { CheckoutMain } from './checkout.main.runtime';
import { CheckoutCmd } from './checkout-cmd';

export class RevertCmd implements Command {
  name = 'revert <component-pattern> <to>';
  arguments = [
    {
      name: 'component-pattern',
      description: COMPONENT_PATTERN_HELP,
    },
    {
      name: 'to',
      description: "permitted values: [main, specific-version]. 'main' - head version on main.",
    },
  ];
  description = 'replace component files with specified version while preserving current version';
  extendedDescription = `replaces component source files with files from the specified version but keeps the current component version.
useful for reverting file changes without changing the component's version history. different from checkout which changes the version.`;
  group = 'version-control';
  alias = '';
  options = [
    ['v', 'verbose', 'showing verbose output for inspection'],
    ['x', 'skip-dependency-installation', 'do not install packages of the imported components'],
  ] as CommandOptions;
  loader = true;

  constructor(private checkout: CheckoutMain) {}

  async report(
    [componentPattern, to]: [string, string],
    {
      verbose = false,
      skipDependencyInstallation = false,
    }: {
      verbose?: boolean;
      skipDependencyInstallation?: boolean;
    }
  ) {
    return new CheckoutCmd(this.checkout).report([to, componentPattern], {
      verbose,
      skipDependencyInstallation,
      revert: true,
    });
  }
}
