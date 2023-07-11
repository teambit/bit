import { Command, CommandOptions } from '@teambit/cli';
import { ScopeMain } from '@teambit/scope';
import { Workspace } from '@teambit/workspace';
import chalk from 'chalk';
import { outputDiffResults } from '@teambit/legacy/dist/consumer/component-ops/components-diff';
import { LaneDiffGenerator } from './lane-diff-generator';

export class LaneDiffCmd implements Command {
  name = 'diff [values...]';
  description = `show diff between lanes`;
  extendedDescription = `bit lane diff => diff between the current lane and default lane. (only inside workspace).
bit lane diff to => diff between the current lane (or default-lane when in scope) and "to" lane.
bit lane diff from to => diff between "from" lane and "to" lane.`;
  alias = '';
  options = [
    ['', 'pattern <component-pattern>', 'show lane-diff for the specified component-pattern only'],
  ] as CommandOptions;
  loader = true;
  private = true;
  migration = true;
  remoteOp = true;
  skipWorkspace = true;

  constructor(private workspace: Workspace, private scope: ScopeMain) {}

  async report([values = []]: [string[]], { pattern }: { pattern?: string }) {
    const laneDiffGenerator = new LaneDiffGenerator(this.workspace, this.scope);
    const { compsWithDiff, newCompsFrom, newCompsTo, toLaneName, fromLaneName, failures } =
      await laneDiffGenerator.generate(values, undefined, pattern);

    const newCompsOutput = (laneName: string, ids: string[]) => {
      if (!ids.length) return '';
      const newCompsIdsStr = ids.map((id) => chalk.bold(id)).join('\n');
      const newCompsTitle = `\nThe following components were introduced in ${chalk.bold(laneName)} lane`;
      return newCompsFrom.length ? `${chalk.inverse(newCompsTitle)}\n${newCompsIdsStr}` : '';
    };

    const diffResultsStr = outputDiffResults(compsWithDiff);

    const failuresTitle = `\n\nDiff failed on the following component(s)`;
    const failuresIds = failures.map((f) => `${f.id.toString()} - ${chalk.red(f.msg)}`);
    const failuresStr = failures.length ? `${chalk.inverse(failuresTitle)}\n${failuresIds}` : '';
    const newCompsToStr = newCompsOutput(toLaneName, newCompsTo);
    const newCompsFromStr = newCompsOutput(fromLaneName, newCompsFrom);
    return `${diffResultsStr}${newCompsToStr}${newCompsFromStr}${failuresStr}`;
  }
}
