/** @flow */
import Command from '../command';
import { toBase64, fromBase64 } from '../../utils';
import { fetch } from '../../api';
import ComponentObjects from '../../scope/component-objects';

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
    return toBase64(componentObjects.map(obj => obj.toString()).join('+++'));
  }
}
