import chalk from 'chalk';
import R from 'ramda';
import { Command, CommandOptions } from '@teambit/cli';
import { ComponentID } from '@teambit/component-id';
import { DivergeData } from '@teambit/legacy/dist/scope/component-ops/diverge-data';
import { immutableUnshift } from '@teambit/legacy/dist/utils';
import { IssuesList } from '@teambit/component-issues';
import { formatBitString, formatNewBit } from '@teambit/legacy/dist/cli/chalk-box';
import { getInvalidComponentLabel } from '@teambit/legacy/dist/cli/templates/component-issues-template';
import {
  BASE_DOCS_DOMAIN,
  IMPORT_PENDING_MSG,
  statusFailureMsg,
  statusInvalidComponentsMsg,
  statusWorkspaceIsCleanMsg,
} from '@teambit/legacy/dist/constants';
import { partition } from 'lodash';
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
    ['', 'verbose', 'show full snap hashes'],
    ['', 'strict', 'in case issues found, exit with code 1'],
  ] as CommandOptions;
  loader = true;
  migration = true;

  constructor(private status: StatusMain) {}

  async json() {
    const {
      newComponents,
      modifiedComponent,
      stagedComponents,
      componentsWithIssues,
      importPendingComponents,
      autoTagPendingComponents,
      invalidComponents,
      outdatedComponents,
      mergePendingComponents,
      componentsDuringMergeState,
      softTaggedComponents,
      snappedComponents,
      pendingUpdatesFromMain,
    }: StatusResult = await this.status.status();
    return {
      newComponents,
      modifiedComponents: modifiedComponent.map((c) => c.toString()),
      stagedComponents: stagedComponents.map((c) => ({ id: c.id.toString(), versions: c.versions })),
      componentsWithIssues: componentsWithIssues.map((c) => ({
        id: c.id.toString(),
        issues: c.issues?.toObject(),
      })),
      importPendingComponents: importPendingComponents.map((id) => id.toString()),
      autoTagPendingComponents: autoTagPendingComponents.map((s) => s.toString()),
      invalidComponents,
      outdatedComponents: outdatedComponents.map((c) => c.id.toString()),
      mergePendingComponents: mergePendingComponents.map((c) => c.id.toString()),
      componentsDuringMergeState: componentsDuringMergeState.map((id) => id.toString()),
      softTaggedComponents: softTaggedComponents.map((s) => s.toString()),
      snappedComponents: snappedComponents.map((s) => s.toString()),
      pendingUpdatesFromMain: pendingUpdatesFromMain.map((p) => ({ id: p.id.toString(), divergeData: p.divergeData })),
    };
  }

  async report(_args, { strict, verbose }: { strict?: boolean; verbose?: boolean }) {
    const {
      newComponents,
      modifiedComponent,
      stagedComponents,
      componentsWithIssues,
      importPendingComponents,
      autoTagPendingComponents,
      invalidComponents,
      outdatedComponents,
      mergePendingComponents,
      componentsDuringMergeState,
      softTaggedComponents,
      snappedComponents,
      pendingUpdatesFromMain,
      laneName,
    }: StatusResult = await this.status.status();
    // If there is problem with at least one component we want to show a link to the
    // troubleshooting doc
    let showTroubleshootingLink = false;

    function format(id: ComponentID, showIssues = false, message?: string, localVersions?: string[]): string {
      const bitId = id;
      const idWithIssues = componentsWithIssues.find((c) => c.id.isEqual(bitId));
      const softTagged = softTaggedComponents.find((softTaggedId) => softTaggedId.isEqual(bitId));

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
      '(use "bit checkout [version] [component_id]" to merge changes)\n(use "bit diff [component_id] [new_version]" to compare changes)\n(use "bit log [component_id]" to list all available versions)\n';
    const outdatedComps = outdatedComponents
      .map((component) => {
        return `    > ${chalk.cyan(component.id.toStringWithoutVersion())} current: ${component.id.version} latest: ${
          // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
          component.latestVersion
        }\n`;
      })
      .join('');

    const outdatedStr = outdatedComponents.length ? [outdatedTitle, outdatedDesc, outdatedComps].join('\n') : '';

    const pendingMergeTitle = chalk.underline.white('pending merge');
    const pendingMergeDesc = `(use "bit reset" to add local changes on top of the remote and discard local tags.
alternatively, to keep local tags/snaps history, use "bit merge <remote-name>/<lane-name> [component-id]")\n`;
    const pendingMergeComps = mergePendingComponents
      .map((component) => {
        return `    > ${chalk.cyan(component.id.toString())} local and remote have diverged and have ${
          component.divergeData.snapsOnLocalOnly.length
        } and ${component.divergeData.snapsOnRemoteOnly.length} different snaps each, respectively\n`;
      })
      .join('');

    const pendingMergeStr = pendingMergeComps.length
      ? [pendingMergeTitle, pendingMergeDesc, pendingMergeComps].join('\n')
      : '';

    const compWithConflictsTitle = chalk.underline.white('components during merge state');
    const compWithConflictsDesc = `(use "bit merge [component-id] --resolve" to mark them as resolved and snap the changes
or use "bit merge [component-id] --abort" to cancel the merge operation)\n`;
    const compWithConflictsComps = componentsDuringMergeState
      .map((id) => {
        return `    > ${chalk.cyan(id.toString())}`;
      })
      .join('');

    const compWithConflictsStr = compWithConflictsComps.length
      ? [compWithConflictsTitle, compWithConflictsDesc, compWithConflictsComps].join('\n')
      : '';

    const newComponentDescription = '\n(use "bit tag --all [version]" to lock a version with all your changes)\n';
    const newComponentsTitle = newComponents.length
      ? chalk.underline.white('new components') + newComponentDescription
      : '';

    const newComponentsOutput = [newComponentsTitle, ...(nonMissing || []), ...(missing || [])].join('\n');

    const modifiedDesc = '(use "bit diff" to compare changes)\n';
    const modifiedComponentOutput = immutableUnshift(
      modifiedComponent.map((c) => format(c, true)),
      modifiedComponent.length
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

    const stagedDesc = '\n(use "bit export to push these components to a remote scope")\n';
    const stagedComponentsOutput = immutableUnshift(
      stagedComponents.map((c) => format(c.id, true, undefined, c.versions)),
      stagedComponents.length ? chalk.underline.white('staged components') + stagedDesc : ''
    ).join('\n');

    const snappedDesc = '\n(use "bit tag [version]" or "bit tag --snapped [version]" to lock a version)\n';
    const snappedComponentsOutput = immutableUnshift(
      snappedComponents.map((c) => format(c)),
      snappedComponents.length ? chalk.underline.white('snapped components') + snappedDesc : ''
    ).join('\n');

    const getUpdateFromMainMsg = (divergeData: DivergeData): string => {
      if (divergeData.err) return divergeData.err.message;
      let msg = `main is ahead by ${divergeData.snapsOnRemoteOnly.length || 0} snaps`;
      if (divergeData.snapsOnLocalOnly && verbose) {
        msg += ` (diverged since ${divergeData.commonSnapBeforeDiverge?.toShortString()})`;
      }
      return msg;
    };
    const updatesFromMainDesc = '\n(EXPERIMENTAL. use "bit lane merge main" to merge the changes)\n';
    const pendingUpdatesFromMainIds = pendingUpdatesFromMain.map((c) =>
      format(c.id, false, getUpdateFromMainMsg(c.divergeData))
    );
    const updatesFromMainOutput = immutableUnshift(
      pendingUpdatesFromMainIds,
      pendingUpdatesFromMain.length ? chalk.underline.white('pending updates from main') + updatesFromMainDesc : ''
    ).join('\n');

    const laneStr = laneName ? `\non ${chalk.bold(laneName)} lane` : '';

    const troubleshootingStr = showTroubleshootingLink ? `\n${TROUBLESHOOTING_MESSAGE}` : '';

    const statusMsg =
      importPendingWarning +
      [
        outdatedStr,
        pendingMergeStr,
        updatesFromMainOutput,
        compWithConflictsStr,
        newComponentsOutput,
        modifiedComponentOutput,
        snappedComponentsOutput,
        stagedComponentsOutput,
        autoTagPendingOutput,
        invalidComponentOutput,
      ]
        .filter((x) => x)
        .join(chalk.underline('\n                         \n') + chalk.white('\n')) +
      troubleshootingStr;

    const results = (statusMsg || chalk.yellow(statusWorkspaceIsCleanMsg)) + laneStr;

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
