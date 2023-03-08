import ReactAspect, { CLIRuntime } from './react.aspect';
import BabelAspect, { BabelCLI } from '../babel/babel.aspect';
import { Slot, SlotRegistry } from '../../../slots';

export class ReactCLI {
  constructor(
    private babel: BabelCLI
  ) {}

  static runtime = CLIRuntime;

  hello() {
    return this.babel.compile();
  }

  static dependencies = [BabelAspect];

  static slots = [Slot.withType<string>()];

  static async provider([babelCli]: [BabelCLI], config: {}, [stringSlot]: [SlotRegistry<string>]) {
    stringSlot.register('hi there');
    return new ReactCLI(babelCli);
  }
}

ReactAspect.addRuntime(ReactCLI);
