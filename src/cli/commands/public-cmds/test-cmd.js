/** @flow */
import Command from '../../command';
import { testInline } from '../../../api/consumer';

export default class Test extends Command {
  name = 'test <id>';
  description = 'run bit(s) unit tests';
  alias = 't';
  opts = [
    ['i', 'inline', 'test an inline bit specs']
  ];

  action([id, ]: [string, ], { inline }: { inline: ?bool }): Promise<any> {
    function build() {
      if (inline) return testInline(id);
      throw new Error('TODO - need implement from scope'); // TODO - need implemetn
      // return testInScope(id);
    }
    
    return build().then(res => ({
      res,
      inline,
    }));
  }

  report(results: {string: any}): string {
    if (results) {
      console.log(results);
      return 'tests pass';
    }

    return 'no results...';
  }
}
