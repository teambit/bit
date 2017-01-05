/** @flow */
import Command from '../command';
import { toBase64, fromBase64 } from '../../utils';
import { fetch } from '../../api';
import { BitDependencies } from '../../scope';

export default class Fetch extends Command {
  name = '_fetch <path> <ids...>';
  private = true;
  description = 'fetch bit components(s) from a scope';
  alias = '';
  opts = [];

  action([path, ids, ]: [string, string[], ]): Promise<any> {
    return fetch(fromBase64(path), ids.map(fromBase64));
  }

  report([bitDependencies, scopeName]: [string[], string]): string {
    return [bitDependencies.map(bit => toBase64(bit)).join('!!!'), scopeName].join(' ');
  }
}
