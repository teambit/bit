import chalk from 'chalk';
import type { CheckoutProps } from '@teambit/checkout';
import { checkoutOutput } from '@teambit/checkout';
import type { Command, CommandOptions } from '@teambit/cli';
import type { MergeLanesMain } from './merge-lanes.main.runtime';

export type MergeAbortOpts = {
  silent?: boolean; // don't show prompt before aborting
};

export class MergeAbortLaneCmd implements Command {
  name = 'merge-abort';
  description = `abort the recent lane-merge. revert the lane object and checkout accordingly`;
  extendedDescription = `restore the lane-object to its state before the last "bit lane merge" command.
also, checkout the workspace components according to the restored lane state`;
  alias = '';
  options = [
    ['', 'verbose', "show details of components that didn't need to be merged"],
    ['s', 'silent', 'skip confirmation'],
    ['x', 'skip-dependency-installation', 'do not install packages of the imported components'],
  ] as CommandOptions;
  loader = true;
  private = true;
  remoteOp = true;

  constructor(private mergeLanes: MergeLanesMain) {}

  async report(
    _,
    {
      skipDependencyInstallation = false,
      verbose = false,
      silent = false,
    }: {
      skipDependencyInstallation?: boolean;
      verbose?: boolean;
      silent?: boolean;
    }
  ): Promise<string> {
    const checkoutProps: CheckoutProps = {
      reset: true,
      all: true,
      verbose,
      skipNpmInstall: skipDependencyInstallation,
    };
    const mergeAbortOpts = { silent };
    const { checkoutResults, restoredItems, checkoutError } = await this.mergeLanes.abortLaneMerge(
      checkoutProps,
      mergeAbortOpts
    );

    const getCheckoutErrorStr = () => {
      if (!checkoutError) return '';
      const errMsg = `\n\nFailed to change component files to the pre-merge state due to an error:
${checkoutError.message}
please fix the error and then run "bit checkout reset --all" to revert the components to the pre-merge state`;
      return chalk.red(errMsg);
    };

    const checkoutOutputStr = checkoutResults ? checkoutOutput(checkoutResults, checkoutProps) : '';
    const restoredItemsTitle = chalk.green('The following have been restored successfully:');
    const restoredItemsOutput = restoredItems.map((item) => `[√] ${item}`).join('\n');

    return `${checkoutOutputStr}\n\n${restoredItemsTitle}\n${restoredItemsOutput}${getCheckoutErrorStr()}`;
  }
}
