/** @flow */
import Command from '../../command';
import { commitAction } from '../../../api/consumer';
import Component from '../../../consumer/component';

export default class Export extends Command {
  name = 'commit <id> <message>';
  description = 'commit a component to the local scope and add a log message';
  alias = 'c';
  opts = [];
  loader = { autoStart: false, text: 'importing components' };

  action([id, message]: [string, string]): Promise<any> {
    const loader = this.loader;
    return commitAction({ id, message, loader });
  }

  report(c: Component): string {
    return `component ${c.box}/${c.name} commited succesfully`;
  }
}
