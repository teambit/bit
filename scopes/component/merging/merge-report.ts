import chalk from 'chalk';
import type { Report } from '@teambit/cli';
import {
  warnSymbol,
  errorSymbol,
  formatTitle,
  formatSection,
  formatItem,
  formatHint,
  formatDetailsHint,
  joinSections,
} from '@teambit/cli/dist/output-formatter.js';
import { AUTO_SNAPPED_MSG, MergeConfigFilename } from '@teambit/legacy.constants';
import type { ConfigMergeResult } from '@teambit/config-merger';
import type { ApplyVersionResults } from '@teambit/component.modules.merge-helper';
import {
  applyVersionReport,
  conflictSummaryReport,
  getRemovedOutput,
  getWorkspaceConfigUpdateOutput,
} from '@teambit/component.modules.merge-helper/dist/merge-output.js';
import { compHasBeenRemovedMsg } from './merge-messages';

export function mergeReport({
  components,
  failedComponents,
  removedComponents,
  version,
  mergeSnapResults,
  mergeSnapError,
  leftUnresolvedConflicts,
  verbose,
  configMergeResults,
  workspaceConfigUpdateResult,
}: ApplyVersionResults & { configMergeResults?: ConfigMergeResult[] }): string | Report {
  const getSuccessOutput = () => {
    if (!components || !components.length) return '';
    const title = formatTitle(
      `successfully merged ${components.length} components${version ? ` from version ${chalk.bold(version)}` : ''}`
    );
    const fileChangesReport = applyVersionReport(components);

    return fileChangesReport ? `${title}\n${fileChangesReport}` : title;
  };

  let componentsWithConflicts = 0;
  const getConflictSummary = () => {
    if (!components || !components.length || !leftUnresolvedConflicts) return '';
    const title = formatTitle(`${warnSymbol} files with conflicts summary`);
    const conflictSummary = conflictSummaryReport(components);
    componentsWithConflicts = conflictSummary.conflictedComponents;
    const suggestion = formatHint(
      `merge process not completed due to the conflicts above. fix conflicts manually and then run "bit install".\nonce ready, snap/tag the components to complete the merge.`
    );
    return `${title}\n${conflictSummary.conflictStr}\n\n${suggestion}`;
  };

  const configMergeWithConflicts = configMergeResults?.filter((c) => c.hasConflicts()) || [];
  const getConfigMergeConflictSummary = () => {
    if (!configMergeWithConflicts.length) return '';
    const comps = configMergeWithConflicts.map((c) => c.compIdStr).join('\n');
    const title = formatTitle(`${warnSymbol} components with config-merge conflicts`);
    const suggestion = formatHint(
      `conflicts were found while trying to merge the config. fix them manually by editing the ${MergeConfigFilename} file in the workspace root.\nonce ready, snap/tag the components to complete the merge.`
    );
    return `${title}\n${comps}\n${suggestion}`;
  };

  const getSnapsOutput = () => {
    if (mergeSnapError) {
      return `${formatTitle(`${errorSymbol} snap error`)}\n${chalk.red(
        'snapping merged components failed with the following error, please fix the issues and snap manually'
      )}\n${mergeSnapError.message}`;
    }
    if (!mergeSnapResults || !mergeSnapResults.snappedComponents) return '';
    const { snappedComponents, autoSnappedResults } = mergeSnapResults;
    const items = snappedComponents.map((component) => {
      let line = formatItem(component.id.toString());
      const autoTag = autoSnappedResults.filter((result) => result.triggeredBy.searchWithoutVersion(component.id));
      if (autoTag.length) {
        const autoTagComp = autoTag.map((a) => a.component.id.toString());
        line += `\n       ${AUTO_SNAPPED_MSG}: ${autoTagComp.join(', ')}`;
      }
      return line;
    });
    return formatSection('merge-snapped components', 'components snapped as a result of the merge', items);
  };

  const getSkippedRemovedOutput = () => {
    if (!failedComponents || !failedComponents.length) return '';
    const skippedRemoved = failedComponents.filter((fc) => fc.unchangedMessage === compHasBeenRemovedMsg);
    if (!skippedRemoved.length) return '';
    const items = skippedRemoved.map((fc) => formatItem(chalk.bold(fc.id.toString()), warnSymbol));
    const section = formatSection('merge skipped - soft-removed', '', items);
    const hint = formatHint('use "bit recover <component-id>" to restore, then re-run the merge');
    return `${section}\n${hint}`;
  };

  const otherSkippedComponents = (failedComponents || []).filter((fc) => fc.unchangedMessage !== compHasBeenRemovedMsg);
  const hasSkippedComponents = otherSkippedComponents.length > 0 && !verbose;

  const getFailureOutputMinimal = () => {
    if (!hasSkippedComponents) return '';
    return formatDetailsHint(`full list of ${otherSkippedComponents.length} skipped component(s)`);
  };

  const getFailureOutputDetailed = () => {
    if (!otherSkippedComponents.length) return '';
    const items = otherSkippedComponents.map((failedComponent) =>
      formatItem(`${chalk.bold(failedComponent.id.toString())} - ${failedComponent.unchangedMessage}`)
    );
    return formatSection('merge skipped', '', items);
  };

  const getSummary = () => {
    const merged = components?.length || 0;
    const unchangedLegitimately = failedComponents?.filter((f) => f.unchangedLegitimately).length || 0;
    const autoSnapped =
      (mergeSnapResults?.snappedComponents.length || 0) + (mergeSnapResults?.autoSnappedResults.length || 0);
    const getConflictStr = () => {
      const comps = componentsWithConflicts ? `${componentsWithConflicts} components` : '';
      const ws = workspaceConfigUpdateResult?.workspaceDepsConflicts ? 'workspace.jsonc file' : '';
      const mergeConfig = configMergeWithConflicts.length ? `${MergeConfigFilename} file` : '';
      return [comps, ws, mergeConfig].filter(Boolean).join(', ');
    };

    const title = formatTitle('Merge Summary');
    const mergedStr = `\nTotal Merged: ${chalk.bold(merged.toString())}`;
    const unchangedLegitimatelyStr = `\nTotal Unchanged: ${chalk.bold(unchangedLegitimately.toString())}`;
    const autoSnappedStr = `\nTotal Snapped: ${chalk.bold(autoSnapped.toString())}`;
    const removedStr = `\nTotal Removed: ${chalk.bold(removedComponents?.length.toString() || '0')}`;
    const conflictStr = `\nConflicts: ${chalk.bold(getConflictStr() || 'none')}`;

    return title + mergedStr + unchangedLegitimatelyStr + autoSnappedStr + removedStr + conflictStr;
  };

  const commonSections = () => [getSuccessOutput(), getSkippedRemovedOutput()];
  const tailSections = () => [
    getRemovedOutput(removedComponents),
    getSnapsOutput(),
    getConfigMergeConflictSummary(),
    getWorkspaceConfigUpdateOutput(workspaceConfigUpdateResult),
    getConflictSummary(),
    getSummary(),
  ];

  // when --verbose is passed or no skipped components, show detailed output inline
  if (!hasSkippedComponents) {
    return joinSections([...commonSections(), getFailureOutputDetailed(), ...tailSections()]);
  }

  const data = joinSections([...commonSections(), getFailureOutputMinimal(), ...tailSections()]);
  const details = joinSections([...commonSections(), getFailureOutputDetailed(), ...tailSections()]);
  return { data, code: 0, details };
}
