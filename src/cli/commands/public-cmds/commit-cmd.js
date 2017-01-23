/** @flow */
import Command from '../../command';
import { commitAction } from '../../../api/consumer';
import Component from '../../../consumer/component';

export default class Export extends Command {
  name = 'commit <id> <message>';
  description = 'commit a bit to the local scope and add a log message';
  alias = 'c';
  opts = [];

  action([id, message]: [string, string]): Promise<any> {
    return commitAction({ id, message });
  }

  report(c: Component): string {
    return `component ${c.box}/${c.name} commited succesfully`;
  }
}
