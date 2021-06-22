import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import { LanesAspect } from './lanes.aspect';
import { LaneCmd } from './lane.cmd';

export class LanesMain {
  static slots = [];
  static dependencies = [CLIAspect];
  static runtime = MainRuntime;
  static async provider([cli]: [CLIMain]) {
    cli.register(new LaneCmd());
    return new LanesMain();
  }
}

LanesAspect.addRuntime(LanesMain);
