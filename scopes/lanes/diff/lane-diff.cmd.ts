import { Command, CommandOptions } from '@teambit/cli';
import { ScopeMain } from '@teambit/scope';
import { Workspace } from '@teambit/workspace';
import chalk from 'chalk';
import { outputDiffResults } from '@teambit/legacy/dist/consumer/component-ops/components-diff';
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
    const laneDiffGenerator = new LaneDiffGenerator(this.workspace, this.scope);
    const { compsWithDiff, newComps, toLaneName } = await laneDiffGenerator.generate(values);
    const diffResultsStr = outputDiffResults(compsWithDiff);
    const newCompsIdsStr = newComps.map((id) => chalk.bold(id)).join('\n');
    const newCompsTitle = `The following components were introduced in ${chalk.bold(toLaneName)} lane`;
    const newCompsStr = newComps.length ? `${chalk.inverse(newCompsTitle)}\n${newCompsIdsStr}` : '';
    return `${diffResultsStr}\n${newCompsStr}`;
  }
}
