import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import { DependencyResolverAspect, DependencyResolverMain } from '@teambit/dependency-resolver';
import WorkspaceAspect, { Workspace } from '@teambit/workspace';
import { ForkCmd } from './fork.cmd';
import { Forker } from './forker';
import { ForkingAspect } from './forking.aspect';

export class ForkingMain {
  static slots = [];
  static dependencies = [CLIAspect, WorkspaceAspect, DependencyResolverAspect];
  static runtime = MainRuntime;
  static async provider([cli, workspace, dependencyResolver]: [CLIMain, Workspace, DependencyResolverMain]) {
    const forker = new Forker(workspace, dependencyResolver);
    cli.register(new ForkCmd(forker));
    return new ForkingMain();
  }
}

ForkingAspect.addRuntime(ForkingMain);
