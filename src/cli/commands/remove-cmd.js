/** @flow */
import chalk from 'chalk';
import Command from '../command';
import { remove } from '../../api';

export default class Remove extends Command {
  name = 'rm <name>';
  description = 'remove a bit';
  alias = '';
  opts = [
    ['i', 'inline', 'remove inline bit']
  ];
  
  action([name]: [string], opts: any): Promise<any> {    
    return remove(name, opts)
    .then(() => ({
      name,
      inline: opts.inline
    }));
  }

  report({ name, inline }: any): string {
    const pathTo: string = inline ? 'inline' : 'external';
    return chalk.green(`removed the bit "${name}" from the ${pathTo} directory`);
  }
}
