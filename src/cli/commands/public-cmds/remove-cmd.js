/** @flow */
import chalk from 'chalk';
import Command from '../../command';
import { remove } from '../../../api/consumer';


export default class Remove extends Command {
  name = 'remove <ids...>';
  description = 'remove a bit';
  alias = 'rm';
  opts = [
    ['i', 'inline', 'remove inline bit']
  ];

  action([ids]: [string], opts:any):Promise<any> {
    return remove(ids);

  }
}

//   report({ name, inline }: any): string {
//     const pathTo: string = inline ? 'inline' : 'external';
//     return chalk.green(`removed the bit "${name}" from the ${pathTo} directory`);
//   }
// }
