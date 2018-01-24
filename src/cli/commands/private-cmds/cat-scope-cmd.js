/** @flow */
import Table from 'tty-table';
import Command from '../../command';
import { catScope } from '../../../api/scope';
import componentObject from '../../../scope/models/component';

export default class CatScope extends Command {
  name = 'cat-scope [scopePath]';
  description = 'cat a scope and show all the contents';
  private = true;
  alias = '';
  opts = [['f', 'full', 'show all of the objects in the scope'], ['j', 'json', 'print the results as a json object']];

  action([scopePath]: [string], { full, json }: { full: ?boolean, json: ?boolean }): Promise<any> {
    return catScope(scopePath || process.cwd(), full).then(payload => ({ payload, full, json }));
  }

  report({ payload, full, json }: { payload: componentObject[], full: ?boolean, json: ?boolean }): string {
    if (json) {
      return JSON.stringify(payload);
    }
    if (!full) {
      const header = [
        { value: 'Id', width: 70, headerColor: 'cyan' },
        { value: 'Object', width: 50, headerColor: 'cyan' }
      ];
      const opts = {
        align: 'left'
      };

      const table = new Table(header, [], opts);
      payload.forEach(co => table.push([co.id(), `obj: ${co.hash().toString()}`]));
      return table.render();
    }

    return payload.map(co => `> ${co.hash().toString()}\n\n${co.id()}\n`).join('\n');
  }
}
