import Command from '../../command';
import { catObject } from '../../../api/scope';

export default class CatObject extends Command {
  name = 'cat-object <hash>';
  description = 'cat a bit object by hash';
  private = true;
  alias = '';
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  opts = [
    ['p', 'pretty', 'pretty print for the objects'],
    ['s', 'stringify', 'JSON.stringify the object to see special characters, such as "\n"']
  ];

  action([hash]: [string], { pretty, stringify }: { pretty: boolean; stringify: boolean }): Promise<any> {
    // @TODO - import should support multiple bits
    return catObject(hash, pretty, stringify);
  }

  report(file: any): string {
    return file.toString();
  }
}
