import { refreshScope } from '../../../api/scope';
import { LegacyCommand } from '../../legacy-command';

export default class RefershScope implements LegacyCommand {
  name = 'refresh-scope [scopePath]';
  description = 'load all the object in the scope and write them again (for possible model changes between versions)';
  alias = '';
  opts = [];
  private = true;

  action([scopePath]: [string, string | null | undefined]): Promise<any> {
    return refreshScope(scopePath || process.cwd());
  }

  report(): string {
    return 'scope updated successfully';
  }
}
