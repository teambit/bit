import Command, { CommandOptions } from '../../command';
import { catComponent } from '../../../api/scope';

export default class CatComponent extends Command {
  name = 'cat-component [id]';
  description = 'cat a bit object by component-id';
  private = true;
  alias = 'cmp';
  opts = [
    // json is also the default for this command. it's only needed to suppress the logger.console
    ['j', 'json', 'json format']
  ] as CommandOptions;

  action([id]: [string]): Promise<any> {
    return catComponent(id);
  }

  report(result: any): string {
    return JSON.stringify(result, null, 4);
  }
}
