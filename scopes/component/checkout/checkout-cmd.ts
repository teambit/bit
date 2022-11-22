import chalk from 'chalk';
import { BitError } from '@teambit/bit-error';
import { Command, CommandOptions } from '@teambit/cli';
import { COMPONENT_PATTERN_HELP } from '@teambit/legacy/dist/constants';
import {
  ApplyVersionResults,
  getMergeStrategy,
  applyVersionReport,
  conflictSummaryReport,
} from '@teambit/legacy/dist/consumer/versions-ops/merge-version';
import { CheckoutMain, CheckoutProps } from './checkout.main.runtime';

export class CheckoutCmd implements Command {
  name = 'checkout <to> [component-pattern]';
  arguments = [
    {
      name: 'to',
      description:
        "permitted values: [head, latest, reset, specific-version]. 'head' - last snap/tag. 'latest' - semver latest tag. 'reset' - removes local changes",
    },
    {
      name: 'component-pattern',
      description: COMPONENT_PATTERN_HELP,
    },
  ];
  description = 'switch between component versions or remove local changes';
  helpUrl = 'docs/components/merging-changes#checkout-snaps-to-the-working-directory';
  group = 'development';
  extendedDescription = `
  \`bit checkout <version> [component-pattern]\` => checkout the specified ids (or all components when --all is used) to the specified version
  \`bit checkout head [component-pattern]\` => checkout to the last snap/tag, omit [component-pattern] to checkout head for all
  \`bit checkout latest [component-pattern]\` => checkout to the latest satisfying semver tag, omit [component-pattern] to checkout latest for all
  \`bit checkout reset [component-pattern]\` => remove local modifications from the specified ids (or all components when --all is used)`;
  alias = 'U';
  options = [
    [
      'i',
      'interactive-merge',
      'when a component is modified and the merge process found conflicts, display options to resolve them',
    ],
    ['o', 'ours', 'in case of a conflict, override the used version with the current modification'],
    ['t', 'theirs', 'in case of a conflict, override the current modification with the specified version'],
    ['m', 'manual', 'in case of a conflict, leave the files with a conflict state to resolve them manually later'],
    ['r', 'reset', 'revert changes that were not snapped/tagged'],
    ['a', 'all', 'all components'],
    ['e', 'entire-lane', 'write also new components that were introduced on the remote lane and do not exist locally'],
    ['v', 'verbose', 'showing verbose output for inspection'],
    ['', 'reset', 'DEPRECATED. run "bit checkout reset" instead'],
    ['', 'skip-npm-install', 'DEPRECATED. use "--skip-dependency-installation" instead'],
    ['', 'skip-dependency-installation', 'do not install packages of the imported components'],
  ] as CommandOptions;
  loader = true;

  constructor(private checkout: CheckoutMain) {}

