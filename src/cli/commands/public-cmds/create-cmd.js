/** @flow */
import Command from '../../command';
import { create } from '../../../api/consumer';
import Component from '../../../consumer/component';

const chalk = require('chalk');

export default class Create extends Command {
  name = 'create <id>';
  description = 'create a new component';
  alias = 'cr';
  opts = [
    ['s', 'specs', 'create specs file automatically'],
    ['j', 'json', 'create bit.json file automatically'],
    ['f', 'force', 'override an existing component']
  ];

  private = true;

  action([id, ]: [string], { specs, json, force }: any): Promise<*> {
    return create(id, specs, json, force);
  }

  report(component: Component): string {
    const name = component.name;
    const box = component.box;

    return chalk.green(`created component "${name}" in box "${box}"`);
  }
}
