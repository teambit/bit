import type { Command, CommandOptions } from '@teambit/cli';
import { formatSuccessSummary, formatHint } from '@teambit/cli';
import type { DeprecationMain } from './deprecation.main.runtime';
import { undeprecateCommand } from './deprecation.commands';

export class UndeprecateCmd implements Command {
  name = undeprecateCommand.name;
  group = undeprecateCommand.group;
  description = undeprecateCommand.description;
  extendedDescription = undeprecateCommand.extendedDescription;
  alias = undeprecateCommand.alias;
  options = undeprecateCommand.options;
  loader = undeprecateCommand.loader;
  skipWorkspace = undeprecateCommand.skipWorkspace;
  remoteOp = undeprecateCommand.remoteOp;

  constructor(private deprecation: DeprecationMain) {}

  async report([id]: [string]): Promise<string> {
    const result = await this.deprecation.unDeprecateByCLIValues(id);
    if (result) {
      return formatSuccessSummary(`the component "${id}" has been undeprecated successfully`);
    }
    return formatHint(`the component "${id}" is not currently deprecated. no changes have been made`);
  }
}
