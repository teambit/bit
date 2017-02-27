/** @flow */
import Command from '../../command';
import { fromBase64 } from '../../../utils';
import { fetch } from '../../../api/scope';
import ComponentObjects from '../../../scope/component-objects';
import { pack } from '../../cli-utils';

export default class Fetch extends Command {
  name = '_fetch <path> <ids...>';
  private = true;
  description = 'fetch components(s) from a scope';
  alias = '';
  opts = [
    ['n', 'no_dependencies', 'do not include component dependencies']
  ];

  action([path, ids, ]: [string, string[], ], { no_dependencies }: any): Promise<any> {
    return fetch(fromBase64(path), ids.map(fromBase64), no_dependencies);
  }

  report(componentObjects: ComponentObjects[]): string {
    return pack(componentObjects.map(obj => obj.toString()));
  }
}
