/** @flow */
import Command from '../command';
import { validatePush } from '../../api';

const chalk = require('chalk');

export default class Create extends Command {
  name = 'validate-push <name> <json>';
  description = 'validate a bit prior to a network sync';
  private = true;
  alias = '';
  opts = [
  ];

  action([name, json]: [string], opts: {[string]: boolean}): Promise<*> {
    return validatePush(name, json);
  }

  report({ name }: any): string {
    return console.log('hi');
  }
}
