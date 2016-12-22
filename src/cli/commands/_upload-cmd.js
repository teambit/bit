/** @flow */
import Command from '../command';
import { fromBase64 } from '../../utils';
import { upload } from '../../api';

export default class Upload extends Command {
  name = '_upload <path> <name> <tar>';
  private = true;
  description = 'upload a bit to a scope';
  alias = '';
  opts = [];
  
  action([path, name, tar, ]: [string, string, string, ]): Promise<any> {
    return upload({
      name: fromBase64(name), 
      tar: new Buffer(tar, 'base64'),
      path: fromBase64(path)
    });
  }

  report(): string {
    return 'ok';
  }
}
