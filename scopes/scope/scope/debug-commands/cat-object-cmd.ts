import { catObject } from './cat-object';
import { Command, CommandOptions } from '@teambit/cli';

export default class CatObjectCmd implements Command {
  name = 'cat-object <hash>';
  description = 'cat a bit object by hash';
  private = true;
  loader = false;
  alias = '';
  options = [
    ['p', 'pretty', 'pretty print for the objects'],
    ['s', 'stringify', 'JSON.stringify the object to see special characters, such as "\n"'],
    ['', 'headers', 'shows the headers only'],
  ] as CommandOptions;
  loadAspects = false;

  async report(
    [hash]: [string],
    { pretty, stringify, headers }: { pretty: boolean; stringify: boolean; headers: boolean }
  ) {
    const file = await catObject(hash, pretty, stringify, headers);
    return file.toString();
  }
}
