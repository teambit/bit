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
bit lane diff => diff between the current lane and default lane. (only inside workspace).
bit lane diff to => diff between the current lane (or default-lane when in scope) and "to" lane.
bit lane diff from to => diff between "from" lane and "to" lane.
`;
  alias = '';
  options = [] as CommandOptions;
  loader = true;
  private = true;
  migration = true;
  remoteOp = true;
  skipWorkspace = true;

  constructor(private workspace: Workspace, private scope: ScopeMain) {}

  async report([values = []]: [string[]]) {
    const { fromLaneName, toLaneName } = this.getLaneNames(values);
    if (fromLaneName === toLaneName) {
      throw new Error(`unable to run diff between "${fromLaneName}" and "${toLaneName}", they're the same lane`);
    }
    const legacyScope = this.scope.legacyScope;
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

  private getLaneNames(values: string[]): { fromLaneName?: string; toLaneName: string } {
    if (values.length > 2) {
      throw new Error(`expect "values" to include no more than two args, got ${values.length}`);
    }
    if (this.workspace) {
      const currentLane = this.workspace.getCurrentLaneId();
      if (!values.length) {
        if (currentLane.isDefault()) {
          throw new Error(`you are currently on the default branch, to run diff between lanes, please specify them`);
        }
        return { toLaneName: currentLane.name };
      }
      if (values.length === 1) {
        const fromLaneName = currentLane.isDefault() ? undefined : currentLane.name;
        return { fromLaneName, toLaneName: values[0] };
      }
      return { fromLaneName: values[0], toLaneName: values[1] };
    }
    // running from the scope
    if (values.length < 1) {
      throw new Error(`expect "values" to include at least one arg - the lane name`);
    }
    const fromLaneName = values.length === 2 ? values[0] : undefined;
    const toLaneName = values.length === 2 ? values[1] : values[0];
    return { fromLaneName, toLaneName };
  }
}
