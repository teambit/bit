import { Command, CommandOptions } from '@teambit/cli';
import { ScopeMain } from '@teambit/scope';
import { Workspace } from '@teambit/workspace';
import chalk from 'chalk';
import { outputDiffResults } from '@teambit/legacy/dist/consumer/component-ops/components-diff';
import LaneId from '@teambit/legacy/dist/lane-id/lane-id';
import { LaneDiffGenerator } from './lane-diff-generator';

export class LaneDiffCmd implements Command {
  name = 'diff [values...]';
  shortDescription = 'show diff between lanes';
  description = `show diff between lanes
bit lane diff => diff between the current lane and master lane. (needs workspace).
bit lane diff to => diff between the current lane and "to" lane. (needs workspace).
bit lane diff from to => diff between "from" lane and "to" lane. (can work also from scope).
`;
  alias = '';
  options = [] as CommandOptions;
  loader = true;
  private = true;
  migration = true;
  remoteOp = true;
  skipWorkspace = true;

  constructor(private workspace: Workspace, private scope: ScopeMain) {}

  async report([values]: [string[]]) {
    if (this.workspace) {
      // todo: implement
    } else {
      if (values.length < 1) {
        throw new Error(`expect "values" to include at least one arg - the lane name`);
      }
      if (values.length > 2) {
        throw new Error(`expect "values" to include no more than two args, got ${values.length}`);
      }

      const legacyScope = this.scope.legacyScope;
      const fromLaneName = values.length === 2 ? values[0] : '';
      const toLaneName = values.length === 2 ? values[1] : values[0];
      const fromLane = fromLaneName ? await legacyScope.lanes.loadLane(new LaneId({ name: fromLaneName })) : null;
      const toLane = await legacyScope.lanes.loadLane(new LaneId({ name: toLaneName }));
      if (!toLane) {
        throw new Error(`unable to find a lane "${toLaneName}" in the scope`);
      }
      const laneDiffGenerator = new LaneDiffGenerator(this.workspace, this.scope, fromLane, toLane);
      const { compsWithDiff, newComps } = await laneDiffGenerator.generate();
      const diffResultsStr = outputDiffResults(compsWithDiff);
      const newCompsIdsStr = newComps.map((id) => chalk.bold(id)).join('\n');
      const newCompsTitle = `The following components were introduced in ${chalk.bold(toLaneName)} lane`;
      const newCompsStr = newComps.length ? `${chalk.green(newCompsTitle)}\n${newCompsIdsStr}` : '';
      return `${diffResultsStr}\n${newCompsStr}`;
    }
    return 'diff';
  }
}
