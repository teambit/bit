import type { Command, CommandOptions } from '@teambit/cli';
import { COMPONENT_PATTERN_HELP } from '@teambit/legacy.constants';
import type { CheckoutMain } from './checkout.main.runtime';
import { CheckoutCmd } from './checkout-cmd';
import { revertCommand } from './checkout.commands';

export class RevertCmd implements Command {
  name = revertCommand.name;
  arguments = revertCommand.arguments;
  description = revertCommand.description;
  extendedDescription = revertCommand.extendedDescription;
  group = revertCommand.group;
  alias = revertCommand.alias;
  options = revertCommand.options;
  loader = revertCommand.loader;

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
