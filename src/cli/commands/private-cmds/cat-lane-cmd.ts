import { LegacyCommand } from '../../legacy-command';
import { catLane } from '../../../api/scope';

export default class CatLane implements LegacyCommand {
  name = 'cat-lane [id]';
  description = 'cat a bit object by lane-name';
  private = true;
  alias = 'cl';
  opts = [];

  action([id]: [string]): Promise<any> {
    return catLane(id);
  }

  report(result: any): string {
    return JSON.stringify(result, null, 4);
  }
}
