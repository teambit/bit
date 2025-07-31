import chalk from 'chalk';
import type { Command, CommandOptions } from '@teambit/cli';
import { compact } from 'lodash';
import type { ApplyVersionResults, MergeStrategy } from '@teambit/merging';
import {
  applyVersionReport,
  conflictSummaryReport,
  installationErrorOutput,
  compilationErrorOutput,
  getRemovedOutput,
  getAddedOutput,
  getWorkspaceConfigUpdateOutput,
} from '@teambit/merging';
import { COMPONENT_PATTERN_HELP, HEAD, LATEST } from '@teambit/legacy.constants';
import { ComponentID } from '@teambit/component-id';
import { BitError } from '@teambit/bit-error';
import type { CheckoutMain, CheckoutProps } from './checkout.main.runtime';

export class CheckoutCmd implements Command {
  name = 'checkout <to> [component-pattern]';
  arguments = [
    {
      name: 'to',
      description:
        "permitted values: [head, latest, reset, {specific-version}, {head~x}]. 'head' - last snap/tag. 'latest' - semver latest tag. 'reset' - removes local changes",
    },
    {
      name: 'component-pattern',
      description: COMPONENT_PATTERN_HELP,
    },
  ];
  description = 'switch between component versions or remove local changes';
  helpUrl = 'reference/components/merging-changes#checkout-snaps-to-the-working-directory';
  group = 'version-control';
  extendedDescription = `
\`bit checkout <version> [component-pattern]\` => checkout the specified ids (or all components when --all is used) to the specified version
\`bit checkout head [component-pattern]\` => checkout to the last snap/tag (use --latest if you only want semver tags), omit [component-pattern] to checkout head for all
\`bit checkout head~x [component-pattern]\` => go backward x generations from the head and checkout to that version
\`bit checkout latest [component-pattern]\` => checkout to the latest satisfying semver tag, omit [component-pattern] to checkout latest for all
\`bit checkout reset [component-pattern]\` => remove local modifications from the specified ids (or all components when --all is used). also, if a component dir is deleted from the filesystem, it'll be restored
when on a lane, "checkout head" only checks out components on this lane. to update main components, run "bit lane merge main"`;
  alias = 'U';
  options = [
    [
      'i',
      'interactive-merge',
      'when a component is modified and the merge process found conflicts, display options to resolve them',
    ],
    [
      'r',
      'auto-merge-resolve <merge-strategy>',
      'in case of merge conflict, resolve according to the provided strategy: [ours, theirs, manual]',
    ],
    [
      '',
      'manual',
      'same as "--auto-merge-resolve manual". in case of merge conflict, write the files with the conflict markers',
    ],
    ['a', 'all', 'all components'],
    [
      'e',
      'workspace-only',
      "only relevant for 'bit checkout head' when on a lane. don't import components from the remote lane that are not already in the workspace",
    ],
    ['v', 'verbose', 'showing verbose output for inspection'],
    ['x', 'skip-dependency-installation', 'do not auto-install dependencies of the imported components'],
    ['', 'force-ours', 'do not merge, preserve local files as is'],
    ['', 'force-theirs', 'do not merge, just overwrite with incoming files'],
  ] as CommandOptions;
  loader = true;

  constructor(private checkout: CheckoutMain) {}

  async report(
    [to, componentPattern]: [string, string],
    {
      interactiveMerge = false,
      forceOurs,
      forceTheirs,
      autoMergeResolve,
      manual,
      all = false,
      workspaceOnly = false,
      verbose = false,
      skipDependencyInstallation = false,
      revert = false,
    }: {
      interactiveMerge?: boolean;
      forceOurs?: boolean;
      forceTheirs?: boolean;
      autoMergeResolve?: MergeStrategy;
      manual?: boolean;
      all?: boolean;
      workspaceOnly?: boolean;
      verbose?: boolean;
      skipDependencyInstallation?: boolean;
      revert?: boolean;
    }
  ) {
    if (forceOurs && forceTheirs) {
      throw new BitError('please use either --force-ours or --force-theirs, not both');
    }
    if (
      autoMergeResolve &&
      autoMergeResolve !== 'ours' &&
      autoMergeResolve !== 'theirs' &&
      autoMergeResolve !== 'manual'
    ) {
      throw new BitError('--auto-merge-resolve must be one of the following: [ours, theirs, manual]');
    }
    if (manual) autoMergeResolve = 'manual';
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
      forceOurs,
      forceTheirs,
    };
    to = String(to); // it can be a number in case short-hash is used
    if (to === HEAD) checkoutProps.head = true;
    else if (to === LATEST) checkoutProps.latest = true;
    else if (to === 'reset') checkoutProps.reset = true;
    else if (to === 'main') checkoutProps.main = true;
    else if (to.startsWith(`${HEAD}~`)) {
      const ancestor = parseInt(to.split('~')[1]);
      if (Number.isNaN(ancestor))
        throw new BitError(`the character after "${HEAD}~" must be a number, got ${ancestor}`);
      checkoutProps.ancestor = ancestor;
    } else {
      if (!ComponentID.isValidVersion(to)) throw new BitError(`the specified version "${to}" is not a valid version`);
      checkoutProps.version = to;
    }

