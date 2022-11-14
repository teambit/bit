import { catVersionHistory } from '../../../api/scope/lib/cat-version-history';
import { CommandOptions, LegacyCommand } from '../../legacy-command';

export class CatVersionHistoryCmd implements LegacyCommand {
  name = 'cat-version-history [id]';
  description = 'cat version-history object by component-id';
  private = true;
  alias = 'cvh';
  opts = [
    // json is also the default for this command. it's only needed to suppress the logger.console
    ['j', 'json', 'json format'],
  ] as CommandOptions;

  action([id]: [string]): Promise<any> {
    return catVersionHistory(id);
  }

  report(result: any): string {
    return JSON.stringify(result, null, 4);
  }
}
