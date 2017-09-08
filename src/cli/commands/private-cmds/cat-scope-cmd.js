/** @flow */
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
      return payload.map(co => `${co.id()} -> ${co.hash().toString()}`).join('\n');
    }

    return payload.map(co => `> ${co.hash().toString()}\n\n${co.id()}\n`).join('\n');
  }
}
