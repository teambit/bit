import chalk from 'chalk';
import R from 'ramda';
import { Command, CommandOptions } from '@teambit/cli';
import { switchAction } from '@teambit/legacy/dist/api/consumer';
import { SwitchProps } from '@teambit/legacy/dist/consumer/lanes/switch-lanes';
import { CheckoutProps } from '@teambit/legacy/dist/consumer/versions-ops/checkout-version';
import {
  MergeOptions,
  MergeStrategy,
  applyVersionReport,
} from '@teambit/legacy/dist/consumer/versions-ops/merge-version';
import { BitError } from '@teambit/bit-error';

export class SwitchCmd implements Command {
  name = 'switch <lane>';
  description = `switch to the specified lane`;
  private = true;
  alias = '';
  options = [
    [
      'n',
      'as <as>',
      'relevant when the specified lane is a remote late. name a local lane differently than the remote lane',
    ],
    [
      'm',
      'merge [strategy]',
      'merge local changes with the checked out version. strategy should be "theirs", "ours" or "manual"',
    ],
    ['a', 'get-all', 'checkout all components in a lane include ones that do not exist in the workspace'],
    ['v', 'verbose', 'showing verbose output for inspection'],
    ['j', 'json', 'return the output as JSON'],
  ] as CommandOptions;
  loader = true;

  async report(
    [lane]: [string],
    {
      as,
      merge,
      getAll = false,
      verbose = false,
      json = false,
    }: {
      as?: string;
      merge?: MergeStrategy;
      getAll?: boolean;
      verbose?: boolean;
      override?: boolean;
      json?: boolean;
    }
  ) {
    let mergeStrategy;
    if (merge && R.is(String, merge)) {
      const options = Object.keys(MergeOptions);
      if (!options.includes(merge)) {
        throw new BitError(`merge must be one of the following: ${options.join(', ')}`);
      }
      mergeStrategy = merge;
    }

    const switchProps: SwitchProps = {
      laneName: lane,
      existingOnWorkspaceOnly: !getAll,
      newLaneName: as,
    };
    const checkoutProps: CheckoutProps = {
      mergeStrategy,
      verbose,
      skipNpmInstall: false, // not relevant in Harmony
      ignorePackageJson: true, // not relevant in Harmony
      ignoreDist: true, // not relevant in Harmony
      isLane: true,
      promptMergeOptions: false,
      writeConfig: false,
      reset: false,
      all: false,
    };
    const { components, failedComponents } = await switchAction(switchProps, checkoutProps);
    if (json) {
      return JSON.stringify({ components, failedComponents }, null, 4);
    }
    const getFailureOutput = () => {
      if (!failedComponents || !failedComponents.length) return '';
      const title = 'the switch has been canceled on the following component(s)';
      const body = failedComponents
        .map(
          (failedComponent) =>
            `${chalk.bold(failedComponent.id.toString())} - ${chalk.red(failedComponent.failureMessage)}`
        )
        .join('\n');
      return `${title}\n${body}\n\n`;
    };
    const getSuccessfulOutput = () => {
      const laneSwitched = chalk.green(`\nsuccessfully set "${chalk.bold(lane)}" as the active lane`);
      if (!components || !components.length) return `No component had been changed.${laneSwitched}`;
      if (components.length === 1) {
        const component = components[0];
        const componentName = component.id.toStringWithoutVersion();
        const title = `successfully switched ${chalk.bold(componentName)} to version ${chalk.bold(
          component.id.version as string
        )}\n`;
        return `${title} ${applyVersionReport(components, false)}${laneSwitched}`;
      }
      const title = `successfully switched the following components to the version of ${lane}\n\n`;
      const componentsStr = applyVersionReport(components, true, false);
      return title + componentsStr + laneSwitched;
    };
    const failedOutput = getFailureOutput();
    const successOutput = getSuccessfulOutput();
    return failedOutput + successOutput;
  }
}
