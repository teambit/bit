import { catLane } from '../../../api/scope';
import { LegacyCommand } from '../../legacy-command';

export default class CatLane implements LegacyCommand {
  name = 'cat-lane <id>';
  description = 'cat a bit object by lane-name';
  private = true;
  loader = false;
  alias = 'cl';
  opts = [];

  action([id]: [string]): Promise<any> {
    return catLane(id);
  }

  report(result: any): string {
    return JSON.stringify(result, null, 4);
  }
}
