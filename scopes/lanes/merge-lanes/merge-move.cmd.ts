import chalk from 'chalk';
import { Command, CommandOptions } from '@teambit/cli';
import { BitError } from '@teambit/bit-error';
import { MergeLanesMain } from './merge-lanes.main.runtime';

export type MergeAbortOpts = {
  silent?: boolean; // don't show prompt before aborting
};

export class MergeMoveLaneCmd implements Command {
  name = 'merge-move <new-lane-name>';
  description = `EXPERIMENT. move the current merge state into a new lane. the current lane will be reset`;
  extendedDescription = `this command is useful when you got a messy merge state that from one hand you don't want
to loose the changes, but on the other hand, you want to keep your lane without those changes.
this command does the following:
1. create a new lane with the current merge state. including all the filesystem changes. (in practice, it leaves the fs intact)
2. reset the current lane to the state before the merge. so then once done with the new lane, you can switch to the current lane and it'll be clean.`;
  alias = '';
  options = [
    [
      's',
      'scope <scope-name>',
      'remote scope to which this lane will be exported, default to the workspace.json\'s defaultScope (can be changed up to first export of the lane with "bit lane change-scope")',
    ],
  ] as CommandOptions;
  loader = true;
  remoteOp = true;

  constructor(private mergeLanes: MergeLanesMain) {}

  async report(
    [newLaneName]: [string],
    {
      scope,
    }: {
      scope?: string;
    }
  ): Promise<string> {
    const currentLane = await this.mergeLanes.lanes.getCurrentLane();
    if (!currentLane) {
      throw new BitError(`this command makes sense only when checked out to a lane. otherwise, there is no lane to revert to.
in order to move all local merge changes to a new lane, you can simply create a new lane (bit lane create)`);
    }
    const result = await this.mergeLanes.mergeMove(newLaneName, { scope });
    const remoteScopeOrDefaultScope = scope
      ? `the remote scope ${chalk.bold(scope)}`
      : `the default-scope ${chalk.bold(
          result.laneId.scope
        )}. you can change the lane's scope, before it is exported, with the "bit lane change-scope" command`;
    const title = chalk.green(
      `successfully added and checked out to the new lane ${chalk.bold(
        result.alias || result.laneId.name
      )} based on lane ${chalk.bold(currentLane.name)}`
    );
    const remoteScopeOutput = `this lane will be exported to ${remoteScopeOrDefaultScope}`;
    return `${title}\n${remoteScopeOutput}`;
  }
}
