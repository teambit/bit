import chalk from 'chalk';
import R from 'ramda';
import { Command, CommandOptions } from '@teambit/cli';
import { BitId } from '@teambit/legacy-bit-id';
import Component from '@teambit/legacy/dist/consumer/component';
import { DivergeData } from '@teambit/legacy/dist/scope/component-ops/diverge-data';
import { immutableUnshift } from '@teambit/legacy/dist/utils';
import { formatBitString, formatNewBit } from '@teambit/legacy/dist/cli/chalk-box';
import { getInvalidComponentLabel, formatIssues } from '@teambit/legacy/dist/cli/templates/component-issues-template';
import { ModelComponent } from '@teambit/legacy/dist/scope/models';
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

const individualFilesDesc = `these components were added as individual files and not as directories, which are invalid in Harmony
please make sure each component has its own directory and re-add it. alternatively, use "bit move --component" to help with the move.`;
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
      componentsWithIndividualFiles,
      softTaggedComponents,
      snappedComponents,
      pendingUpdatesFromMain,
    }: StatusResult = await this.status.status();
    return {
      newComponents,
      modifiedComponent: modifiedComponent.map((c) => c.id.toString()),
      stagedComponents: stagedComponents.map((c) => ({ id: c.id(), versions: c.getLocalTagsOrHashes() })),
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
      componentsWithIndividualFiles: componentsWithIndividualFiles.map((c) => c.id.toString()),
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
      componentsWithIndividualFiles,
      softTaggedComponents,
      snappedComponents,
      pendingUpdatesFromMain,
      laneName,
    }: StatusResult = await this.status.status();
    // If there is problem with at least one component we want to show a link to the
    // troubleshooting doc
    let showTroubleshootingLink = false;

    function format(component: BitId | Component | ModelComponent, showVersions = false, message?: string): string {
      const getBitId = () => {
        if (component instanceof BitId) return component;
        if (component instanceof Component) return component.id;
        if (component instanceof ModelComponent) return component.toBitId();
        throw new Error(`type of component ${component} is not supported`);
      };
      const bitId = getBitId();
      const issues = componentsWithIssues.find((compWithIssue: Component) => compWithIssue.id.isEqual(bitId));
      const softTagged = softTaggedComponents.find((softTaggedId) => softTaggedId.isEqual(bitId));

      const messageStatusText = message || 'ok';
      const messageStatusTextWithSoftTag = softTagged ? `${messageStatusText} (soft-tagged)` : messageStatusText;
      const color = message ? 'yellow' : 'green';
      const messageStatus = chalk[color](messageStatusTextWithSoftTag);

      if (component instanceof BitId) {
        return `${formatBitString(component.toStringWithoutVersion())} ... ${messageStatus}`;
      }
      let bitFormatted = `${formatNewBit(component)}`;
      if (showVersions) {
        if (!(component instanceof ModelComponent)) {
          throw new Error(`expect "${component}" to be instance of ModelComponent`);
        }
        const localVersions = component.getLocalTagsOrHashes();
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
      if (!issues) return `${bitFormatted}${messageStatus}`;
      showTroubleshootingLink = true;
      return `${bitFormatted} ${chalk.red(statusFailureMsg)}${formatIssues(issues)}`;
    }

    const importPendingWarning = importPendingComponents.length ? chalk.yellow(`${IMPORT_PENDING_MSG}.\n`) : '';

    const splitByMissing = R.groupBy((component) => {
      return component.includes(statusFailureMsg) ? 'missing' : 'nonMissing';
    });
    const { missing, nonMissing } = splitByMissing(newComponents.map((c) => format(c)));

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
          component.diverge.snapsOnLocalOnly.length
        } and ${component.diverge.snapsOnRemoteOnly.length} different snaps each, respectively\n`;
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
      modifiedComponent.map((c) => format(c)),
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
      invalidComponents.map((c) => format(c.id, true, getInvalidComponentLabel(c.error))).sort(),
      invalidComponents.length ? chalk.underline.white(statusInvalidComponentsMsg) + invalidDesc : ''
    ).join('\n');

    const individualFilesOutput = immutableUnshift(
      componentsWithIndividualFiles.map((c) => format(c.id, false, 'individual files')).sort(),
      componentsWithIndividualFiles.length
        ? `${chalk.underline.white('components with individual files')}\n${individualFilesDesc}\n`
        : ''
    ).join('\n');

    const stagedDesc = '\n(use "bit export to push these components to a remote scope")\n';
    const stagedComponentsOutput = immutableUnshift(
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      stagedComponents.map((c) => format(c, true)),
      stagedComponents.length ? chalk.underline.white('staged components') + stagedDesc : ''
    ).join('\n');

    const snappedDesc = '\n(use "bit tag [version]" or "bit tag --snapped [version]" to lock a version)\n';
    const snappedComponentsOutput = immutableUnshift(
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      snappedComponents.map((c) => format(c, true)),
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
      format(c.id, true, getUpdateFromMainMsg(c.divergeData))
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
        individualFilesOutput,
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
