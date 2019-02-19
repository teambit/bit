/** @flow */
import Table from 'tty-table';
import Command from '../../command';
import { catScope } from '../../../api/scope';
import ModelComponent from '../../../scope/models/model-component';

export default class CatScope extends Command {
  name = 'cat-scope [scopePath]';
  description = 'cat a scope and show all the contents';
  private = true;
  alias = '';
  opts = [
    ['f', 'full', 'show all of the objects in the scope'],
    ['j', 'json', 'print the objects as a json format'],
    ['e', 'json-extra', 'add hash and object type to the json']
  ];

  action(
    [scopePath]: [string],
    { full, json, jsonExtra }: { full: ?boolean, json: ?boolean, jsonExtra: ?boolean }
  ): Promise<any> {
    return catScope(scopePath || process.cwd(), full).then(payload => ({ payload, full, json, jsonExtra }));
  }

  report({
    payload,
    full,
    json,
    jsonExtra
  }: {
    payload: ModelComponent[],
    full: ?boolean,
    json: ?boolean,
    jsonExtra: ?boolean
  }): string {
    if (jsonExtra) {
      payload.forEach((obj) => {
        // $FlowFixMe
        obj.hash = obj.hash().toString();
        // $FlowFixMe
        obj.type = obj.constructor.name;
      });
      return JSON.stringify(payload, null, 2);
    }
    if (json) {
      return JSON.stringify(payload, null, 2);
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
