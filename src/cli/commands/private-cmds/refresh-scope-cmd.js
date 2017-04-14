/** @flow */
import Command from '../../command';
import { refreshScope } from '../../../api/scope';

export default class RefershScope extends Command {
  name = 'refresh-scope [scopePath]';
  description = 'load all the object in the scope and write them again (for possible model changes between versions)';
  alias = '';
  opts = [];
  private = true;

  action([scopePath, ]: [string, ?string]): Promise<any> {
    return refreshScope(scopePath || process.cwd());
  }

  report(): string {
    return 'scope updated successfully';
  }
}
