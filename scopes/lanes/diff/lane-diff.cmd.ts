import { Command, CommandOptions } from '@teambit/cli';
import { ScopeMain } from '@teambit/scope';
import { Workspace } from '@teambit/workspace';
import { ComponentCompareMain } from '@teambit/component-compare';
import { COMPONENT_PATTERN_HELP } from '@teambit/legacy/dist/constants';
import { LaneDiffGenerator } from './lane-diff-generator';

export class LaneDiffCmd implements Command {
  name = 'diff [values...]';
  description = `show diff between lanes`;
  extendedDescription = `bit lane diff => diff between the current lane and default lane. (only inside workspace).
bit lane diff to => diff between the current lane (or default-lane when in scope) and "to" lane.
bit lane diff from to => diff between "from" lane and "to" lane.`;
  alias = '';
  arguments = [
    {
      name: 'from',
      description: `base lane for comparison`,
    },
    {
      name: 'to',
      description: `lane being compared to base lane`,
    },
  ];
  options = [
    [
      '',
      'pattern <component-pattern>',
      `show lane-diff for components conforming to the specified component-pattern only
component-pattern format: ${COMPONENT_PATTERN_HELP}`,
    ],
  ] as CommandOptions;
  loader = true;
  private = true;
  remoteOp = true;
  skipWorkspace = true;

  constructor(
    private workspace: Workspace,
    private scope: ScopeMain,
    private componentCompare: ComponentCompareMain
  ) {}

  async report([values = []]: [string[]], { pattern }: { pattern?: string }) {
    const laneDiffGenerator = new LaneDiffGenerator(this.workspace, this.scope, this.componentCompare);
    const results = await laneDiffGenerator.generate(values, undefined, pattern);
    return laneDiffGenerator.laneDiffResultsToString(results);
  }
}
