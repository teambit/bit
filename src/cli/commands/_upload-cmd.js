/** @flow */
import Command from '../command';
import { fromBase64 } from '../../utils';
import { upload } from '../../api';

export default class Box extends Command {
  name = '_upload <name> <tar>';
  private = true;
  description = 'upload a bit to a scope';
  alias = '';
  opts = [];
  
  action([name, tar, ]: [string, string, ]): Promise<any> {
    return upload({
      name: fromBase64(name), 
      tar: new Buffer(tar, 'base64') 
    });
  }

  report(): string {
    return 'ok';
  }
}
