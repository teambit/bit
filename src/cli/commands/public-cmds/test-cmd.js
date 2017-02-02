/** @flow */
import Command from '../../command';
import { testInline } from '../../../api/consumer';
import { testInScope } from '../../../api/scope';
import type { Results } from '../../../specs-runner/specs-runner';
import { paintSpecsResults } from '../../chalk-box';

export default class Test extends Command {
  name = 'test <id>';
  description = 'run component(s) unit tests';
  alias = 't';
  opts = [
    ['i', 'inline', 'test an inline component specs']
  ];

  action([id, ]: [string, ], { inline }: { inline: ?bool }): Promise<any> {
    function build() {
      if (inline) return testInline(id);
      return testInScope(id);
    }
    
    return build().then(res => ({
      res,
      inline,
    }));
  }

  report({ res, inline }: { res: Results, inline: ?bool }): string {
    if (res) {
      return paintSpecsResults(res);
    }

    return 'couldn\'t get results results...';
  }
}
