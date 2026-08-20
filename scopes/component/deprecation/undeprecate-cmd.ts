import type { Command, CommandOptions } from '@teambit/cli';
import { COMPONENT_PATTERN_HELP } from '@teambit/legacy.constants';
import type { DeprecationMain } from './deprecation.main.runtime';
import { formatPatternResult } from './format-pattern-result';

export class UndeprecateCmd implements Command {
  name = 'undeprecate <component-pattern>';
  arguments = [{ name: 'component-pattern', description: COMPONENT_PATTERN_HELP }];
  group = 'collaborate';
  description = 'remove the deprecation status from components';
  extendedDescription = `reverses the deprecation of components, removing warnings and allowing normal use again.
the pattern can match multiple components, so several can be undeprecated at once.`;
  alias = '';
  options = [] as CommandOptions;
  loader = true;
  skipWorkspace = true;
  remoteOp = true;
  examples = [
    {
      // single-quote "$deprecated" so the shell doesn't expand it as an env var
      cmd: "undeprecate '$deprecated'",
      description: 'undeprecate all currently-deprecated components',
    },
  ];

  constructor(private deprecation: DeprecationMain) {}

  async report([pattern]: [string]): Promise<string> {
    const { undeprecated, notDeprecated } = await this.deprecation.unDeprecateByPattern(pattern);
    return formatPatternResult(pattern, undeprecated, notDeprecated, {
      verb: 'undeprecated',
      unchangedTitle: 'not deprecated',
      unchangedState: 'not currently deprecated',
    });
  }
}
