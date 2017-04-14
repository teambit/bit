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
  loader = true;

  action([id, message]: [string, string], { force }: { force: ?bool }): Promise<any> {
    return commitAction({ id, message, force });
  }

  report(c: Component): string {
    return `component ${c.box}/${c.name} committed successfully`;
  }
}