    const checkoutResults = await this.checkout.checkoutByCLIValues(componentPattern || '', checkoutProps);
    return checkoutOutput(checkoutResults, checkoutProps);
  }
}

export function checkoutOutput(
  checkoutResults: ApplyVersionResults,
  checkoutProps: CheckoutProps,
  alternativeTitle?: string
) {
  const {
    components,
    version,
    failedComponents,
    removedComponents,
    addedComponents,
    leftUnresolvedConflicts,
    workspaceConfigUpdateResult,
    newFromLane,
    newFromLaneAdded,
    installationError,
    compilationError,
  }: ApplyVersionResults = checkoutResults;

  const { head, reset, latest, main, revert, verbose, all } = checkoutProps;

  // components that failed for no legitimate reason. e.g. merge-conflict.
  const realFailedComponents = (failedComponents || []).filter((f) => !f.unchangedLegitimately);
  if (realFailedComponents.length) {
    throw new Error('checkout should throw in case of errors');
  }
  // components that weren't checked out for legitimate reasons, e.g. up-to-date.
  const notCheckedOutComponents = failedComponents || [];

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
      .map((failedComponent) => `${failedComponent.id.toString()} - ${failedComponent.unchangedMessage}`)
      .join('\n');
    return `${chalk.underline(title)}\n${body}`;
  };
  const getWsConfigUpdateLogs = () => {
    const logs = workspaceConfigUpdateResult?.logs;
    if (!logs || !logs.length) return '';
    const logsStr = logs.join('\n');
    return `${chalk.underline('verbose logs of workspace config update')}\n${logsStr}`;
  };
  const getConflictSummary = () => {
    if (!components || !components.length || !leftUnresolvedConflicts) return '';
    const title = `files with conflicts summary\n`;
    const suggestion = `\n\nfix the conflicts above manually and then run "bit install".
once ready, snap/tag the components to persist the changes`;
    const conflictSummary = conflictSummaryReport(components);
    return chalk.underline(title) + conflictSummary.conflictStr + chalk.yellow(suggestion);
  };
  const getSuccessfulOutput = () => {
    if (!components || !components.length) return '';
    const newLine = '\n';
    const switchedOrReverted = revert ? 'reverted' : 'switched';
    if (components.length === 1) {
      const component = components[0];
      const componentName = reset ? component.id.toString() : component.id.toStringWithoutVersion();
      if (reset) return `successfully reset ${chalk.bold(componentName)}\n`;
      const title =
        alternativeTitle ||
        `successfully ${switchedOrReverted} ${chalk.bold(componentName)} to version ${chalk.bold(
          // @ts-ignore version is defined when !reset
          head || latest ? component.id.version : version
        )}`;
      return chalk.bold(title) + newLine + applyVersionReport(components, false);
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
    const title =
      alternativeTitle || `successfully ${switchedOrReverted} ${components.length} components to ${versionOutput}`;
    const showVersion = head || reset;
    return chalk.bold(title) + newLine + applyVersionReport(components, true, showVersion);
  };
  const getNewOnLaneOutput = () => {
    if (!newFromLane?.length) return '';
    const title = newFromLaneAdded
      ? `successfully added the following components from the lane`
      : `the following components exist on the lane but were not added to the workspace. omit --workspace-only flag to add them`;
    const body = newFromLane.join('\n');
    return `${chalk.underline(title)}\n${body}`;
  };
  const getSummary = () => {
    const checkedOut = components?.length || 0;
    const notCheckedOutLegitimately = notCheckedOutComponents.length;
    const title = chalk.bold.underline('Summary');
    const checkedOutStr = `\nTotal Changed: ${chalk.bold(checkedOut.toString())}`;
    const unchangedLegitimatelyStr = `\nTotal Unchanged: ${chalk.bold(notCheckedOutLegitimately.toString())}`;
    const newOnLaneNum = newFromLane?.length || 0;
    const newOnLaneAddedStr = newFromLaneAdded ? ' (added)' : ' (not added)';
    const newOnLaneStr = newOnLaneNum
      ? `\nNew on lane${newOnLaneAddedStr}: ${chalk.bold(newOnLaneNum.toString())}`
      : '';

    return title + checkedOutStr + unchangedLegitimatelyStr + newOnLaneStr;
  };

  return compact([
    getWsConfigUpdateLogs(),
    getNotCheckedOutOutput(),
    getSuccessfulOutput(),
    getRemovedOutput(removedComponents),
    getAddedOutput(addedComponents),
    getNewOnLaneOutput(),
    getWorkspaceConfigUpdateOutput(workspaceConfigUpdateResult),
    getConflictSummary(),
    getSummary(),
    installationErrorOutput(installationError),
    compilationErrorOutput(compilationError),
  ]).join('\n\n');
}
