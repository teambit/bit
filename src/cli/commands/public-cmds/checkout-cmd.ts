import chalk from 'chalk';

import { checkout } from '../../../api/consumer';
import { LATEST, WILDCARD_HELP } from '../../../constants';
import { CheckoutProps } from '../../../consumer/versions-ops/checkout-version';
import { ApplyVersionResults, getMergeStrategy } from '../../../consumer/versions-ops/merge-version';
import { Group } from '../../command-groups';
import { CommandOptions, LegacyCommand } from '../../legacy-command';
import { applyVersionReport } from './merge-cmd';

export default class Checkout implements LegacyCommand {
  name = 'checkout [values...]';
  shortDescription = 'switch between component versions';
  group: Group = 'development';
  description = `switch between component versions or remove local changes
  bit checkout <version> [ids...] => checkout the specified ids (or all components when --all is used) to the specified version
  bit checkout latest [ids...] => checkout the specified ids (or all components when --all is used) to their latest versions
  bit checkout [ids...] --reset => remove local modifications from the specified ids (or all components when --all is used)
  ${WILDCARD_HELP('checkout 0.0.1')}`;
  alias = 'U';
  opts = [
    [
      'i',
      'interactive-merge',
      'when a component is modified and the merge process found conflicts, display options to resolve them',
    ],
    ['o', 'ours', 'in case of a conflict, override the used version with the current modification'],
    ['t', 'theirs', 'in case of a conflict, override the current modification with the specified version'],
    ['m', 'manual', 'in case of a conflict, leave the files with a conflict state to resolve them manually later'],
    ['r', 'reset', 'remove local changes'],
    ['a', 'all', 'all components'],
    ['v', 'verbose', 'showing verbose output for inspection'],
    ['', 'skip-npm-install', 'do not install packages of the imported components'],
    [
      '',
      'ignore-package-json',
      'do not generate package.json for the imported component(s). (it automatically enables skip-npm-install and save-dependencies-as-components flags)',
    ],
    [
      '',
      'conf [path]',
      'write the configuration file (bit.json) and the envs configuration files (use --conf without path to write to the default dir)',
    ],
    ['', 'ignore-dist', 'do not write dist files (when exist)'],
  ] as CommandOptions;
  loader = true;

  action(
    [values]: [string[]],
    {
      interactiveMerge = false,
      ours = false,
      theirs = false,
      manual = false,
      reset = false,
      all = false,
      verbose = false,
      skipNpmInstall = false,
      ignorePackageJson = false,
      conf,
      ignoreDist = false,
    }: {
      interactiveMerge?: boolean;
      ours?: boolean;
      theirs?: boolean;
      manual?: boolean;
      reset?: boolean;
      all?: boolean;
      verbose?: boolean;
      skipNpmInstall?: boolean;
      ignorePackageJson?: boolean;
      conf?: string;
      ignoreDist?: boolean;
    }
  ): Promise<ApplyVersionResults> {
    const checkoutProps: CheckoutProps = {
      promptMergeOptions: interactiveMerge,
      mergeStrategy: getMergeStrategy(ours, theirs, manual),
      reset,
      all,
      verbose,
      isLane: false,
      skipNpmInstall,
      ignoreDist,
      ignorePackageJson,
      writeConfig: !!conf,
    };
    return checkout(values, checkoutProps);
  }

  report(
    { components, version, failedComponents }: ApplyVersionResults,
    _,
    { verbose, all }: { verbose: boolean; all: boolean }
  ): string {
    const isLatest = Boolean(version && version === LATEST);
    const isReset = !version;
    const getFailureOutput = () => {
      // components that failed for no legitimate reason. e.g. merge-conflict.
      const realFailedComponents = failedComponents?.filter((f) => !f.unchangedLegitimately);
      if (!realFailedComponents || !realFailedComponents.length) return '';
      const title = 'the checkout has been canceled on the following component(s)';
      const body = realFailedComponents
        .map(
          (failedComponent) =>
            `${chalk.bold(failedComponent.id.toString())} - ${chalk.red(failedComponent.failureMessage)}`
        )
        .join('\n');
      return `${title}\n${body}\n\n`;
    };
    const getNeutralOutput = () => {
      // components that weren't checked out for legitimate reasons, e.g. up-to-date.
      const neutralComponents = (failedComponents || []).filter((f) => f.unchangedLegitimately);
      if (!neutralComponents.length) return '';
      if (!verbose && all) {
        return chalk.green(
          `checkout was not needed for ${chalk.bold(
            neutralComponents.length.toString()
          )} components (use --verbose to get more details)\n`
        );
      }

      const title = 'the checkout was not needed on the following component(s)';
      const body = neutralComponents
        .map((failedComponent) => `${chalk.bold(failedComponent.id.toString())} - ${failedComponent.failureMessage}`)
        .join('\n');
      return `${title}\n${body}\n\n`;
    };
    const getSuccessfulOutput = () => {
      if (!components || !components.length) return '';
      if (components.length === 1) {
        const component = components[0];
        const componentName = isReset ? component.id.toString() : component.id.toStringWithoutVersion();
        if (isReset) return `successfully reset ${chalk.bold(componentName)}\n`;
        const title = `successfully switched ${chalk.bold(componentName)} to version ${chalk.bold(
          // $FlowFixMe version is defined when !isReset
          // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
          isLatest ? component.id.version : version
        )}\n`;
        return `${title} ${applyVersionReport(components, false)}`;
      }
      if (isReset) {
        const title = 'successfully reset the following components\n\n';
        const body = components.map((component) => chalk.bold(component.id.toString())).join('\n');
        return title + body;
      }
      // $FlowFixMe version is defined when !isReset
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      const versionOutput = isLatest ? 'their latest version' : `version ${chalk.bold(version)}`;
      const title = `successfully switched the following components to ${versionOutput}\n\n`;
      const showVersion = isLatest || isReset;
      const componentsStr = applyVersionReport(components, true, showVersion);
      return title + componentsStr;
    };

    return getFailureOutput() + getNeutralOutput() + getSuccessfulOutput();
  }
}
