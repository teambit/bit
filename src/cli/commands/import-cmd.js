/** @flow */
import { loadBox } from '../../box';
import Command from '../command';
import { importAction } from '../../api';

const chalk = require('chalk');

export default class Import extends Command {
  name = 'import [ids]';
  description = 'import a bit';
  alias = 'i';
  opts = [
    ['S', 'save', 'save into bit.json']
  ];

  action([id]: [string]): Promise<any> {
    return importAction({ bitId: id });
  }

  report({ name }: any): string {
    console.dir(arguments, { depth: true });
    return chalk.green(`exported bit "${name}" from inline to external`);
  }

}
