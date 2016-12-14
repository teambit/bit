/** @flow */
import Command from '../command';
import { prepare } from '../../api';
import { fromBase64 } from '../../utils';

const chalk = require('chalk');

export default class Prepare extends Command {
  name = '_prepare <name> <json>';
  description = 'prepare a bit prior to a scope registration';
  private = true;
  alias = '';
  opts = [];

  action([name, json]: [string], opts: {[string]: boolean}): Promise<*> {
    return prepare({ name: fromBase64(name), json: fromBase64(json) });
  }

  report({ path }: any): string {
    return path; 
  }
}
