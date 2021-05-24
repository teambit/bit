import chalk from 'chalk';
import R from 'ramda';

import { status } from '../../../api/consumer';
import { StatusResult } from '../../../api/consumer/lib/status';
import Component from '../../../consumer/component';
import { CommandOptions, LegacyCommand } from '../../legacy-command';
import { immutableUnshift } from '../../../utils';
import { formatBitString, formatNewBit } from '../../chalk-box';
import { getInvalidComponentLabel, formatIssues } from '../../templates/component-issues-template';
import { ModelComponent } from '../../../scope/models';
import { BASE_DOCS_DOMAIN, IMPORT_PENDING_MSG } from '../../../constants';
import { BitId } from '../../../bit-id';
import { Group } from '../../command-groups';

const TROUBLESHOOTING_MESSAGE = `${chalk.yellow(
  `see troubleshooting at https://${BASE_DOCS_DOMAIN}/docs/add-and-isolate-components#common-isolation-errors`
)}`;

export const statusFailureMsg = 'issues found';
export const statusInvalidComponentsMsg = 'invalid components';
export const statusWorkspaceIsCleanMsg =
  'nothing to tag or export (use "bit add <file...>" to track files or directories as components)';
export const individualFilesDesc = `these components were added as individual files and not as directories, which are invalid in Harmony
please make sure each component has its own directory and re-add it. alternatively, use "bit move --component" to help with the move.`;
const trackDirDesc = `these components were added by an older version of Bit and therefore have "trackDir" record in the .bitmap file
please run "bit migrate --harmony" to convert these records to "rootDir".`;

export default class Status implements LegacyCommand {
  name = 'status';
  shortDescription = 'show the working area component(s) status';
  group: Group = 'development';
  description = `show the working area component(s) status.\n  https://${BASE_DOCS_DOMAIN}/docs/view#status`;
  alias = 's';
  opts = [['j', 'json', 'return a json version of the component']] as CommandOptions;
  loader = true;
  migration = true;
  json = false;

  // eslint-disable-next-line no-empty-pattern
  action([], { json }: { json?: boolean }): Promise<Record<string, any>> {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    this.json = json;
    return status();
  }

  report({
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
    componentsWithTrackDirs,
    softTaggedComponents,
  }: StatusResult): string {
    if (this.json) {
      return JSON.stringify(
        {
          newComponents,
          modifiedComponent: modifiedComponent.map((c) => c.id.toString()),
          stagedComponents: stagedComponents.map((c) => c.id()),
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
          componentsWithTrackDirs: componentsWithTrackDirs.map((c) => c.id.toString()),
          softTaggedComponents: softTaggedComponents.map((s) => s.toString()),
        },
        null,
        2
      );
    }
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

      if (component instanceof BitId)
        return `${formatBitString(component.toStringWithoutVersion())} ... ${messageStatus}`;
      let bitFormatted = `${formatNewBit(component)}`;
      if (showVersions) {
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        const localVersions = component.getLocalTagsOrHashes();
        bitFormatted += `. versions: ${localVersions.join(', ')}`;
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
    const pendingMergeDesc = '(use "bit merge <remote-name>/<lane-name> [component-id]" to merge changes)\n';
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

    const trackDirOutput = immutableUnshift(
      componentsWithTrackDirs.map((c) => format(c.id, false, 'trackDir record')).sort(),
      componentsWithTrackDirs.length
        ? `${chalk.underline.white('components with trackDir record')}\n${trackDirDesc}\n`
        : ''
    ).join('\n');

    const stagedDesc = '\n(use "bit export <remote_scope> to push these components to a remote scope")\n';
    const stagedComponentsOutput = immutableUnshift(
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      stagedComponents.map((c) => format(c, true)),
      stagedComponents.length ? chalk.underline.white('staged components') + stagedDesc : ''
    ).join('\n');

    const troubleshootingStr = showTroubleshootingLink ? `\n${TROUBLESHOOTING_MESSAGE}` : '';

    return (
      importPendingWarning +
        [
          outdatedStr,
          pendingMergeStr,
          compWithConflictsStr,
          newComponentsOutput,
          modifiedComponentOutput,
          stagedComponentsOutput,
          autoTagPendingOutput,
          invalidComponentOutput,
          individualFilesOutput,
          trackDirOutput,
        ]
          .filter((x) => x)
          .join(chalk.underline('\n                         \n') + chalk.white('\n')) +
        troubleshootingStr || chalk.yellow(statusWorkspaceIsCleanMsg)
    );
  }
}
