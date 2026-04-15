import type { Command, CommandOptions } from '@teambit/cli';
import { formatSuccessSummary, formatHint } from '@teambit/cli';
import type { DeprecationMain } from './deprecation.main.runtime';

export class UndeprecateCmd implements Command {
  name = 'undeprecate <id>';
  group = 'collaborate';
  description = 'remove the deprecation status from a component';
  extendedDescription = 'reverses the deprecation of a component, removing warnings and allowing normal use again.';
  alias = '';
  options = [] as CommandOptions;
  loader = true;
  skipWorkspace = true;
  remoteOp = true;

  constructor(private deprecation: DeprecationMain) {}

  async report([id]: [string]): Promise<string> {
    const result = await this.deprecation.unDeprecateByCLIValues(id);
    if (result) {
      return formatSuccessSummary(`the component "${id}" has been undeprecated successfully`);
    }
    return formatHint(`the component "${id}" is not currently deprecated. no changes have been made`);
  }
}
