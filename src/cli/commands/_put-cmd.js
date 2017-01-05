/** @flow */
import Command from '../command';
import { fromBase64 } from '../../utils';
import { put } from '../../api';

export default class Put extends Command {
  name = '_put <path> <name> <tar>';
  private = true;
  description = 'upload a bit to a scope';
  alias = '';
  opts = [];
  
  action([path, name, tar, ]: [string, string, string, ]): Promise<any> {
    return put({
      name: fromBase64(name), 
      tar: new Buffer(tar, 'base64'),
      path: fromBase64(path)
    });
  }

  report(): string {
    return 'ok';
  }
}
