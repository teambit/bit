import { DummyAspect } from './dummy.aspect';
import { CLIAspect, CLIRuntime } from '../cli/cli.aspect';

export class DummyCLI {
  log() {
    console.log('hi there from dummy aspect speaking from CLI runtime');
  }

  static runtime = CLIRuntime;

  static dependencies = [CLIAspect];

  static async provider() {
    return new DummyCLI();
  }
}

DummyAspect.addRuntime(DummyCLI);
