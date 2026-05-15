import type { Command, CommandOptions } from '@teambit/cli';
import { formatSuccessSummary, formatHint } from '@teambit/cli';
import type { DeprecationMain } from './deprecation.main.runtime';
import { deprecateCommand } from './deprecation.commands';

export class DeprecateCmd implements Command {
  name = deprecateCommand.name;
  arguments = deprecateCommand.arguments;
  description = deprecateCommand.description;
  extendedDescription = deprecateCommand.extendedDescription;
  group = deprecateCommand.group;
  skipWorkspace = deprecateCommand.skipWorkspace;
  alias = deprecateCommand.alias;
  options = deprecateCommand.options;
  loader = deprecateCommand.loader;
  remoteOp = deprecateCommand.remoteOp;
  helpUrl = deprecateCommand.helpUrl;

  constructor(private deprecation: DeprecationMain) {}

  async report([id]: [string], { newId, range }: { newId?: string; range?: string }): Promise<string> {
    const result = await this.deprecate(id, newId, range);
    if (result) {
      return formatSuccessSummary(`the component "${id}" has been deprecated successfully`);
    }
    return formatHint(`the component "${id}" is already deprecated. no changes have been made`);
  }

  private async deprecate(id: string, newId?: string, range?: string): Promise<boolean> {
    return this.deprecation.deprecateByCLIValues(id, newId, range);
  }
}
