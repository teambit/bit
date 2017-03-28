/** @flow */
import Command from '../../command';
import { ciUpdateAction } from '../../../api/scope';
import SpecsResults from '../../../consumer/specs-results/specs-results';
import { paintSpecsResults } from '../../chalk-box';

export default class CiUpdate extends Command {
  name = 'ci-update <id> [scopePath]';
  description = 'run an update for build and test of a certain bit-component';
  alias = '';
  opts = [];
  private = true;

  action([id, scopePath, ]: [string, ?string]): Promise<any> {
    return ciUpdateAction(id, scopePath || process.cwd());
  }

  report(maybeSpecsResults: SpecsResults|Error): string {
    if (!maybeSpecsResults) { return 'no results found'; }

    if (maybeSpecsResults instanceof Error) {
      return maybeSpecsResults.message;
    }

    return paintSpecsResults(maybeSpecsResults);
  }
}
