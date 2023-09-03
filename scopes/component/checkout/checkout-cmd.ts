import chalk from 'chalk';
import { Command, CommandOptions } from '@teambit/cli';
import {
  ApplyVersionResults,
  applyVersionReport,
  conflictSummaryReport,
  installationErrorOutput,
  compilationErrorOutput,
  getRemovedOutput,
  getAddedOutput,
} from '@teambit/merging';
import { COMPONENT_PATTERN_HELP, HEAD, LATEST } from '@teambit/legacy/dist/constants';
import { MergeStrategy } from '@teambit/legacy/dist/consumer/versions-ops/merge-version';
import { BitId } from '@teambit/legacy-bit-id';
import { BitError } from '@teambit/bit-error';
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
  helpUrl = 'reference/components/merging-changes#checkout-snaps-to-the-working-directory';
  group = 'development';
  extendedDescription = `
  \`bit checkout <version> [component-pattern]\` => checkout the specified ids (or all components when --all is used) to the specified version
  \`bit checkout head [component-pattern]\` => checkout to the last snap/tag (use --latest if you only want semver tags), omit [component-pattern] to checkout head for all
  \`bit checkout latest [component-pattern]\` => checkout to the latest satisfying semver tag, omit [component-pattern] to checkout latest for all
  \`bit checkout reset [component-pattern]\` => remove local modifications from the specified ids (or all components when --all is used)`;
  alias = 'U';
  options = [
    [
      'i',
      'interactive-merge',
      'when a component is modified and the merge process found conflicts, display options to resolve them',
    ],
    ['', 'ours', 'DEPRECATED. use --auto-merge-resolve. In the future, this flag will leave the current code intact'],
    [
      '',
      'theirs',
      'DEPRECATED. use --auto-merge-resolve. In the future, this flag will override the current code with the incoming code',
    ],
    ['', 'manual', 'DEPRECATED. use --auto-merge-resolve'],
    [
      '',
      'auto-merge-resolve <merge-strategy>',
      'in case of merge conflict, resolve according to the provided strategy: [ours, theirs, manual]',
    ],
    ['r', 'reset', 'revert changes that were not snapped/tagged'],
    ['a', 'all', 'all components'],
    [
      'e',
      'workspace-only',
      "only relevant for 'bit checkout head' when on a lane. don't import components from the remote lane that are not already in the workspace",
    ],
    ['v', 'verbose', 'showing verbose output for inspection'],
    ['x', 'skip-dependency-installation', 'do not auto-install dependencies of the imported components'],
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
      autoMergeResolve,
      all = false,
      workspaceOnly = false,
      verbose = false,
      skipDependencyInstallation = false,
      revert = false,
    }: {
      interactiveMerge?: boolean;
      ours?: boolean;
      theirs?: boolean;
      manual?: boolean;
      autoMergeResolve?: MergeStrategy;
      all?: boolean;
      workspaceOnly?: boolean;
      verbose?: boolean;
      skipDependencyInstallation?: boolean;
      revert?: boolean;
    }
  ) {
    if (ours || theirs || manual) {
      throw new BitError(
        'the "--ours", "--theirs" and "--manual" flags are deprecated. use "--auto-merge-resolve" instead.'
      );
    }
    if (
      autoMergeResolve &&
      autoMergeResolve !== 'ours' &&
      autoMergeResolve !== 'theirs' &&
      autoMergeResolve !== 'manual'
    ) {
      throw new BitError('--auto-merge-resolve must be one of the following: [ours, theirs, manual]');
    }
    if (workspaceOnly && to !== HEAD) {
      throw new BitError('--workspace-only is only relevant when running "bit checkout head" on a lane');
    }
    const checkoutProps: CheckoutProps = {
      promptMergeOptions: interactiveMerge,
      mergeStrategy: autoMergeResolve,
      all,
      verbose,
      isLane: false,
      skipNpmInstall: skipDependencyInstallation,
      workspaceOnly,
      revert,
    };
    if (to === HEAD) checkoutProps.head = true;
    else if (to === LATEST) checkoutProps.latest = true;
    else if (to === 'reset') checkoutProps.reset = true;
    else if (to === 'main') checkoutProps.main = true;
    else {
      if (!BitId.isValidVersion(to)) throw new BitError(`the specified version "${to}" is not a valid version`);
      checkoutProps.version = to;
    }

    const checkoutResults = await this.checkout.checkoutByCLIValues(componentPattern || '', checkoutProps);
    return checkoutOutput(checkoutResults, checkoutProps);
  }
}

export function checkoutOutput(checkoutResults: ApplyVersionResults, checkoutProps: CheckoutProps) {
  const {
    components,
    version,
    failedComponents,
    removedComponents,
    addedComponents,
    leftUnresolvedConflicts,
    newFromLane,
    newFromLaneAdded,
    installationError,
    compilationError,
  }: ApplyVersionResults = checkoutResults;

  const { head, reset, latest, main, revert, verbose, all } = checkoutProps;

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
    const title = 'checkout was not required for the following component(s)';
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
    const switchedOrReverted = revert ? 'reverted' : 'switched';
    if (!components || !components.length) return '';
    if (components.length === 1) {
      const component = components[0];
      const componentName = reset ? component.id.toString() : component.id.toStringWithoutVersion();
      if (reset) return `successfully reset ${chalk.bold(componentName)}\n`;
      const title = `successfully ${switchedOrReverted} ${chalk.bold(componentName)} to version ${chalk.bold(
        // @ts-ignore version is defined when !reset
        head || latest ? component.id.version : version
      )}\n`;
      return chalk.bold(title) + applyVersionReport(components, false);
    }
    if (reset) {
      const title = 'successfully reset the following components\n\n';
      const body = components.map((component) => chalk.bold(component.id.toString())).join('\n');
      return chalk.underline(title) + body;
    }
    const getVerOutput = () => {
      if (head) return 'their head version';
      if (latest) return 'their latest version';
      if (main) return 'their main version';
      // @ts-ignore version is defined when !reset
      return `version ${chalk.bold(version)}`;
    };
    const versionOutput = getVerOutput();
    const title = `successfully ${switchedOrReverted} ${components.length} components to ${versionOutput}\n`;
    const showVersion = head || reset;
    return chalk.bold(title) + applyVersionReport(components, true, showVersion);
  };
  const getNewOnLaneOutput = () => {
    if (!newFromLane?.length) return '';
    const title = newFromLaneAdded
      ? `successfully added the following components from the lane`
      : `the following components exist on the lane but were not added to the workspace. omit --workspace-only flag to add them`;
    const body = newFromLane.join('\n');
    return `\n\n${chalk.underline(title)}\n${body}`;
  };
  const getSummary = () => {
    const checkedOut = components?.length || 0;
    const notCheckedOutLegitimately = notCheckedOutComponents.length;
    const failedToCheckOut = realFailedComponents.length;
    const newLines = '\n\n';
    const title = chalk.bold.underline('Summary');
    const checkedOutStr = `\nTotal Changed: ${chalk.bold(checkedOut.toString())}`;
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
    getRemovedOutput(removedComponents) +
    getAddedOutput(addedComponents) +
    getNewOnLaneOutput() +
    getConflictSummary() +
    getSummary() +
    installationErrorOutput(installationError) +
    compilationErrorOutput(compilationError)
  );
}
