/** @flow */
import Command from '../command';
import { getBit } from '../../api';

const chalk = require('chalk');


export default class Build extends Command {
  name = 'build <name>';
  description = 'build a bit';
  alias = '';
  opts = [];
  
  action([name, ]: [string]): Promise<*> {
    return getBit({ name })
    .then((bit) => {
      bit.build();
      return { name: bit.name };
    });
  }

  report({ name }: any): string {
    return chalk.bgGreen(`this is build reporting for ${name}`);
  }
}
