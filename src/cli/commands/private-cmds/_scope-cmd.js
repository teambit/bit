/** @flow */
import bit from 'bit-js';
import Command from '../../command';
import { describeScope } from '../../../api/scope';
import { fromBase64, empty } from '../../../utils';

const toBase64 = bit('string/to-base64');

export default class Prepare extends Command {
  name = '_scope <path>';
  description = 'describe a scope';
  private = true;
  alias = '';
  opts = [];

  action([path, ]: [string, ]): Promise<*> {
    return describeScope(fromBase64(path));
  }

  report(scopeObj: any): string {
    if (empty(scopeObj)) return '';
    return toBase64(JSON.stringify(scopeObj)); 
  }
}
