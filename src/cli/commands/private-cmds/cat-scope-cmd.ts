import Table from 'cli-table';

import { catScope } from '../../../api/scope';
import ModelComponent from '../../../scope/models/model-component';
import { CommandOptions, LegacyCommand } from '../../legacy-command';

export default class CatScope implements LegacyCommand {
  name = 'cat-scope [scopePath]';
  description = 'cat a scope and show all the contents';
  private = true;
  loader = false;
  alias = '';
  opts = [
    ['f', 'full', 'show all of the objects in the scope (except "Source")'],
    ['j', 'json', 'print the objects as a json format'],
    ['e', 'json-extra', 'add hash and object type to the json'],
  ] as CommandOptions;

  action(
    [scopePath]: [string],
    {
      full,
      json,
      jsonExtra,
    }: { full: boolean | null | undefined; json: boolean | null | undefined; jsonExtra: boolean | null | undefined }
  ): Promise<any> {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return catScope(scopePath || process.cwd(), full).then((payload) => ({ payload, full, json, jsonExtra }));
  }

  report({
    payload,
    full,
    json,
    jsonExtra,
  }: {
    payload: ModelComponent[];
    full: boolean | null | undefined;
    json: boolean | null | undefined;
    jsonExtra: boolean | null | undefined;
  }): string {
    if (jsonExtra) {
      payload.forEach((obj) => {
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        obj.hash = obj.hash().toString();
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        obj.type = obj.constructor.name;
      });
      return JSON.stringify(payload, null, 2);
    }
    if (json) {
      return JSON.stringify(payload, null, 2);
    }
    if (!full) {
      const table = new Table({ head: ['id', 'Object', 'Type'], style: { head: ['cyan'] } });
      payload.forEach((co) => {
        table.push([co.id(), `obj: ${co.hash().toString()}`, co.getType()]);
      });
      return table.toString();
    }

    return payload.map((co) => `> ${co.hash().toString()}\n\n${co.id()}\n`).join('\n');
  }
}
