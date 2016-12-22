/** @flow */
import Command from '../command';
import { toBase64, fromBase64 } from '../../utils';
import { fetch } from '../../api';

export default class Fetch extends Command {
  name = '_fetch <path> <ids...>';
  private = true;
  description = 'fetch a bit from a scope';
  alias = '';
  opts = [];

  action([path, ids, ]: [string, string[], ]): Promise<any> {
    return fetch(fromBase64(path), ids.map(fromBase64));
  }

  report(tars: {id: string, contents: Buffer}[]): string {
    return tars.map(tar => `${toBase64(tar.id)}::${tar.contents.toString('base64')}`).join('!!!');
  }
}
