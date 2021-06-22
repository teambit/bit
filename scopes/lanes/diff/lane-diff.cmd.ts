import { Command, CommandOptions } from '@teambit/cli';
import { ScopeMain } from '@teambit/scope';
import { Workspace } from '@teambit/workspace';

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
      if (values.length < 2) {
        throw new Error(
          `expect "values" to include at least two args: from-lane and to-lane, got ${values.length} args`
        );
      }
      const legacyScope = this.scope.legacyScope;
      const fromLaneName = values[0];
      const toLaneName = values[1];
      const fromLane = await legacyScope.lanes.getLanesData(legacyScope, fromLaneName);
      const toLane = await legacyScope.lanes.getLanesData(legacyScope, toLaneName);
    }
    return 'diff';
  }
}
