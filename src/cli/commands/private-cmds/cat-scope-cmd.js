/** @flow */
import Table from 'tty-table';
import chalk from 'chalk';
import Command from '../../command';
import { catScope } from '../../../api/scope';
import componentObject from '../../../scope/models/component';

export default class CatScope extends Command {
  name = 'cat-scope [scopePath]';
  description = 'cat a scope and show all the contents';
  private = true;
  alias = '';
  opts = [['f', 'full', 'show all of the objects in the scope']];

  action([scopePath]: [string], { full }: { full: ?boolean }): Promise<any> {
    return catScope(scopePath || process.cwd(), full).then(payload => ({ payload, full }));
  }

  report({ payload, full }: { payload: componentObject[], full: ?boolean }): string {
    if (!full) {
      const header = [
        { value: 'Id', width: 50, headerColor: 'cyan' },
        { value: 'Object', width: 50, headerColor: 'cyan' }
      ];
      const opts = {
        align: 'left'
      };

      const table = new Table(header, [], opts);
      payload.forEach(co => table.push([co.id(), co.hash().toString()]));
      return table.render();
    }

    return payload.map(co => `> ${co.hash().toString()}\n\n${co.id()}\n`).join('\n');
  }
}
