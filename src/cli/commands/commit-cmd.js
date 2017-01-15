/** @flow */
import Command from '../command';
import { commitAction } from '../../api';

export default class Export extends Command {
  name = 'commit <id>';
  description = 'commit a bit to the local scope';
  alias = 'c';
  opts = [
  ];

  action([id]: [string]): Promise<any> {
    return commitAction({ id });
  }

  report(): string {
    return 'bit commited succesfully';
    // return chalk.green(`exported bit "${name}" from inline to external`);
  }

}
