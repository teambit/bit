import chalk from 'chalk';
import yesno from 'yesno';
import { CheckoutProps, checkoutOutput } from '@teambit/checkout';
import { PromptCanceled } from '@teambit/legacy/dist/prompts/exceptions';
import { Command, CommandOptions } from '@teambit/cli';
import { MergeLanesMain } from './merge-lanes.main.runtime';

export class MergeAbortLaneCmd implements Command {
  name = 'merge-abort';
  description = `abort the recent lane-merge. revert the lane object and checkout accordingly`;
  extendedDescription = `restore the lane-object same as it was before the last "bit lane merge" command.
also, checkout the workspace components according to the restored lane`;
  alias = '';
  options = [
    ['', 'verbose', 'show details of components that were not merged legitimately'],
    ['s', 'silent', 'skip confirmation'],
    ['x', 'skip-dependency-installation', 'do not install packages of the imported components'],
  ] as CommandOptions;
  loader = true;
  private = true;
  migration = true;
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
    if (!silent) {
      await this.prompt();
    }
    const checkoutProps: CheckoutProps = {
      reset: true,
      all: true,
      verbose,
      skipNpmInstall: skipDependencyInstallation,
    };
    const { checkoutResults, restoredItems } = await this.mergeLanes.abortLaneMerge(checkoutProps);

    const checkoutOutputStr = checkoutOutput(checkoutResults, checkoutProps);
    const restoredItemsTitle = chalk.underline('The following have been restored:');
    const restoredItemsOutput = restoredItems.map((item) => `[-] ${item}`).join('\n');

    return `${checkoutOutputStr}\n\n${restoredItemsTitle}\n${restoredItemsOutput}`;
  }

  private async prompt() {
    this.mergeLanes.logger.clearStatusLine();
    const ok = await yesno({
      question: `Code changes that were done since the last lane-merge will be lost.
The .bitmap and workspace.jsonc files will be restored to the state before the merge.
This action is irreversible.
${chalk.bold('Do you want to continue? [yes(y)/no(n)]')}`,
    });
    if (!ok) {
      throw new PromptCanceled();
    }
  }
}
