import chalk from 'chalk';
import yesno from 'yesno';
import type { Command, CommandOptions } from '@teambit/cli';
import { formatItem, formatSuccessSummary, formatHint, joinSections } from '@teambit/cli';
import type { Workspace } from '@teambit/workspace';
import { BitError } from '@teambit/bit-error';
import type { RemovedObjects } from '@teambit/legacy.scope';
import { COMPONENT_PATTERN_HELP } from '@teambit/legacy.constants';
import type { RemoveMain } from './remove.main.runtime';
import { removeTemplate } from './remove-template';
import { deleteCommand } from './remove.commands';

export class DeleteCmd implements Command {
  name = deleteCommand.name;
  description = deleteCommand.description;
  extendedDescription = deleteCommand.extendedDescription;
  arguments = deleteCommand.arguments;
  group = deleteCommand.group;
  helpUrl = deleteCommand.helpUrl;
  skipWorkspace = deleteCommand.skipWorkspace;
  alias = deleteCommand.alias;
  options = deleteCommand.options;
  loader = deleteCommand.loader;
  remoteOp = deleteCommand.remoteOp;

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

    if (!silent) {
      await this.removePrompt(hard, lane, updateMain);
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

  private async removePrompt(hard?: boolean, lane?: boolean, updateMain?: boolean) {
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
      ? `WARNING: the component(s) will be permanently deleted from the remote with no option to recover. prefer omitting --hard to only mark the component as soft deleted`
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
