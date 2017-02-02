/** @flow */
import Command from '../../command';
import { commitAction } from '../../../api/consumer';
import Component from '../../../consumer/component';

export default class Export extends Command {
  name = 'commit <id> <message>';
  description = 'commit a component to the local scope and add a log message';
  alias = 'c';
  opts = [
    ['f', 'force', 'forcely commit even if specs fails'],
  ];
  loader = { autoStart: false, text: 'importing components' };

  action([id, message]: [string, string], { force }: { force: ?bool }): Promise<any> {
    const loader = this.loader;
    return commitAction({ id, message, force, loader });
  }

  report(c: Component): string {
    return `component ${c.box}/${c.name} commited succesfully`;
  }
}
