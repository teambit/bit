/** @flow */
import Command from '../../command';
import { fromBase64 } from '../../../utils';
import { fetch } from '../../../api/scope';
import ComponentObjects from '../../../scope/component-objects';
import { pack } from '../../cli-utils';

export default class Fetch extends Command {
  name = '_fetch <path> <ids...>';
  private = true;
  description = 'fetch bit components(s) from a scope';
  alias = '';
  opts = [];

  action([path, ids, ]: [string, string[], ]): Promise<any> {
    return fetch(fromBase64(path), ids.map(fromBase64));
  }

  report(componentObjects: ComponentObjects[]): string {
    return pack(componentObjects.map(obj => obj.toString()));
  }
}
