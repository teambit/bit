import Command, { CommandOption } from '../../command';
import { catComponent } from '../../../api/scope';

export default class CatComponent extends Command {
  name = 'cat-component [id]';
  description = 'cat a bit object by component-id';
  private = true;
  alias = 'cmp';
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  opts: CommandOption[] = [['j', 'json', 'show the output in JSON format']];

  action([id]: [string]): Promise<any> {
    return catComponent(id);
  }

  report(result: any): string {
    return JSON.stringify(result, null, 4);
  }
}
