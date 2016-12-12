/** @flow */
import Command from '../command';
import { prepare } from '../../api';

const chalk = require('chalk');

export default class Prepare extends Command {
  name = 'prepare <name> <json>';
  description = 'prepare a bit prior to a scope registration';
  private = true;
  alias = '';
  opts = [];

  action([name, json]: [string], opts: {[string]: boolean}): Promise<*> {
    return prepare({ name, json });
  }

  report({ path }: any): string {
    return path; 
  }
}
