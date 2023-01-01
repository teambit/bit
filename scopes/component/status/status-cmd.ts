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
  description = 'present the current status of components in the workspace, and notifies when issues are detected';
  group = 'development';
  extendedDescription: string;
  alias = 's';
  options = [
    ['j', 'json', 'return a json version of the component'],
    [
      '',
      'verbose',
      'show extra data: full snap hashes for staged, divergence point for lanes and updates-from-main for forked lanes',
    ],
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
      pendingUpdatesFromMain,
      updatesFromForked,
      currentLaneId,
      forkedLaneId,
    }: StatusResult = await this.status.status({ lanes });
    return {
      newComponents: newComponents.map((c) => c.toStringWithoutVersion()),
      modifiedComponents: modifiedComponents.map((c) => c.toString()),
      stagedComponents: stagedComponents.map((c) => ({ id: c.id.toStringWithoutVersion(), versions: c.versions })),
      componentsWithIssues: componentsWithIssues.map((c) => ({
        id: c.id.toString(),
        issues: c.issues?.toObject(),
      })),
      importPendingComponents: importPendingComponents.map((id) => id.toString()),
      autoTagPendingComponents: autoTagPendingComponents.map((s) => s.toString()),
      invalidComponents,
      locallySoftRemoved: locallySoftRemoved.map((id) => id.toString()),
      remotelySoftRemoved: remotelySoftRemoved.map((id) => id.toString()),
      outdatedComponents: outdatedComponents.map((c) => ({ ...c, id: c.id.toString() })),
      mergePendingComponents: mergePendingComponents.map((c) => c.id.toString()),
      componentsDuringMergeState: componentsDuringMergeState.map((id) => id.toString()),
      softTaggedComponents: softTaggedComponents.map((s) => s.toString()),
      snappedComponents: snappedComponents.map((s) => s.toString()),
      pendingUpdatesFromMain: pendingUpdatesFromMain.map((p) => ({ id: p.id.toString(), divergeData: p.divergeData })),
      updatesFromForked: updatesFromForked.map((p) => ({
        id: p.id.toString(),
        divergeData: p.divergeData,
      })),
      currentLaneId,
      forkedLaneId,
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
      currentLaneId,
      forkedLaneId,
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
    const pendingMergeDesc = `(use "bit reset" to add local changes on top of the remote and discard local tags.
alternatively, to keep local tags/snaps history, use "bit merge <remote-name>/<lane-name> [component-id]")\n`;
    const pendingMergeComps = mergePendingComponents
      .map((component) => {
        return `    > ${chalk.cyan(component.id.toString())} local and remote have diverged and have ${
          component.divergeData.snapsOnSourceOnly.length
        } and ${component.divergeData.snapsOnTargetOnly.length} different snaps each, respectively\n`;
      })
      .join('');

    const pendingMergeStr = pendingMergeComps.length
      ? [pendingMergeTitle, pendingMergeDesc, pendingMergeComps].join('\n')
      : '';

    const compDuringMergeTitle = chalk.underline.white('components during merge state');
    const compDuringMergeDesc = `(use "bit snap/tag [--unmerged]" to complete the merge process
or use "bit merge [component-id] --abort" to cancel the merge operation)\n`;
    const compDuringMergeComps = componentsDuringMergeState.map((c) => format(c, true)).join('\n');

    const compDuringMergeStr = compDuringMergeComps.length
      ? [compDuringMergeTitle, compDuringMergeDesc, compDuringMergeComps].join('\n')
      : '';

    const newComponentDescription = '\n(use "bit tag [version]" to lock a version with all your changes)\n';
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
        ? chalk.underline.white('components pending to be tagged automatically (when their dependencies are tagged)')
        : ''
    ).join('\n');

    const invalidDesc = '\nthese components were failed to load.\n';
    const invalidComponentOutput = immutableUnshift(
      invalidComponents.map((c) => format(c.id, false, getInvalidComponentLabel(c.error))).sort(),
      invalidComponents.length ? chalk.underline.white(statusInvalidComponentsMsg) + invalidDesc : ''
    ).join('\n');

    const locallySoftRemovedDesc = '\n(tag/snap and export them to update the remote)\n';
    const locallySoftRemovedOutput = immutableUnshift(
      locallySoftRemoved.map((c) => format(c)).sort(),
      locallySoftRemoved.length ? chalk.underline.white('soft-removed components locally') + locallySoftRemovedDesc : ''
    ).join('\n');

    const remotelySoftRemovedDesc = '\n(use "bit remove" to remove them from the workspace)\n';
    const remotelySoftRemovedOutput = immutableUnshift(
      remotelySoftRemoved.map((c) => format(c)).sort(),
      remotelySoftRemoved.length
        ? chalk.underline.white('soft-removed components on the remote') + remotelySoftRemovedDesc
        : ''
    ).join('\n');

    const stagedDesc = '\n(use "bit export" to push these components to a remote scope)\n';
    const stagedComponentsOutput = immutableUnshift(
      stagedComponents.map((c) => format(c.id, true, undefined, c.versions)),
      stagedComponents.length ? chalk.underline.white('staged components') + stagedDesc : ''
    ).join('\n');

    const snappedDesc = '\n(use "bit tag [version]" or "bit tag --snapped [version]" to lock a version)\n';
    const snappedComponentsOutput = immutableUnshift(
      snappedComponents.map((c) => format(c)),
      snappedComponents.length ? chalk.underline.white('snapped components') + snappedDesc : ''
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
    if (!forkedLaneId || verbose) {
      const updatesFromMainDesc = '\n(use "bit lane merge main" to merge the changes)\n';
      const pendingUpdatesFromMainIds = pendingUpdatesFromMain.map((c) =>
        format(c.id, false, getUpdateFromMsg(c.divergeData))
      );
      updatesFromMainOutput = [
        pendingUpdatesFromMain.length ? chalk.underline.white('pending updates from main') + updatesFromMainDesc : '',
        ...pendingUpdatesFromMainIds,
      ].join('\n');
    }

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
      const prefix = `\non ${chalk.bold(currentLaneId.toString())} lane`;
      if (lanes) return prefix;
      return `${prefix}\nconsider adding "--lanes" flag to see updates from main/forked`;
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
        autoTagPendingOutput,
        invalidComponentOutput,
        locallySoftRemovedOutput,
        remotelySoftRemovedOutput,
      ]).join(chalk.underline('\n                         \n') + chalk.white('\n')) +
      troubleshootingStr;

    const results = (statusMsg || chalk.yellow(statusWorkspaceIsCleanMsg)) + getLaneStr();

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
