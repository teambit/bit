import { Command, CommandOptions } from '@teambit/cli';
import { COMPONENT_PATTERN_HELP } from '@teambit/legacy.constants';
import { CheckoutMain } from './checkout.main.runtime';
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
  description = 'replace the current component files by the specified version, leave the version intact';
  group = 'development';
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
