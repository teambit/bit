/** @flow */
import Command from '../command';
import { fromBase64 } from '../../utils';
import { fetch } from '../../api';

export default class Fetch extends Command {
  name = '_fetch <ids...>';
  private = true;
  description = 'upload a bit to a scope';
  alias = '';
  opts = [];
  
  action([ids, ]: [string, string, ]): Promise<any> {
    return fetch(ids);
  }

  report(): string {
    return 'ok';
  }
}
