import chalk from 'chalk';
import yesno from 'yesno';
import { Command, CommandOptions } from '@teambit/cli';
import { Workspace } from '@teambit/workspace';
import { BitError } from '@teambit/bit-error';
import RemovedObjects from '@teambit/legacy/dist/scope/removed-components';
import { COMPONENT_PATTERN_HELP } from '@teambit/legacy.constants';
import { RemoveMain } from './remove.main.runtime';
import { removeTemplate } from './remove-template';

export class DeleteCmd implements Command {
  name = 'delete <component-pattern>';
  description = 'mark components as deleted on the remote';
  extendedDescription = `to remove components from your local workspace only, use "bit remove" command.
this command marks the components as deleted, and after snap/tag and export they will be marked as deleted from the remote scope as well.
`;
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
    ['', 'lane', 'when on a lane, delete the component from this lane only. avoid merging it to main or other lanes'],
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
      'NOT-RECOMMENDED. delete a component completely from a remote scope. careful! this is a permanent change that could corrupt dependents.',
    ],
    [
      'f',
      'force',
      'relevant for --hard. allow the deletion even if used as a dependency. WARNING: components that depend on this component will corrupt',
    ],
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
    }: {
      force?: boolean;
      lane?: boolean;
      updateMain?: boolean;
      hard?: boolean;
      silent?: boolean;
      range?: string;
    }
  ) {
    if (this.workspace?.isOnLane() && !hard && !lane && !updateMain) {
      throw new BitError(`error: to delete components when on a lane, use --lane flag`);
    }
    if (this.workspace?.isOnMain() && updateMain) {
      throw new BitError(`--update-main is relevant only when on a lane`);
    }

    if (!silent) {
      await this.removePrompt(hard, lane);
    }

    if (hard) {
      if (range) throw new BitError(`--range is not supported with --hard flag`);
      const { localResult, remoteResult = [] } = await this.remove.remove({ componentsPattern, remote: true, force });
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      let localMessage = removeTemplate(localResult, false);
      if (localMessage !== '') localMessage += '\n';
      return `${localMessage}${this.paintArray(remoteResult)}`;
    }

    const removedComps = await this.remove.deleteComps(componentsPattern, { updateMain, range });
    const removedCompIds = removedComps.map((comp) => comp.id.toString());
    return `${chalk.green('successfully deleted the following components:')}
${removedCompIds.join('\n')}

${chalk.bold('to update the remote, please tag/snap and then export. to revert, please use "bit recover"')}`;
  }

  private paintArray(removedObjectsArray: RemovedObjects[]) {
    return removedObjectsArray.map((item) => removeTemplate(item, true));
  }

  private async removePrompt(hard?: boolean, lane?: boolean) {
    this.remove.logger.clearStatusLine();
    const laneOrMainWarning = lane
      ? `this command will mark the component as removed from this lane, resetting the component to its pre-lane state and content (after tag/snap and export)`
      : `this command will mark the component as deleted, and it won’t be visible on the remote scope (after tag/snap and export).`;
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
