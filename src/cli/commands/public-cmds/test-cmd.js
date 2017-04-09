/** @flow */
import Command from '../../command';
import { testInline, testInlineAll } from '../../../api/consumer';
import { testInScope } from '../../../api/scope';
import { paintSpecsResults, paintAllSpecsResults } from '../../chalk-box';

export default class Test extends Command {
  name = 'test [id]';
  description = 'run component(s) unit tests';
  alias = 't';
  opts = [
    ['i', 'inline', 'test an inline component specs'],
    ['e', 'environment', 'also pre install the required environment bit before running the build'],
    ['s', 'save', 'for running build and save the results in the model'],
    ['v', 'verbose', 'showing npm verbose output for inspection'],
  ];

  action([id, ]: [string, ], { inline, save, environment, verbose }: {
    inline: ?bool,
    save: ?bool,
    environment: ?bool,
    verbose: ?bool,
  }): Promise<any> {
    function test() {
      if (!id) return testInlineAll(id);
      if (inline) return testInline(id);
      return testInScope({ id, environment, save, verbose });
    }

    return test()
    .then(res => ({
      res,
      inline,
    }));
  }

  report({ res }: { res: any, inline: ?bool }): string {
    if (res) {
      return Array.isArray(res) ? paintAllSpecsResults(res) : paintSpecsResults(res);
    }

    return 'couldn\'t get test results...';
  }
}
