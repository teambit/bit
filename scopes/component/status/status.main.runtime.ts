import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import { StatusCmd } from './status-cmd';
import { StatusAspect } from './status.aspect';

export class StatusMain {
  static slots = [];
  static dependencies = [CLIAspect];
  static runtime = MainRuntime;
  static async provider([cli]: [CLIMain]) {
    cli.register(new StatusCmd());
    return new StatusMain();
  }
}

StatusAspect.addRuntime(StatusMain);