  async report(
    [to, componentPattern]: [string, string],
    {
      interactiveMerge = false,
      ours = false,
      theirs = false,
      manual = false,
      reset = false,
      all = false,
      entireLane = false,
      verbose = false,
      skipNpmInstall = false,
      skipDependencyInstallation = false,
    }: {
      interactiveMerge?: boolean;
      ours?: boolean;
      theirs?: boolean;
      manual?: boolean;
      reset?: boolean;
      all?: boolean;
      entireLane?: boolean;
      verbose?: boolean;
      skipNpmInstall?: boolean;
      skipDependencyInstallation?: boolean;
    }
  ) {
    if (reset) {
      throw new BitError(`--reset flag has been removed. please run "bit checkout reset" instead`);
    }
    if (skipNpmInstall) {
      // eslint-disable-next-line no-console
      console.log(
        chalk.yellow(`"--skip-npm-install" has been deprecated, please use "--skip-dependency-installation" instead`)
      );
      skipDependencyInstallation = true;
    }
    const checkoutProps: CheckoutProps = {
      promptMergeOptions: interactiveMerge,
      mergeStrategy: getMergeStrategy(ours, theirs, manual),
      all,
      verbose,
      isLane: false,
      skipNpmInstall: skipDependencyInstallation,
      entireLane,
    };
    const {
      components,
      version,
      failedComponents,
      leftUnresolvedConflicts,
      newFromLane,
      newFromLaneAdded,
    }: ApplyVersionResults = await this.checkout.checkoutByCLIValues(to, componentPattern || '', checkoutProps);
    const isHead = to === 'head';
    const isReset = to === 'reset';
    const isLatest = to === 'latest';
    // components that failed for no legitimate reason. e.g. merge-conflict.
    const realFailedComponents = (failedComponents || []).filter((f) => !f.unchangedLegitimately);
    // components that weren't checked out for legitimate reasons, e.g. up-to-date.
    const notCheckedOutComponents = (failedComponents || []).filter((f) => f.unchangedLegitimately);

    const getFailureOutput = () => {
      if (!realFailedComponents.length) return '';
      const title = 'the checkout has been failed on the following component(s)';
      const body = realFailedComponents
        .map(
          (failedComponent) =>
            `${chalk.bold(failedComponent.id.toString())} - ${chalk.red(failedComponent.failureMessage)}`
        )
        .join('\n');
      return `${chalk.underline(title)}\n${body}\n\n`;
    };
    const getNotCheckedOutOutput = () => {
      if (!notCheckedOutComponents.length) return '';
      if (!verbose && all) {
        return chalk.green(
          `checkout was not needed for ${chalk.bold(
            notCheckedOutComponents.length.toString()
          )} components (use --verbose to get more details)\n`
        );
      }
      const title = 'the checkout was not needed on the following component(s)';
      const body = notCheckedOutComponents
        .map((failedComponent) => `${failedComponent.id.toString()} - ${failedComponent.failureMessage}`)
        .join('\n');
      return `${chalk.underline(title)}\n${body}\n\n`;
    };
    const getConflictSummary = () => {
      if (!components || !components.length || !leftUnresolvedConflicts) return '';
      const title = `\n\nfiles with conflicts summary\n`;
      const suggestion = `\n\nfix the conflicts above manually and then run "bit install" and "bit compile".
once ready, snap/tag the components to persist the changes`;
      return chalk.underline(title) + conflictSummaryReport(components) + chalk.yellow(suggestion);
    };
    const getSuccessfulOutput = () => {
      if (!components || !components.length) return '';
      if (components.length === 1) {
        const component = components[0];
        const componentName = isReset ? component.id.toString() : component.id.toStringWithoutVersion();
        if (isReset) return `successfully reset ${chalk.bold(componentName)}\n`;
        const title = `successfully switched ${chalk.bold(componentName)} to version ${chalk.bold(
          // @ts-ignore version is defined when !isReset
          isHead || isLatest ? component.id.version : version
        )}\n`;
        return `${chalk.underline(title)} ${applyVersionReport(components, false)}`;
      }
      if (isReset) {
        const title = 'successfully reset the following components\n\n';
        const body = components.map((component) => chalk.bold(component.id.toString())).join('\n');
        return chalk.underline(title) + body;
      }
      const getVerOutput = () => {
        if (isHead) return 'their head version';
        if (isLatest) return 'their latest version';
        // @ts-ignore version is defined when !isReset
        return `version ${chalk.bold(version)}`;
      };
      const versionOutput = getVerOutput();
      const title = `successfully switched the following components to ${versionOutput}\n\n`;
      const showVersion = isHead || isReset;
      const componentsStr = applyVersionReport(components, true, showVersion);
      return chalk.underline(title) + componentsStr;
    };
    const getNewOnLaneOutput = () => {
      if (!newFromLane?.length) return '';
      const title = newFromLaneAdded
        ? `successfully added the following components from the lane`
        : `the following components introduced on the lane and were not added. use --entire-lane flag to add them`;
      const body = newFromLane.join('\n');
      return `\n\n${chalk.underline(title)}\n${body}`;
    };
    const getSummary = () => {
      const checkedOut = components?.length || 0;
      const notCheckedOutLegitimately = notCheckedOutComponents.length;
      const failedToCheckOut = realFailedComponents.length;
      const newLines = '\n\n';
      const title = chalk.bold.underline('Checkout Summary');
      const checkedOutStr = `\nTotal CheckedOut: ${chalk.bold(checkedOut.toString())}`;
      const unchangedLegitimatelyStr = `\nTotal Unchanged: ${chalk.bold(notCheckedOutLegitimately.toString())}`;
      const failedToCheckOutStr = `\nTotal Failed: ${chalk.bold(failedToCheckOut.toString())}`;
      const newOnLaneNum = newFromLane?.length || 0;
      const newOnLaneAddedStr = newFromLaneAdded ? ' (added)' : ' (not added)';
      const newOnLaneStr = newOnLaneNum
        ? `\nNew on lane${newOnLaneAddedStr}: ${chalk.bold(newOnLaneNum.toString())}`
        : '';

      return newLines + title + checkedOutStr + unchangedLegitimatelyStr + failedToCheckOutStr + newOnLaneStr;
    };

    return (
      getFailureOutput() +
      getNotCheckedOutOutput() +
      getSuccessfulOutput() +
      getNewOnLaneOutput() +
      getConflictSummary() +
      getSummary()
    );
  }
}
