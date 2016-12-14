/** @flow */
import { loadBox } from '../../box';
import Command from '../command';

const chalk = require('chalk');

export default class Import extends Command {
  name = 'import [id]';
  description = 'import a bit';
  alias = 'i';
  opts = [
    ['S', 'save', 'save into bit.json']
  ];

  action([id]: [string]): Promise<any> {
    if ()
    const bitId = BitId.parse();
    bikId.remote.fetch(bitId);
  }

  report({ name }: any): string {
    return chalk.green(`exported bit "${name}" from inline to external`);
  }

}
