import Table from 'cli-table';
import type { Command, CommandOptions } from '@teambit/cli';
import { catScope } from './cat-scope';

type Flags = { full?: boolean; json?: boolean; jsonExtra?: boolean };

export class CatScopeCmd implements Command {
  name = 'cat-scope [scopePath]';
  description = 'cat a scope and show all the contents';
  private = true;
  loader = false;
  alias = '';
  group = 'advanced';
  options = [
    ['f', 'full', 'show all of the objects in the scope (except "Source")'],
    ['j', 'json', 'print the objects as a json format'],
    ['e', 'json-extra', 'add hash and object type to the json'],
  ] as CommandOptions;
  loadAspects = false;

  async report([scopePath]: [string], { full }: Flags) {
    const payload = await catScope(scopePath || process.cwd(), full);
    if (!full) {
      const table = new Table({ head: ['id', 'Object', 'Type'], style: { head: ['cyan'] } });
      payload.forEach((co: any) => {
        table.push([co.id(), `obj: ${co.hash().toString()}`, co.getType()]);
      });
      return table.toString();
    }

    return payload.map((co) => `> ${co.hash().toString()}\n\n${co.id()}\n`).join('\n');
  }

  async json([scopePath]: [string], { full, jsonExtra }: Flags) {
    const payload = await catScope(scopePath || process.cwd(), full);
    if (jsonExtra) {
      payload.forEach((obj) => {
        // the objects are serialized as JSON, so the `hash` method and the `type` are replaced by plain values
        const plainObject = obj as unknown as Record<string, unknown>;
        plainObject.hash = obj.hash().toString();
        plainObject.type = obj.constructor.name;
      });
    }
    return payload;
  }
}
