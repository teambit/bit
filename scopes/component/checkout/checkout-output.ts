import chalk from 'chalk';
import type { Report } from '@teambit/cli';
import {
  formatTitle,
  formatSection,
  formatItem,
  formatSuccessSummary,
  formatHint,
  formatDetailsHint,
  warnSymbol,
  joinSections,
} from '@teambit/cli/dist/output-formatter.js';
import type { ApplyVersionResults } from '@teambit/component.modules.merge-helper';
import {
  applyVersionReport,
  conflictSummaryReport,
  installationErrorOutput,
  compilationErrorOutput,
  getRemovedOutput,
  getAddedOutput,
  getWorkspaceConfigUpdateOutput,
} from '@teambit/component.modules.merge-helper/dist/merge-output.js';
import type { CheckoutProps } from './checkout.main.runtime';

export function checkoutOutput(
  checkoutResults: ApplyVersionResults,
  checkoutProps: CheckoutProps,
  alternativeTitle?: string
): string | Report {
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

  const hasSkippedComponents = notCheckedOutComponents.length > 0 && all && !verbose;

  const getNotCheckedOutOutputMinimal = () => {
    if (!notCheckedOutComponents.length) return '';
    if (all && !verbose) {
      return formatDetailsHint(`full list of ${notCheckedOutComponents.length} skipped component(s)`);
    }
    const items = notCheckedOutComponents.map((failedComponent) =>
      formatItem(`${failedComponent.id.toString()} - ${failedComponent.unchangedMessage}`)
    );
    return formatSection('checkout skipped', '', items);
  };

  const getNotCheckedOutOutputDetailed = () => {
    if (!notCheckedOutComponents.length) return '';
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
      return [formatSuccessSummary(title), applyVersionReport(components, false)].filter(Boolean).join('\n');
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
    return [formatSuccessSummary(title), applyVersionReport(components, true, showVersion)].filter(Boolean).join('\n');
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

  const buildOutput = (notCheckedOutSection: string) =>
    joinSections([
      getWsConfigUpdateLogs(),
      notCheckedOutSection,
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

  if (!hasSkippedComponents) {
    return buildOutput(getNotCheckedOutOutputMinimal());
  }

  const data = buildOutput(getNotCheckedOutOutputMinimal());
  const details = buildOutput(getNotCheckedOutOutputDetailed());
  return { data, code: 0, details };
}
