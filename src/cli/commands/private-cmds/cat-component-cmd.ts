import Command from '../../command';
import { catComponent } from '../../../api/scope';

export default class CatComponent extends Command {
  name = 'cat-component [id]';
  description = 'cat a bit object by component-id';
  private = true;
  alias = 'cmp';
  opts = [];

  action([id]: [string]): Promise<any> {
    return catComponent(id);
  }

  report(result: any): string {
    return JSON.stringify(result, null, 4);
  }
}
