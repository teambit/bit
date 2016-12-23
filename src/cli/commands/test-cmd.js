/** @flow */
import Command from '../command';
import { test } from '../../api';

const chalk = require('chalk');

export default class Test extends Command {
  name = 'test <id>';
  description = 'run bit(s) unit tests';
  alias = 't';
  opts = [];

  action([id, ]: [string]): Promise<any> {
    console.log('testing bits...');
    return test(id);
  }

  report(pass: {string: any}): string {
    return pass ? chalk.green('All specs have passed') : chalk.red('At least one spec has failed');
  }
}
