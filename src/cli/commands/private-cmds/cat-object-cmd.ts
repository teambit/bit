import { catObject } from '../../../api/scope';
import { CommandOptions, LegacyCommand } from '../../legacy-command';

export default class CatObject implements LegacyCommand {
  name = 'cat-object <hash>';
  description = 'cat a bit object by hash';
  private = true;
  loader = false;
  alias = '';
  opts = [
    ['p', 'pretty', 'pretty print for the objects'],
    ['s', 'stringify', 'JSON.stringify the object to see special characters, such as "\n"'],
    ['', 'headers', 'shows the headers only'],
  ] as CommandOptions;

  action(
    [hash]: [string],
    { pretty, stringify, headers }: { pretty: boolean; stringify: boolean; headers: boolean }
  ): Promise<any> {
    return catObject(hash, pretty, stringify, headers);
  }

  report(file: any): string {
    return file.toString();
  }
}
