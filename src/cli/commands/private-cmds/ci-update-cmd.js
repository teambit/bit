/** @flow */
import Command from '../../command';
import { ciUpdateAction } from '../../../api/scope';
import SpecsResults from '../../../consumer/specs-results/specs-results';
import { paintSpecsResults } from '../../chalk-box';

export default class CiUpdate extends Command {
  name = 'ci-update <id> [scopePath]';
  description = 'run an update for build and test of a certain bit-component';
  alias = '';
  opts = [
    ['v', 'verbose', 'showing npm verbose output for inspection'],
  ];
  private = true;

  action([id, scopePath]: [string, ?string, ], { verbose }: { verbose: ?boolean }): Promise<any> {
    verbose = true; // During ci-update we always want to see verbose outputs
    return ciUpdateAction(id, scopePath || process.cwd(), verbose);
  }

  report(maybeSpecsResults: SpecsResults|Error): string {
    if (!maybeSpecsResults) { return 'no results found'; }

    if (maybeSpecsResults instanceof Error) {
      return maybeSpecsResults.message;
    }

    return paintSpecsResults(maybeSpecsResults);
  }
}
