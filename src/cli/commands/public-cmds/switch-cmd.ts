import chalk from 'chalk';
import R from 'ramda';

import { switchAction } from '../../../api/consumer';
import { SwitchProps } from '../../../consumer/lanes/switch-lanes';
import { CheckoutProps } from '../../../consumer/versions-ops/checkout-version';
import { ApplyVersionResults, MergeOptions, MergeStrategy } from '../../../consumer/versions-ops/merge-version';
import GeneralError from '../../../error/general-error';
import { CommandOptions, LegacyCommand } from '../../legacy-command';
import { applyVersionReport } from './merge-cmd';

export default class Switch implements LegacyCommand {
  name = 'switch <lane>';
  description = `switch to the specified lane`;
  private = true;
  alias = '';
  opts = [
    ['c', 'create', 'create a new lane'],
    ['r', 'remote <scope>', 'fetch remote lane objects and switch to a local lane tracked to the remote'],
    ['n', 'as <as>', 'relevant when --remote flag is used. name a local lane differently than the remote lane'],
    [
      'm',
      'merge [strategy]',
      'merge local changes with the checked out version. strategy should be "theirs", "ours" or "manual"',
    ],
    ['a', 'get-all', 'checkout all components in a lane include ones that do not exist in the workspace'],
    ['v', 'verbose', 'showing verbose output for inspection'],
    ['j', 'json', 'return the output as JSON'],
    [
      '',
      'ignore-package-json',
      'do not generate package.json for the imported component(s). (it automatically enables skip-npm-install and save-dependencies-as-components flags)',
    ],
    ['', 'skip-npm-install', 'do not install packages of the imported components'],
    ['', 'ignore-dist', 'do not write dist files (when exist)'],
  ] as CommandOptions;
  loader = true;

  action(
    [lane]: [string],
    {
      create = false,
      remote,
      as,
      merge,
      getAll = false,
      verbose = false,
      json = false,
      ignorePackageJson = false,
      skipNpmInstall = false,
      ignoreDist = false,
    }: {
      create?: boolean;
      remote?: string;
      as?: string;
      merge?: MergeStrategy;
      getAll?: boolean;
      verbose?: boolean;
      override?: boolean;
      json?: boolean;
      ignorePackageJson?: boolean;
      skipNpmInstall?: boolean;
      ignoreDist?: boolean;
    }
  ): Promise<ApplyVersionResults> {
    let mergeStrategy;
    if (merge && R.is(String, merge)) {
      const options = Object.keys(MergeOptions);
      if (!options.includes(merge)) {
        throw new GeneralError(`merge must be one of the following: ${options.join(', ')}`);
      }
      mergeStrategy = merge;
    }
    const switchProps: SwitchProps = {
      create,
      laneName: lane,
      remoteScope: remote,
      existingOnWorkspaceOnly: !getAll,
      newLaneName: as,
    };
    const checkoutProps: CheckoutProps = {
      mergeStrategy,
      verbose,
      skipNpmInstall,
      ignorePackageJson,
      ignoreDist,
      isLane: true,
      promptMergeOptions: false,
      writeConfig: false,
      reset: false,
      all: false,
    };
    return switchAction(switchProps, checkoutProps).then((results) => ({ ...results, lane, create, json }));
  }

  report({
    components,
    failedComponents,
    lane,
    create,
    json,
  }: {
    components: ApplyVersionResults['components'];
    failedComponents: ApplyVersionResults['failedComponents'];
    lane: string;
    create: boolean;
    json: boolean;
  }): string {
    if (create) {
      return chalk.green(`successfully added a new lane ${chalk.bold(lane)}`);
    }
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
