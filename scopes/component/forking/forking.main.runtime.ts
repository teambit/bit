import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import { Harmony } from '@teambit/harmony';
import { DependencyResolverAspect, DependencyResolverMain } from '@teambit/dependency-resolver';
import WorkspaceAspect, { Workspace } from '@teambit/workspace';
import { ForkCmd } from './fork.cmd';
import { Forker } from './forker';
import { ForkingAspect } from './forking.aspect';

export class ForkingMain {
  static slots = [];
  static dependencies = [CLIAspect, WorkspaceAspect, DependencyResolverAspect];
  static runtime = MainRuntime;
  static async provider(
    [cli, workspace, dependencyResolver]: [CLIMain, Workspace, DependencyResolverMain],
    config,
    _,
    harmony: Harmony
  ) {
    const forker = new Forker(workspace, dependencyResolver, harmony);
    cli.register(new ForkCmd(forker));
    return new ForkingMain();
  }
}

ForkingAspect.addRuntime(ForkingMain);
