import { DummyAspect } from './dummy.aspect';
import { MainRuntime } from '../cli/cli.aspect';
import { DummyAspect } from './dummy.aspect';
import { DumCmd } from './dum.cmd';
import { CLIAspect, MainRuntime } from '../cli/cli.aspect';
import { CLIExtension } from '../cli';

export class DummyMain {
  static runtime = MainRuntime;

  static runtime = MainRuntime;
  static dependencies = [CLIAspect];

  static async provider([cli]: [CLIExtension]) {
    cli.register(new DumCmd());
    return new DummyMain();
  }
}

DummyAspect.addRuntime(DummyMain);

DummyAspect.addRuntime(DummyMain);
