/** @flow */
import Command from '../command';
import { toBase64, fromBase64 } from '../../utils';
import { fetch } from '../../api';

export default class Fetch extends Command {
  name = '_fetch <ids...>';
  private = true;
  description = 'upload a bit to a scope';
  alias = '';
  opts = [];
  
  action([ids, ]: [string[], string, ]): Promise<any> {
    return fetch(ids.map(fromBase64));
  }

  report(tars: {id: string, contents: Buffer}[]): string {
    return tars.map(tar => `${toBase64(tar.id)}::${tar.contents.toString('base64')}`).join('\n');
  }
}
