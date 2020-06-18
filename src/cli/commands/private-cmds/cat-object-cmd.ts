import { LegacyCommand, CommandOptions } from '../../legacy-command';
import { catObject } from '../../../api/scope';

export default class CatObject implements LegacyCommand {
  name = 'cat-object <hash>';
  description = 'cat a bit object by hash';
  private = true;
  alias = '';
  opts = [
    ['p', 'pretty', 'pretty print for the objects'],
    ['s', 'stringify', 'JSON.stringify the object to see special characters, such as "\n"']
  ] as CommandOptions;

  action([hash]: [string], { pretty, stringify }: { pretty: boolean; stringify: boolean }): Promise<any> {
    // @TODO - import should support multiple bits
    return catObject(hash, pretty, stringify);
  }

  report(file: any): string {
    return file.toString();
  }
}
