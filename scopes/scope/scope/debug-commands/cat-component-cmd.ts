import { catComponent } from './cat-component';
import { Command, CommandOptions } from '@teambit/cli';

export class CatComponentCmd implements Command {
  name = 'cat-component [id]';
  description = 'cat a bit object by component-id';
  private = true;
  alias = 'cmp';
  options = [
    // json is also the default for this command. it's only needed to suppress the logger.console
    ['j', 'json', 'json format'],
  ] as CommandOptions;

  async report([id]: [string]) {
    const result = await catComponent(id);
    return JSON.stringify(result, null, 4);
  }
}
