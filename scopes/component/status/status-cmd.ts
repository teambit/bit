import chalk from 'chalk';
import R from 'ramda';
import { Command, CommandOptions } from '@teambit/cli';
import { ComponentID } from '@teambit/component-id';
import { SnapsDistance } from '@teambit/legacy/dist/scope/component-ops/snaps-distance';
import { immutableUnshift } from '@teambit/legacy/dist/utils';
import { IssuesList } from '@teambit/component-issues';
import { formatBitString } from '@teambit/legacy/dist/cli/chalk-box';
import { getInvalidComponentLabel } from '@teambit/legacy/dist/cli/templates/component-issues-template';
import {
  BASE_DOCS_DOMAIN,
  IMPORT_PENDING_MSG,
  statusFailureMsg,
  statusInvalidComponentsMsg,
  statusWorkspaceIsCleanMsg,
} from '@teambit/legacy/dist/constants';
import { compact, partition } from 'lodash';
import { isHash } from '@teambit/component-version';
import { StatusMain, StatusResult } from './status.main.runtime';

const TROUBLESHOOTING_MESSAGE = `${chalk.yellow(
  `learn more at https://${BASE_DOCS_DOMAIN}/components/adding-components`
)}`;

export class StatusCmd implements Command {
  name = 'status';
  description = 'present the current status of components in the workspace, including indication of detected issues';
  group = 'development';
  extendedDescription: string;
  alias = 's';
  options = [
    ['j', 'json', 'return a json version of the component'],
    ['', 'verbose', 'show extra data: full snap hashes for staged components, and divergence point for lanes'],
    ['l', 'lanes', 'when on a lane, show updates from main and updates from forked lanes'],
    ['', 'strict', 'in case issues found, exit with code 1'],
  ] as CommandOptions;
  loader = true;
  migration = true;

  constructor(private status: StatusMain) {}

  async json(_args, { lanes }: { lanes?: boolean }) {
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
      unavailableOnMain,
      pendingUpdatesFromMain,
      updatesFromForked,
      currentLaneId,
      forkedLaneId,
      workspaceIssues,
    }: StatusResult = await this.status.status({ lanes });
    return {
      newComponents: newComponents.map((c) => c.toStringWithoutVersion()),
      modifiedComponents: modifiedComponents.map((c) => c.toStringWithoutVersion()),
      stagedComponents: stagedComponents.map((c) => ({ id: c.id.toStringWithoutVersion(), versions: c.versions })),
      unavailableOnMain: unavailableOnMain.map((c) => c.toStringWithoutVersion()),
      componentsWithIssues: componentsWithIssues.map((c) => ({
        id: c.id.toStringWithoutVersion(),
        issues: c.issues?.toObject(),
      })),
      importPendingComponents: importPendingComponents.map((id) => id.toStringWithoutVersion()),
      autoTagPendingComponents: autoTagPendingComponents.map((s) => s.toStringWithoutVersion()),
      invalidComponents,
      locallySoftRemoved: locallySoftRemoved.map((id) => id.toStringWithoutVersion()),
      remotelySoftRemoved: remotelySoftRemoved.map((id) => id.toStringWithoutVersion()),
      outdatedComponents: outdatedComponents.map((c) => ({ ...c, id: c.id.toStringWithoutVersion() })),
      mergePendingComponents: mergePendingComponents.map((c) => c.id.toStringWithoutVersion()),
      componentsDuringMergeState: componentsDuringMergeState.map((id) => id.toStringWithoutVersion()),
      softTaggedComponents: softTaggedComponents.map((s) => s.toStringWithoutVersion()),
      snappedComponents: snappedComponents.map((s) => s.toStringWithoutVersion()),
      pendingUpdatesFromMain: pendingUpdatesFromMain.map((p) => ({
        id: p.id.toStringWithoutVersion(),
        divergeData: p.divergeData,
      })),
      updatesFromForked: updatesFromForked.map((p) => ({
        id: p.id.toStringWithoutVersion(),
        divergeData: p.divergeData,
      })),
      currentLaneId,
      forkedLaneId,
      workspaceIssues,
    };
  }

  // eslint-disable-next-line complexity
  async report(_args, { strict, verbose, lanes }: { strict?: boolean; verbose?: boolean; lanes?: boolean }) {
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
      updatesFromForked,
      unavailableOnMain,
      currentLaneId,
      forkedLaneId,
      workspaceIssues,
    }: StatusResult = await this.status.status({ lanes });
    // If there is problem with at least one component we want to show a link to the
    // troubleshooting doc
    let showTroubleshootingLink = false;

    function format(id: ComponentID, showIssues = false, message?: string, localVersions?: string[]): string {
      const idWithIssues = componentsWithIssues.find((c) => c.id.isEqual(id));
      const softTagged = softTaggedComponents.find((softTaggedId) => softTaggedId.isEqual(id));

      const messageStatusText = message || 'ok';
      const messageStatusTextWithSoftTag = softTagged ? `${messageStatusText} (soft-tagged)` : messageStatusText;
      const color = message ? 'yellow' : 'green';
      const messageStatus = chalk[color](messageStatusTextWithSoftTag);

      if (!showIssues) {
        return `${formatBitString(id.toStringWithoutVersion())} ... ${messageStatus}`;
      }
      let bitFormatted = `${formatBitString(id.toStringWithoutVersion())}`;
      if (localVersions) {
        if (verbose) {
          bitFormatted += `. versions: ${localVersions.join(', ')}`;
        } else {
          const [snaps, tags] = partition(localVersions, (version) => isHash(version));
          const tagsStr = tags.length ? `versions: ${tags.join(', ')}` : '';
          const snapsStr = snaps.length ? `${snaps.length} snap(s)` : '';
          bitFormatted += `. `;
          bitFormatted += tagsStr && snapsStr ? `${tagsStr}. and ${snapsStr}` : tagsStr || snapsStr;
        }
      }
      bitFormatted += ' ... ';
      if (!idWithIssues) return `${bitFormatted}${messageStatus}`;
      showTroubleshootingLink = true;
      return `${bitFormatted} ${chalk.red(statusFailureMsg)}${formatIssues(idWithIssues.issues)}`;
    }

    const importPendingWarning = importPendingComponents.length ? chalk.yellow(`${IMPORT_PENDING_MSG}.\n`) : '';

    const splitByMissing = R.groupBy((component) => {
      return component.includes(statusFailureMsg) ? 'missing' : 'nonMissing';
    });
    const { missing, nonMissing } = splitByMissing(newComponents.map((c) => format(c, true)));

    const outdatedTitle = chalk.underline.white('pending updates');
    const outdatedDesc =
      '(use "bit checkout head" to merge changes)\n(use "bit diff [component_id] [new_version]" to compare changes)\n(use "bit log [component_id]" to list all available versions)\n';
    const outdatedComps = outdatedComponents
      .map((component) => {
        const latest =
          component.latestVersion && component.latestVersion !== component.headVersion
            ? ` latest: ${component.latestVersion}`
            : '';
        return `    > ${chalk.cyan(component.id.toStringWithoutVersion())} current: ${component.id.version} head: ${
          component.headVersion
        }${latest}\n`;
      })
      .join('');

    const outdatedStr = outdatedComponents.length ? [outdatedTitle, outdatedDesc, outdatedComps].join('\n') : '';

    const pendingMergeTitle = chalk.underline.white('pending merge');
    const pendingMergeDesc = `(use "bit reset" to add local changes on top of the remote and discard local tags/snaps.
alternatively, to keep local tags/snaps history, use "bit merge [component-id]")\n`; // @davidF how does bit reset add local changes on top of remote?
    const pendingMergeComps = mergePendingComponents
      .map((component) => {
        return `    > ${chalk.cyan(component.id.toString())} local and remote have diverged and have ${
          component.divergeData.snapsOnSourceOnly.length
        } (source) and ${component.divergeData.snapsOnTargetOnly.length} (target) uncommon snaps respectively\n`;
      })
      .join('');

    const pendingMergeStr = pendingMergeComps.length
      ? [pendingMergeTitle, pendingMergeDesc, pendingMergeComps].join('\n')
      : '';

    const compDuringMergeTitle = chalk.underline.white('components in merge state');
    const compDuringMergeDesc = `(use "bit snap/tag [--unmerged]" to complete the merge process.
to cancel the merge operation, use either "bit lane merge-abort" (for prior "bit lane merge" command)
or use "bit merge [component-id] --abort" (for prior "bit merge" command)\n`;
    const compDuringMergeComps = componentsDuringMergeState.map((c) => format(c, true)).join('\n');

    const compDuringMergeStr = compDuringMergeComps.length
      ? [compDuringMergeTitle, compDuringMergeDesc, compDuringMergeComps].join('\n')
      : '';

    const newComponentDescription = '\n(use "bit snap/tag" to lock a version with all your changes)\n';
    const newComponentsTitle = newComponents.length
      ? chalk.underline.white('new components') + newComponentDescription
      : '';

    const newComponentsOutput = [newComponentsTitle, ...(nonMissing || []), ...(missing || [])].join('\n');

    const modifiedDesc = '(use "bit diff" to compare changes)\n';
    const modifiedComponentOutput = immutableUnshift(
      modifiedComponents.map((c) => format(c, true)),
      modifiedComponents.length
        ? chalk.underline.white('modified components') + newComponentDescription + modifiedDesc
        : ''
    ).join('\n');

    const autoTagPendingOutput = immutableUnshift(
      autoTagPendingComponents.map((c) => format(c)),
      autoTagPendingComponents.length
        ? chalk.underline.white('components pending auto-tag (when their modified dependencies are tagged)')
        : ''
    ).join('\n');

    const invalidDesc = '\nthese components failed to load.\n';
    const invalidComponentOutput = immutableUnshift(
      invalidComponents.map((c) => format(c.id, false, getInvalidComponentLabel(c.error))).sort(),
      invalidComponents.length ? chalk.underline.white(statusInvalidComponentsMsg) + invalidDesc : ''
    ).join('\n');

    const locallySoftRemovedDesc =
      '\n(tag/snap and export the components to update the deletion to the remote. to undo deletion, run "bit recover")\n';
    const locallySoftRemovedOutput = immutableUnshift(
      locallySoftRemoved.map((c) => format(c)).sort(),
      locallySoftRemoved.length ? chalk.underline.white('soft-removed components locally') + locallySoftRemovedDesc : ''
    ).join('\n');

    const remotelySoftRemovedDesc =
      '\n(use "bit remove" to remove them from the workspace. use "bit recover" to undo the soft-remove)\n';
    const remotelySoftRemovedOutput = immutableUnshift(
      remotelySoftRemoved.map((c) => format(c)).sort(),
      remotelySoftRemoved.length
        ? chalk.underline.white('components soft-removed on the remote') + remotelySoftRemovedDesc
        : ''
    ).join('\n');

    const stagedDesc = '\n(use "bit export" to push these component versions to the remote scope)\n';
    const stagedComponentsOutput = immutableUnshift(
      stagedComponents.map((c) => format(c.id, true, undefined, c.versions)),
      stagedComponents.length ? chalk.underline.white('staged components') + stagedDesc : ''
    ).join('\n');

    const snappedDesc = '\n(use "bit tag" or "bit tag --snapped" to lock a semver version)\n';
    const snappedComponentsOutput = immutableUnshift(
      snappedComponents.map((c) => format(c)),
      snappedComponents.length ? chalk.underline.white('snapped components (tag pending)') + snappedDesc : ''
    ).join('\n');

    const unavailableOnMainDesc = '\n(use "bit checkout head" to make them available)\n';
    const unavailableOnMainOutput = immutableUnshift(
      unavailableOnMain.map((c) => format(c)),
      unavailableOnMain.length ? chalk.underline.white('components unavailable on main') + unavailableOnMainDesc : ''
    ).join('\n');

    const getUpdateFromMsg = (divergeData: SnapsDistance, from = 'main'): string => {
      if (divergeData.err) return divergeData.err.message;
      let msg = `${from} is ahead by ${divergeData.snapsOnTargetOnly.length || 0} snaps`;
      if (divergeData.snapsOnSourceOnly && verbose) {
        msg += ` (diverged since ${divergeData.commonSnapBeforeDiverge?.toShortString()})`;
      }
      return msg;
    };

    let updatesFromMainOutput = '';

    const updatesFromMainDesc = '\n(use "bit lane merge main" to merge the changes)\n';
    const pendingUpdatesFromMainIds = pendingUpdatesFromMain.map((c) =>
      format(c.id, false, getUpdateFromMsg(c.divergeData))
    );
    updatesFromMainOutput = [
      pendingUpdatesFromMain.length ? chalk.underline.white('pending updates from main') + updatesFromMainDesc : '',
      ...pendingUpdatesFromMainIds,
    ].join('\n');

    let updatesFromForkedOutput = '';
    if (forkedLaneId) {
      const updatesFromForkedDesc = `\n(use "bit lane merge ${forkedLaneId.toString()}" to merge the changes
use "bit fetch ${forkedLaneId.toString()} --lanes" to update ${forkedLaneId.name} locally)\n`;
      const pendingUpdatesFromForkedIds = updatesFromForked.map((c) =>
        format(c.id, false, getUpdateFromMsg(c.divergeData, forkedLaneId.name))
      );
      updatesFromForkedOutput = [
        updatesFromForked.length
          ? chalk.underline.white(`updates from ${forkedLaneId.name}`) + updatesFromForkedDesc
          : '',
        ...pendingUpdatesFromForkedIds,
      ].join('\n');
    }

    const getLaneStr = () => {
      if (currentLaneId.isDefault()) return '';
      const prefix = `\n\ncurrent lane ${chalk.bold(currentLaneId.toString())}`;
      if (lanes) return prefix;
      return `${prefix}\nconsider adding "--lanes" flag to see updates from main/forked`;
    };

    const getWorkspaceIssuesOutput = () => {
      if (!workspaceIssues.length) return '';
      const title = chalk.underline.white('workspace issues');
      const issues = workspaceIssues.join('\n');
      return `\n\n${title}\n${issues}`;
    };

    const troubleshootingStr = showTroubleshootingLink ? `\n${TROUBLESHOOTING_MESSAGE}` : '';

    const statusMsg =
      importPendingWarning +
      compact([
        outdatedStr,
        pendingMergeStr,
        updatesFromMainOutput,
        updatesFromForkedOutput,
        compDuringMergeStr,
        newComponentsOutput,
        modifiedComponentOutput,
        snappedComponentsOutput,
        stagedComponentsOutput,
        unavailableOnMainOutput,
        autoTagPendingOutput,
        invalidComponentOutput,
        locallySoftRemovedOutput,
        remotelySoftRemovedOutput,
      ]).join(chalk.underline('\n                         \n') + chalk.white('\n')) +
      troubleshootingStr;

    const results = (statusMsg || chalk.yellow(statusWorkspaceIsCleanMsg)) + getWorkspaceIssuesOutput() + getLaneStr();

    const exitCode = componentsWithIssues.length && strict ? 1 : 0;

    return {
      data: results,
      code: exitCode,
    };
  }
}

export function formatIssues(issues: IssuesList) {
  return `       ${issues?.outputForCLI()}\n`;
}
