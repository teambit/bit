import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import { DependenciesCmd, DependenciesDebug, DependenciesGet } from './dependencies-cmd';
import { DependenciesAspect } from './dependencies.aspect';

export class DependenciesMain {
  static slots = [];
  static dependencies = [CLIAspect];

  static runtime = MainRuntime;

  static async provider([cli]: [CLIMain]) {
    const depsCmd = new DependenciesCmd();
    depsCmd.commands = [new DependenciesGet(), new DependenciesDebug()];
    cli.register(depsCmd);
    return new DependenciesMain();
  }
}

DependenciesAspect.addRuntime(DependenciesMain);

export default DependenciesMain;
