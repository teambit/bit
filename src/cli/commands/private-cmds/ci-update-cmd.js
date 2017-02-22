/** @flow */
import Command from '../../command';
import { ciUpdateAction } from '../../../api/scope';

export default class CiUpdate extends Command {
  name = 'ci-update <id> [scopePath]';
  description = 'run an update for build and test of a certain bit-component';
  alias = '';
  opts = [];
  private = true;

  action([id, scopePath, ]: [string, ?string]): Promise<any> {
    return ciUpdateAction(id, scopePath || process.cwd());
  }

  report(): string {
    return 'build and test passed, and the ci properties are written in the model';
  }
}
