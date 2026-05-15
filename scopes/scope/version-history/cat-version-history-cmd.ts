import type { Command, CommandOptions } from '@teambit/cli';
import { catVersionHistory } from './cat-version-history';
import { catVersionHistoryCommand } from './version-history.commands';

export class CatVersionHistoryCmd implements Command {
  name = catVersionHistoryCommand.name;
  description = catVersionHistoryCommand.description;
  private = catVersionHistoryCommand.private;
  alias = catVersionHistoryCommand.alias;
  loadAspects = catVersionHistoryCommand.loadAspects;
  options = catVersionHistoryCommand.options;
  group = catVersionHistoryCommand.group;

  async report([id]: [string]) {
    const result = await catVersionHistory(id);
    return JSON.stringify(result, null, 4);
  }

  async json([id]: [string]) {
    return catVersionHistory(id);
  }
}
