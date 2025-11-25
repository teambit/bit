import type { Command, CommandOptions } from '@teambit/cli';
import { catVersionHistory } from './cat-version-history';

export class CatVersionHistoryCmd implements Command {
  name = 'cat-version-history <id>';
  description = 'cat version-history object by component-id';
  private = true;
  alias = 'cvh';
  loadAspects = false;
  options = [
    // json is also the default for this command. it's only needed to suppress the logger.console
    ['j', 'json', 'json format'],
  ] as CommandOptions;
  group = 'advanced';

  async report([id]: [string]) {
    const result = await catVersionHistory(id);
    return JSON.stringify(result, null, 4);
  }

  async json([id]: [string]) {
    return catVersionHistory(id);
  }
}
