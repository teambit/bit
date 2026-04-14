import chalk from 'chalk';
import type { ComponentID } from '@teambit/component-id';
import type { SnapsDistance } from '@teambit/component.snap-distance';
import type { IssuesList } from '@teambit/component-issues';
import {
  IMPORT_PENDING_MSG,
  statusFailureMsg,
  statusWarningsMsg,
  statusInvalidComponentsMsg,
  statusWorkspaceIsCleanMsg,
  BASE_DOCS_DOMAIN,
} from '@teambit/legacy.constants';
import {
  formatSection,
  formatItem,
  formatTitle,
  bulletSymbol,
  successSymbol,
  warnSymbol,
  errorSymbol,
  joinSections,
} from '@teambit/cli';
import type { OutputSection } from '@teambit/cli';
import { countBy, groupBy, partition } from 'lodash';
import { isHash } from '@teambit/component-version';
import type { StatusResult } from './status.main.runtime';

const TROUBLESHOOTING_MESSAGE = chalk.yellow(
  `learn more about Bit components: ${BASE_DOCS_DOMAIN}reference/components/component-anatomy`
);

export type StatusFormatterOptions = {
  strict?: boolean;
  verbose?: boolean;
  warnings?: boolean;
  failOnError?: boolean;
};

export function formatStatusOutput(
  statusResult: StatusResult,
  options: StatusFormatterOptions = {}
): { data: string; code: number; sections?: OutputSection[] } {
  const { strict = false, verbose = false, warnings = false, failOnError = false } = options;

  const {
    newComponents,
    modifiedComponents,
    stagedComponents,
    componentsWithIssues,
    importPendingComponents,
    autoTagPendingComponents,
    invalidComponents,
    locallySoftRemoved,
    remotelySoftRemoved,
    outdatedComponents,
    mergePendingComponents,
    componentsDuringMergeState,
    softTaggedComponents,
    snappedComponents,
    pendingUpdatesFromMain,
    localOnly,
    updatesFromForked,
    unavailableOnMain,
    currentLaneId,
    forkedLaneId,
    workspaceIssues,
  } = statusResult;

  // If there is problem with at least one component we want to show a link to the
  // troubleshooting doc
  let showTroubleshootingLink = false;

  function format(
    id: ComponentID,
    showIssues = false,
    message?: string,
    localVersions?: string[],
    showSoftTagMsg = true,
    defaultSym?: string
  ): string {
    const idWithIssues = componentsWithIssues.find((c) => c.id.isEqual(id));
    const isSoftTagged = Boolean(softTaggedComponents.find((softTaggedId) => softTaggedId.isEqual(id)));
    const hasTagBlocker = idWithIssues?.issues.hasTagBlockerIssues();
    const isClean = !message && !idWithIssues;

    const getSymbol = () => {
      if (message) return warnSymbol;
      if (idWithIssues) return hasTagBlocker ? errorSymbol : warnSymbol;
      return defaultSym ?? bulletSymbol;
    };

    let idFormatted = formatItem(chalk.cyan(id.toStringWithoutVersion()), getSymbol());

    if (localVersions) {
      if (verbose) {
        idFormatted += ` - versions: ${localVersions.join(', ')}`;
      } else {
        const [snaps, tags] = partition(localVersions, (version) => isHash(version));
        const tagsStr = tags.length ? `versions: ${tags.join(', ')}` : '';
        const snapsStr = snaps.length ? `${snaps.length} snap(s)` : '';
        idFormatted += ' - ';
        idFormatted += tagsStr && snapsStr ? `${tagsStr}, ${snapsStr}` : tagsStr || snapsStr;
      }
    }

    if (showIssues && idWithIssues) {
      showTroubleshootingLink = true;
      const issuesTxt = hasTagBlocker ? statusFailureMsg : statusWarningsMsg;
      const issuesColor = hasTagBlocker ? 'red' : 'yellow';
      return `${idFormatted} ... ${chalk[issuesColor](issuesTxt)}${formatIssues(idWithIssues.issues)}`;
    }

    if (isClean) {
      const softTagSuffix = isSoftTagged && showSoftTagMsg ? chalk.green(' (soft-tagged)') : '';
      return `${idFormatted}${softTagSuffix}`;
    }

    const statusText = message || (hasTagBlocker ? statusFailureMsg : statusWarningsMsg);
    const statusColor: 'yellow' | 'red' = message ? 'yellow' : hasTagBlocker ? 'red' : 'yellow';
    const statusTextWithSoftTag = isSoftTagged && showSoftTagMsg ? `${statusText} (soft-tagged)` : statusText;
    return `${idFormatted} ... ${chalk[statusColor](statusTextWithSoftTag)}`;
  }

  const importPendingWarning = importPendingComponents.length ? chalk.yellow(`${IMPORT_PENDING_MSG}.\n`) : '';

  const newCompFormatted = newComponents.map((c) => format(c));
  const { missing, nonMissing } = groupBy(newCompFormatted, (component) => {
    return component.includes(statusFailureMsg) ? 'missing' : 'nonMissing';
  });

  const outdatedTitle = 'pending updates';
  const outdatedDesc =
    '(use "bit checkout head" to merge changes)\n(use "bit diff [component_id] [new_version]" to compare changes)\n(use "bit log [component_id]" to list all available versions)';
  const outdatedComps = outdatedComponents.map((component) => {
    const latest =
      component.latestVersion && component.latestVersion !== component.headVersion
        ? ` latest: ${component.latestVersion}`
        : '';
    return formatItem(
      `${chalk.cyan(component.id.toStringWithoutVersion())} current: ${component.id.version} head: ${component.headVersion}${latest}`,
      warnSymbol
    );
  });
  const outdatedStr = formatSection(outdatedTitle, outdatedDesc, outdatedComps);

  const pendingMergeTitle = 'pending merge';
  const pendingMergeDesc = `(use "bit reset" to discard local tags/snaps, and bit checkout head to re-merge with the remote.
alternatively, to keep local tags/snaps history, use "bit merge [component-id]")`;
  const pendingMergeComps = mergePendingComponents.map((component) => {
    return formatItem(
      `${chalk.cyan(component.id.toString())} local and remote have diverged and have ${component.divergeData.snapsOnSourceOnly.length} (source) and ${component.divergeData.snapsOnTargetOnly.length} (target) uncommon snaps respectively`,
      warnSymbol
    );
  });

  const pendingMergeStr = formatSection(pendingMergeTitle, pendingMergeDesc, pendingMergeComps);

  const compDuringMergeTitle = 'components in merge state';
  const compDuringMergeDesc = `(use "bit snap/tag [--unmerged]" to complete the merge process.
to cancel the merge operation, use either "bit lane merge-abort" (for prior "bit lane merge" command)
or use "bit merge [component-id] --abort" (for prior "bit merge" command)`;
  const compDuringMergeComps = componentsDuringMergeState.map((c) =>
    format(c, false, undefined, undefined, true, warnSymbol)
  );

  const compDuringMergeStr = formatSection(compDuringMergeTitle, compDuringMergeDesc, compDuringMergeComps);

  const newComponentDescription = '(use "bit snap/tag" to lock a version with all your changes)';
  const newComponentsOutput = formatSection('new components', newComponentDescription, [
    ...(nonMissing || []),
    ...(missing || []),
  ]);

  const modifiedDesc = '(use "bit diff" to compare changes)';
  const modifiedComponentOutput = formatSection(
    'modified components',
    modifiedDesc,
    modifiedComponents.map((c) => format(c))
  );

  const autoTagPendingDesc = '(these will be auto-tagged when their modified dependencies are tagged)';
  const autoTagPendingOutput = formatSection(
    'components pending auto-tag',
    autoTagPendingDesc,
    autoTagPendingComponents.map((c) => format(c))
  );

  const componentsWithIssuesToPrint = componentsWithIssues.filter((c) => c.issues.hasTagBlockerIssues() || warnings);
  const compWithIssuesDesc = '(fix the issues according to the suggested solution)';
  const compWithIssuesOutput = formatSection(
    'components with issues',
    compWithIssuesDesc,
    componentsWithIssuesToPrint.map((c) => format(c.id, true)).sort()
  );

  const invalidDesc = 'these components failed to load';
  const invalidComps = invalidComponents.map((c) => format(c.id, false, getInvalidComponentLabel(c.error))).sort();
  const invalidComponentOutput = formatSection(statusInvalidComponentsMsg, invalidDesc, invalidComps);

  const locallySoftRemovedDesc =
    '(tag/snap and export the components to update the deletion to the remote. to undo deletion, run "bit recover")';
  const locallySoftRemovedOutput = formatSection(
    'soft-removed components locally',
    locallySoftRemovedDesc,
    locallySoftRemoved.map((c) => format(c)).sort()
  );

  const remotelySoftRemovedDesc =
    '(use "bit remove" to remove them from the workspace. use "bit recover" to undo the deletion)';
  const remotelySoftRemovedOutput = formatSection(
    'components deleted on the remote',
    remotelySoftRemovedDesc,
    remotelySoftRemoved.map((c) => format(c)).sort()
  );

  const stagedDesc = '(use "bit export" to push these component versions to the remote scope)';
  const stagedComps = stagedComponents.map((c) => format(c.id, false, undefined, c.versions));
  const stagedComponentsOutput = formatSection('staged components', stagedDesc, stagedComps);

  const localOnlyDesc = '(these components are excluded from tag/snap/export commands)';
  const localOnlyComps = localOnly.map((c) => format(c)).sort();
  const localOnlyComponentsOutput = formatSection('local-only components', localOnlyDesc, localOnlyComps);

  const softTaggedDesc = '(use "bit tag --persist" to complete the tag)';
  const softTaggedComps = softTaggedComponents.map((id) => format(id, false, undefined, undefined, false));
  const softTaggedComponentsOutput = formatSection('soft-tagged components', softTaggedDesc, softTaggedComps);

  const snappedDesc = '(use "bit tag" or "bit tag --snapped" to lock a semver version)';
  const snappedComponentsOutput = formatSection(
    'snapped components (tag pending)',
    snappedDesc,
    snappedComponents.map((c) => format(c))
  );

  const unavailableOnMainDesc = '(use "bit checkout head" to make them available)';
  const unavailableOnMainOutput = formatSection(
    'components unavailable on main',
    unavailableOnMainDesc,
    unavailableOnMain.map((c) => format(c, false, undefined, undefined, true, warnSymbol))
  );

  const getUpdateFromMsg = (divergeData: SnapsDistance, from = 'main'): string => {
    if (divergeData.err) return divergeData.err.message;
    let msg = `${from} is ahead by ${divergeData.snapsOnTargetOnly.length || 0} snaps`;
    if (divergeData.snapsOnSourceOnly && verbose) {
      msg += ` (diverged since ${divergeData.commonSnapBeforeDiverge?.toShortString()})`;
    }
    return msg;
  };

  const updatesFromMainDesc = '(use "bit lane merge main" to merge the changes)';
  const pendingUpdatesFromMainIds = pendingUpdatesFromMain.map((c) =>
    format(c.id, false, getUpdateFromMsg(c.divergeData))
  );
  const updatesFromMainOutput = formatSection(
    'pending updates from main',
    updatesFromMainDesc,
    pendingUpdatesFromMainIds
  );

  let updatesFromForkedOutput = '';
  if (forkedLaneId) {
    const updatesFromForkedDesc = `(use "bit lane merge ${forkedLaneId.toString()}" to merge the changes
use "bit fetch ${forkedLaneId.toString()} --lanes" to update ${forkedLaneId.name} locally)`;
    const pendingUpdatesFromForkedIds = updatesFromForked.map((c) =>
      format(c.id, false, getUpdateFromMsg(c.divergeData, forkedLaneId.name))
    );
    updatesFromForkedOutput = formatSection(
      `updates from ${forkedLaneId.name}`,
      updatesFromForkedDesc,
      pendingUpdatesFromForkedIds
    );
  }

  const getLaneStr = () => {
    if (currentLaneId.isDefault()) return '';
    const prefix = `\n\ncurrent lane ${chalk.bold(currentLaneId.toString())}`;
    return prefix;
  };

  const getWorkspaceIssuesOutput = () => {
    if (!workspaceIssues.length) return '';
    const title = formatTitle('workspace issues');
    const issues = workspaceIssues.join('\n');
    return `\n\n${title}\n${issues}`;
  };

  const troubleshootingStr = showTroubleshootingLink ? `\n${TROUBLESHOOTING_MESSAGE}` : '';
  const wereWarningsFilteredOut = componentsWithIssuesToPrint.length < componentsWithIssues.length;
  const showWarningsStr = wereWarningsFilteredOut
    ? `\n${chalk.yellow('to view the warnings, use --warnings flag.')}`
    : '';

  const statusMsg =
    importPendingWarning +
    joinSections([
      outdatedStr,
      pendingMergeStr,
      updatesFromMainOutput,
      updatesFromForkedOutput,
      compDuringMergeStr,
      localOnlyComponentsOutput,
      newComponentsOutput,
      modifiedComponentOutput,
      snappedComponentsOutput,
      stagedComponentsOutput,
      softTaggedComponentsOutput,
      unavailableOnMainOutput,
      autoTagPendingOutput,
      compWithIssuesOutput,
      invalidComponentOutput,
      locallySoftRemovedOutput,
      remotelySoftRemovedOutput,
    ]) +
    showWarningsStr +
    troubleshootingStr;

  const results =
    (statusMsg || `${successSymbol()} ${chalk.yellow(statusWorkspaceIsCleanMsg)}`) +
    getWorkspaceIssuesOutput() +
    getLaneStr();

  // Determine exit code based on flags
  let exitCode = 0;
  if (strict && componentsWithIssues.length > 0) {
    // Strict mode: fail on any issues (both errors and warnings)
    exitCode = 1;
  } else if (failOnError) {
    // Fail only on tag blocker issues (errors), not warnings
    const hasTagBlockerIssues = componentsWithIssues.some((c) => c.issues.hasTagBlockerIssues());
    if (hasTagBlockerIssues) {
      exitCode = 1;
    }
  }

  // Build structured sections for interactive rendering
  const sections: OutputSection[] = [];
  if (importPendingWarning) {
    sections.push({ content: importPendingWarning.trimEnd() });
  }

  const sectionEntries: Array<{ content: string; autoTag?: boolean }> = [
    { content: outdatedStr },
    { content: pendingMergeStr },
    { content: updatesFromMainOutput },
    { content: updatesFromForkedOutput },
    { content: compDuringMergeStr },
    { content: localOnlyComponentsOutput },
    { content: newComponentsOutput },
    { content: modifiedComponentOutput },
    { content: snappedComponentsOutput },
    { content: stagedComponentsOutput },
    { content: softTaggedComponentsOutput },
    { content: unavailableOnMainOutput },
    { content: autoTagPendingOutput, autoTag: true },
    { content: compWithIssuesOutput },
    { content: invalidComponentOutput },
    { content: locallySoftRemovedOutput },
    { content: remotelySoftRemovedOutput },
  ];

  for (const entry of sectionEntries) {
    if (!entry.content) continue;
    if (entry.autoTag) {
      const count = autoTagPendingComponents.length;
      const scopeCounts = countBy(autoTagPendingComponents, (id) => id.scope);
      const sorted = Object.entries(scopeCounts).sort(([, a], [, b]) => b - a);
      const MAX_SHOWN = 4;
      const shown = sorted.slice(0, MAX_SHOWN).map(([scope, n]) => `${scope} (${n})`);
      const remaining = sorted.length - MAX_SHOWN;
      const scopeLine = remaining > 0 ? [...shown, `+ ${remaining} more scopes`].join(' · ') : shown.join(' · ');
      const title = formatTitle(`components pending auto-tag (${count})`);
      const desc = chalk.dim(`  ${autoTagPendingDesc}`);
      const scopes = `   ${scopeLine}`;
      const hint = chalk.dim('— use --expand to list');
      sections.push({
        content: entry.content,
        collapsible: {
          summary: `${title}\n${desc}\n${scopes}  ${hint}`,
        },
      });
    } else {
      sections.push({ content: entry.content });
    }
  }

  const suffixParts = [showWarningsStr.trim(), troubleshootingStr.trim()].filter(Boolean);
  if (suffixParts.length) sections.push({ content: suffixParts.join('\n') });

  const wsIssuesStr = getWorkspaceIssuesOutput().trim();
  if (wsIssuesStr) sections.push({ content: wsIssuesStr });

  const laneInfoStr = getLaneStr().trim();
  if (laneInfoStr) sections.push({ content: laneInfoStr });

  if (!sections.length) {
    sections.push({ content: `${successSymbol()} ${chalk.yellow(statusWorkspaceIsCleanMsg)}` });
  }

  return {
    data: results,
    code: exitCode,
    sections,
  };
}

export function formatIssues(issues: IssuesList) {
  return `       ${issues?.outputForCLI()}\n`;
}

function getInvalidComponentLabel(error: Error) {
  switch (error.name) {
    case 'MainFileRemoved':
      return 'main-file was removed (use "bit add" with "--main" and "--id" flags to add a main file)';
    case 'ComponentNotFoundInPath':
      return 'component files were deleted (use "bit remove [component_id]") or moved (use "bit move <old-dir> <new-dir>"). to restore use "bit checkout reset [component_id]"';
    case 'ExtensionFileNotFound':
      // @ts-ignore error.path is set for ExtensionFileNotFound
      return `extension file is missing at ${chalk.bold(error.path)}`;
    case 'ComponentsPendingImport':
      return 'component objects are missing from the scope (use "bit import [component_id] --objects" to get them back)';
    case 'NoComponentDir':
      return `component files were added individually without root directory (invalid on Harmony. re-add as a directory or use "bit move --component" to help with the move)`;
    case 'IgnoredDirectory':
      return `component files or directory were ignored (probably by .gitignore)`;
    case 'NoCommonSnap':
      return `component history is unrelated to main (merge main with --resolve-unrelated flag)`;
    default:
      return error.name;
  }
}
