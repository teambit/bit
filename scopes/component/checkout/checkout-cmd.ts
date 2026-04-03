import chalk from 'chalk';
import type { Command, CommandOptions } from '@teambit/cli';
import {
  formatTitle,
  formatSection,
  formatItem,
  formatSuccessSummary,
  formatHint,
  warnSymbol,
  joinSections,
} from '@teambit/cli';
import type { ApplyVersionResults, MergeStrategy } from '@teambit/component.modules.merge-helper';
import {
  applyVersionReport,
  conflictSummaryReport,
  installationErrorOutput,
  compilationErrorOutput,
  getRemovedOutput,
  getAddedOutput,
  getWorkspaceConfigUpdateOutput,
} from '@teambit/component.modules.merge-helper';
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
        "permitted values: `[head, latest, reset, {specific-version}, {head~x}]`. 'head' - last snap/tag. 'latest' - semver latest tag. 'reset' - removes local changes",
    },
    {
      name: 'component-pattern',
      description: COMPONENT_PATTERN_HELP,
    },
  ];
  description = 'switch between component versions or remove local changes';
  helpUrl = 'reference/components/merging-changes#checkout-snaps-to-the-working-directory';
  group = 'version-control';
  extendedDescription = `checkout components to specified versions or remove local changes. most commonly used as 'bit checkout head' to get latest versions.
the \`<to>\` argument accepts these values:
- head: checkout to last snap/tag (most common usage)
- specific version: checkout to exact version (e.g. 'bit checkout 1.0.5 component-name')
- head~x: go back x generations from head (e.g. 'head~2' for two versions back)
- latest: checkout to latest semver tag
- reset: remove local modifications and restore original files (also restores deleted component directories)
when on lanes, 'checkout head' only affects lane components. to update main components, run 'bit lane merge main'.`;
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
    [
      '',
      'include-new-from-scope',
      "relevant for 'bit checkout head'. import components from the defaultScope that don't exist in the workspace",
    ],
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
      includeNewFromScope = false,
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
      includeNewFromScope?: boolean;
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
    if (includeNewFromScope && to !== HEAD) {
      throw new BitError('--include-new-from-scope is only relevant when running "bit checkout head"');
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
      includeNewFromScope,
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
    newFromScope,
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
      return formatHint(
        `checkout was not needed for ${notCheckedOutComponents.length} components (use --verbose to get more details)`
      );
    }
    const items = notCheckedOutComponents.map((failedComponent) =>
      formatItem(`${failedComponent.id.toString()} - ${failedComponent.unchangedMessage}`)
    );
    return formatSection('checkout skipped', '', items);
  };
  const getWsConfigUpdateLogs = () => {
    const logs = workspaceConfigUpdateResult?.logs;
    if (!logs || !logs.length) return '';
    const logsStr = logs.join('\n');
    return `${formatTitle('verbose logs of workspace config update')}\n${logsStr}`;
  };
  const getConflictSummary = () => {
    if (!components || !components.length || !leftUnresolvedConflicts) return '';
    const title = formatTitle(`${warnSymbol} files with conflicts summary`);
    const conflictSummary = conflictSummaryReport(components);
    const suggestion = formatHint(
      `fix the conflicts above manually and then run "bit install".\nonce ready, snap/tag the components to persist the changes`
    );
    return `${title}\n${conflictSummary.conflictStr}\n\n${suggestion}`;
  };
  const getSuccessfulOutput = () => {
    if (!components || !components.length) return '';
    const switchedOrReverted = revert ? 'reverted' : 'switched';
    if (components.length === 1) {
      const component = components[0];
      const componentName = reset ? component.id.toString() : component.id.toStringWithoutVersion();
      if (reset) return formatSuccessSummary(`successfully reset ${chalk.bold(componentName)}`);
      const title =
        alternativeTitle ||
        `successfully ${switchedOrReverted} ${chalk.bold(componentName)} to version ${chalk.bold(
          head || latest ? component.id.version : version
        )}`;
      return formatSuccessSummary(title) + '\n' + applyVersionReport(components, false);
    }
    if (reset) {
      const items = components.map((component) => formatItem(component.id.toString()));
      return formatSection('reset components', '', items);
    }
    const getVerOutput = () => {
      if (head) return 'their head version';
      if (latest) return 'their latest version';
      if (main) return 'their main version';
      return `version ${chalk.bold(version)}`;
    };
    const versionOutput = getVerOutput();
    const title =
      alternativeTitle || `successfully ${switchedOrReverted} ${components.length} components to ${versionOutput}`;
    const showVersion = head || reset;
    return formatSuccessSummary(title) + '\n' + applyVersionReport(components, true, showVersion);
  };
  const getNewOnLaneOutput = () => {
    if (!newFromLane?.length) return '';
    const title = newFromLaneAdded ? 'new components from lane' : 'new components on lane (not added)';
    const desc = newFromLaneAdded ? '' : 'omit --workspace-only flag to add them';
    const items = newFromLane.map((c) => formatItem(c.toString()));
    return formatSection(title, desc, items);
  };
  const getNewFromScopeOutput = () => {
    if (!newFromScope?.length) return '';
    const items = newFromScope.map((c) => formatItem(c.toString()));
    return formatSection('new components from scope', '', items);
  };
  const getSummary = () => {
    const checkedOut = components?.length || 0;
    const notCheckedOutLegitimately = notCheckedOutComponents.length;
    const title = formatTitle('Checkout Summary');
    const checkedOutStr = `\nTotal Changed: ${chalk.bold(checkedOut.toString())}`;
    const unchangedLegitimatelyStr = `\nTotal Unchanged: ${chalk.bold(notCheckedOutLegitimately.toString())}`;
    const newOnLaneNum = newFromLane?.length || 0;
    const newOnLaneAddedStr = newFromLaneAdded ? ' (added)' : ' (not added)';
    const newOnLaneStr = newOnLaneNum
      ? `\nNew on lane${newOnLaneAddedStr}: ${chalk.bold(newOnLaneNum.toString())}`
      : '';
    const newFromScopeNum = newFromScope?.length || 0;
    const newFromScopeStr = newFromScopeNum
      ? `\nNew from scope (imported): ${chalk.bold(newFromScopeNum.toString())}`
      : '';

    return title + checkedOutStr + unchangedLegitimatelyStr + newOnLaneStr + newFromScopeStr;
  };

  return joinSections([
    getWsConfigUpdateLogs(),
    getNotCheckedOutOutput(),
    getSuccessfulOutput(),
    getRemovedOutput(removedComponents),
    getAddedOutput(addedComponents),
    getNewOnLaneOutput(),
    getNewFromScopeOutput(),
    getWorkspaceConfigUpdateOutput(workspaceConfigUpdateResult),
    getConflictSummary(),
    getSummary(),
    installationErrorOutput(installationError),
    compilationErrorOutput(compilationError),
  ]);
}
