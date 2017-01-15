/** @flow */
import Command from '../command';
import { commitAction } from '../../api';
import Component from '../../consumer/bit-component';

export default class Export extends Command {
  name = 'commit <id>';
  description = 'commit a bit to the local scope';
  alias = 'c';
  opts = [
  ];

  action([id]: [string]): Promise<any> {
    return commitAction({ id });
  }

  report(c: Component): string {
    return `bit ${c.box}/${c.name} commited succesfully`;
    // return chalk.green(`exported bit "${name}" from inline to external`);
  }
}
