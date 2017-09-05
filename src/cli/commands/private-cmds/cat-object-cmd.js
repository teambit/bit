/** @flow */
import Command from '../../command';
import { catObject } from '../../../api/scope';

export default class CatObject extends Command {
  name = 'cat-object [hash]';
  description = 'cat a bit object by hash';
  private = true;
  alias = '';
  opts = [
    ['p', 'pretty', 'pretty print for the objects'],
  ];

  action([hash, ]: [string, ], { pretty }: { messprettyge: boolean }): Promise<any> {
    // @TODO - import should support multiple bits
    return catObject(hash, pretty);
  }

  report(file: any): string {
    return file.toString();
  }
}
