import type { Command, CommandOptions } from '@teambit/cli';
import chalk from 'chalk';
import { BitError } from '@teambit/bit-error';
import { type ComponentID } from '@teambit/component-id';
import { getRemoteByName } from '@teambit/scope.remotes';
import type { Workspace } from './workspace';
import { statesFilter } from './filter';

type PatternFlags = {
  json?: boolean;
  remote?: boolean;
};

export class PatternCommand implements Command {
  name = 'pattern <pattern>';
  alias = '';
  description = 'test and validate component patterns';
  extendedDescription = `this command helps validating a pattern before using it in other commands.
NOTE: always wrap the pattern with quotes to avoid collision with shell commands. depending on your shell, it might be single or double quotes.
a pattern can be a simple component-id or component-name. e.g. 'ui/button'.
a pattern can be used with wildcards for multiple component ids, e.g. 'org.scope/utils/**' or '**/utils/**' to capture all org/scopes.
to enter multiple patterns, separate them by a comma, e.g. 'ui/*, lib/*'
to exclude, use '!'. e.g. 'ui/**, !ui/button'
the matching algorithm is from multimatch (@see https://github.com/sindresorhus/multimatch).

to filter by a state or attribute, prefix the pattern with "$". e.g. '$deprecated', '$modified'.
list of supported states: [${statesFilter.join(', ')}].
to filter by multi-params state/attribute, separate the params with ":", e.g. '$env:teambit.react/react'.
list of supported multi-params states: [env].
to match a state and another criteria, use " AND " keyword. e.g. '$modified AND teambit.workspace/** AND $env:teambit.react/react'.
`;
  examples = [
    { cmd: "bit pattern '**'", description: 'matches all components' },
    {
      cmd: "bit pattern '*/ui/*'",
      description:
        'matches components with any scope-name and the "ui" namespace. e.g. "ui/button" but not "ui/elements/button"',
    },
    {
      cmd: "bit pattern '*/ui/**'",
      description: 'matches components whose namespace starts with "ui/" e.g. "ui/button", "ui/elements/button"',
    },
    { cmd: "bit pattern 'bar, foo'", description: 'matches two components: bar and foo' },
    { cmd: "bit pattern 'my-scope.org/**'", description: 'matches all components of the scope "my-scope.org"' },
    {
      cmd: "bit pattern --remote 'teambit.workspace/**'",
      description: 'matches all components from the remote scope "teambit.workspace"',
    },
  ];
  group = 'info-analysis';
  private = false;
  options = [
    ['j', 'json', 'return the output as JSON'],
    ['r', 'remote', 'query a remote scope (the pattern must start with the scope name, e.g. "scope-name/**")'],
  ] as CommandOptions;
  remoteOp = true;

  constructor(private workspace: Workspace) {}

  async report([pattern]: [string], flags: PatternFlags) {
    const ids = await this.json([pattern], flags);
    const title = chalk.green(`found ${chalk.bold(ids.length.toString())} components matching the pattern`);
    return `${title}\n${ids.join('\n')}`;
  }

  async json([pattern]: [string], flags: PatternFlags): Promise<string[]> {
    const { remote } = flags;
    if (remote) {
      const ids = await this.getRemoteIds(pattern);
      return ids.map((id) => id.toString());
    }
    const ids = await this.workspace.idsByPattern(pattern, false);
    return ids.map((id) => id.toString());
  }

  private async getRemoteIds(pattern: string): Promise<ComponentID[]> {
    const patterns = pattern.split(',').map((p) => p.trim());
    // Extract unique scope names from patterns (excluding negation patterns for fetching)
    const scopeNames = this.extractScopeNames(patterns.filter((p) => !p.startsWith('!')));

    // Fetch all component IDs from all referenced remote scopes
    const allIds: ComponentID[] = [];
    for (const scopeName of scopeNames) {
      const remoteObj = await getRemoteByName(scopeName, this.workspace.consumer);
      const listResults = await remoteObj.list();
      allIds.push(...listResults.map((r) => r.id));
    }

    // Use the existing pattern filtering logic
    const filteredIds = await this.workspace.scope.filterIdsFromPoolIdsByPattern(pattern, allIds, false);
    return filteredIds;
  }

  private extractScopeNames(patterns: string[]): string[] {
    const scopeNames = new Set<string>();
    for (const p of patterns) {
      if (!p.includes('/')) {
        throw new BitError(
          `when using --remote, the pattern must include the scope name followed by "/", e.g. "scope-name/**". got "${p}"`
        );
      }
      const [scopeName] = p.split('/');
      scopeNames.add(scopeName);
    }
    return Array.from(scopeNames);
  }
}
