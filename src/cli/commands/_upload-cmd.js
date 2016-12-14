/** @flow */
import Command from '../command';
import fromBase64 from '../../utils';
// import { box } from '../../api';

export default class Box extends Command {
  name = '_upload <tar>';
  description = 'upload a bit to a scope';
  alias = '';
  opts = [
  ];
  
  action([tar, ]: [string, ]): Promise<any> {
    return new Promise((resolve, reject) => {
      const a = fromBase64(tar);
      resolve(a);
    });
  }

  report(): string {
    return 'ok';
  }
}
