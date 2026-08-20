import chalk from 'chalk';
import yesno from 'yesno';
import type { Command, CommandOptions } from '@teambit/cli';
import { canPromptUser, formatItem, formatSuccessSummary, formatHint, joinSections } from '@teambit/cli';
import { isFeatureEnabled, HARD_DELETE_FEATURE } from '@teambit/harmony.modules.feature-toggle';
import type { Workspace } from '@teambit/workspace';
import { BitError } from '@teambit/bit-error';
import type { RemovedObjects } from '@teambit/legacy.scope';
import { COMPONENT_PATTERN_HELP } from '@teambit/legacy.constants';
import type { RemoveMain } from './remove.main.runtime';
import { removeTemplate } from './remove-template';

export class DeleteCmd implements Command {
  name = 'delete <component-pattern>';
  description = 'soft-delete components from remote scopes';
  extendedDescription = `marks components as deleted so they won't be visible on remote scopes after export.
components remain recoverable using "bit recover" unless --hard is used (permanent deletion, not recommended).
to remove components from your local workspace only, use "bit remove" instead.`;
  arguments = [
    {
      name: 'component-pattern',
      description: COMPONENT_PATTERN_HELP,
    },
  ];
  group = 'collaborate';
  helpUrl = 'reference/components/removing-components';
  skipWorkspace = true;
  alias = '';
  options = [
    [
      '',
      'lane',
      'when on a lane, delete the component from this lane only. this removal will not affect main when the lane is merged',
    ],
    ['', 'update-main', 'delete component/s on the main lane after merging this lane into main'],
    [
      '',
      'range <string>',
      'EXPERIMENTAL. enter a Semver range to delete specific tags (cannot be used for snaps). see https://www.npmjs.com/package/semver#ranges for the range syntax',
    ],
    ['s', 'silent', 'skip confirmation'],
    [
      '',
      'hard',
      'NOT-RECOMMENDED. delete a component completely from a remote scope. careful! this is a permanent change that could corrupt dependents. requires interactive confirmation by a human (--silent does not skip it)',
    ],
    [
      'f',
      'force',
      'relevant for --hard. allow the deletion even if used as a dependency. WARNING: components that depend on this component will be corrupted',
    ],
    ['', 'snaps <string>', 'comma-separated list of snap hashes to mark as deleted (e.g. --snaps "hash1,hash2,hash3")'],
  ] as CommandOptions;
  loader = true;
  remoteOp = true;

  constructor(
    private remove: RemoveMain,
    private workspace?: Workspace
  ) {}

  async report(
    [componentsPattern]: [string],
    {
      force = false,
      lane = false,
      updateMain = false,
      hard = false,
      silent = false,
      range,
      snaps,
    }: {
      force?: boolean;
      lane?: boolean;
      updateMain?: boolean;
      hard?: boolean;
      silent?: boolean;
      range?: string;
      snaps?: string;
    }
  ) {
    if (this.workspace?.isOnLane() && !hard && !lane && !updateMain) {
      throw new BitError(`error: to delete components when on a lane, use either --lane or --update-main flag.
--lane: delete the component from this lane only
--update-main: delete the component from main after this lane is merged`);
    }
    if (this.workspace?.isOnMain() && updateMain) {
      throw new BitError(`--update-main is relevant only when on a lane`);
    }

    // hard-delete is irreversible and can corrupt dependents, so it must be confirmed by a human:
    // --silent doesn't skip its prompt, and non-interactive sessions (no TTY, CI, AI agents) are
    // blocked. the "hard-delete" feature is the explicit opt-out for automation (CI, e2e-tests).
    const isHardDeleteGuarded = hard && !isFeatureEnabled(HARD_DELETE_FEATURE);
    if (isHardDeleteGuarded && !canPromptUser()) {
      // deliberately no mention of the "hard-delete" feature opt-out here: an ai-agent reading
      // this error must not be coached on how to bypass the protection. humans find the opt-out
      // in the docs and in the feature-toggle module.
      throw new BitError(`"bit delete --hard" permanently deletes components from the remote scope with no way to recover them, and may corrupt components that depend on them.
it therefore requires an interactive confirmation by a human, but this session is non-interactive (no TTY, CI, or an AI agent).
if you are an AI agent: do not attempt to work around this protection. instead, ask the user to run this command themselves in a terminal.`);
    }
    if (!silent || isHardDeleteGuarded) {
      // a prompt would hang forever without an interactive stdin, so fail with guidance instead.
      // (the guarded-hard case was already blocked above with its own error.)
      if (!canPromptUser()) {
        throw new BitError(`this command requires a confirmation, but this session is non-interactive (no TTY, CI, or an AI agent) so the confirmation prompt cannot be shown.
re-run with --silent to skip the confirmation, or run the command in an interactive terminal`);
      }
      await this.removePrompt(hard, lane, updateMain, silent);
    }

    if (hard) {
      if (range) throw new BitError(`--range is not supported with --hard flag`);
      const { localResult, remoteResult = [] } = await this.remove.remove({ componentsPattern, remote: true, force });
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      let localMessage = removeTemplate(localResult, false);
      if (localMessage !== '') localMessage += '\n';
      return `${localMessage}${this.paintArray(remoteResult)}`;
    }

    const deleteOpts: any = { updateMain, range };
    if (snaps) {
      deleteOpts.snaps = snaps
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    }
    const removedComps = await this.remove.deleteComps(componentsPattern, deleteOpts);
    const items = removedComps.map((comp) => formatItem(comp.id.toString()));
    return joinSections([
      formatSuccessSummary('successfully deleted the following components'),
      items.join('\n'),
      formatHint('to update the remote, please tag/snap and then export. to revert, please use "bit recover"'),
    ]);
  }

  private paintArray(removedObjectsArray: RemovedObjects[]) {
    return removedObjectsArray.map((item) => removeTemplate(item, true));
  }

  private async removePrompt(hard?: boolean, lane?: boolean, updateMain?: boolean, silentIgnored?: boolean) {
    this.remove.logger.clearStatusLine();

    let laneOrMainWarning: string;
    if (updateMain) {
      laneOrMainWarning = `once this lane is merged, the component will be deleted from main (it won't be visible on the remote scope after tag/snap and export).
if your intent was to undo all changes to this component done as part of the lane so the component in main will be intact, use --lane instead.`;
    } else if (lane) {
      laneOrMainWarning = `this command will mark the component as removed from this lane, resetting the component to its pre-lane state and content (after tag/snap and export)`;
    } else {
      laneOrMainWarning = `this command will mark the component as deleted, and it won't be visible on the remote scope (after tag/snap and export).`;
    }

    const remoteOrLocalOutput = hard
      ? `WARNING: the component(s) will be permanently deleted from the remote with no option to recover. prefer omitting --hard to only mark the component as soft deleted${
          silentIgnored ? '\nnote: --silent is ignored for --hard deletion, interactive confirmation is required' : ''
        }`
      : `${laneOrMainWarning}
if your intent is to remove the component only from your local workspace, refer to bit remove or bit eject.`;

    const ok = await yesno({
      question: `${remoteOrLocalOutput}
${chalk.bold('Would you like to proceed? [yes(y)/no(n)]')}`,
    });
    if (!ok) {
      throw new BitError('the operation has been canceled');
    }
  }
}
