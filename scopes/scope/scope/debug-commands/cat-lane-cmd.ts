import { catLane } from './cat-lane';
import { Command, CommandOptions } from '@teambit/cli';

export default class CatLaneCmd implements Command {
  name = 'cat-lane <id>';
  description = 'cat a bit object by lane-name';
  private = true;
  loader = false;
  alias = 'cl';
  options = [] as CommandOptions;

  async report([id]: [string]) {
    const result = await catLane(id);
    return JSON.stringify(result, null, 4);
  }
}
