/** @flow */
import Command from '../../command';
import { create } from '../../../api/consumer';
import Component from '../../../consumer/component';

const chalk = require('chalk');

export default class Create extends Command {
  name = 'create <id>';
  description = 'create a new bit';
  alias = 'c';
  opts = [
    ['s', 'specs', 'create specs file automatically'],
    ['j', 'json', 'create bit.json file automatically']
  ];

  action([id, ]: [string], { specs, json }: any): Promise<*> {
    return create(id, specs, json);
  }

  report(component: Component): string {
    const name = component.name;
    const box = component.box;

    return chalk.green(`created bit "${name}" in box "${box}"`);
  }
}
