import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import { Harmony } from '@teambit/harmony';
import { DependencyResolverAspect, DependencyResolverMain } from '@teambit/dependency-resolver';
import WorkspaceAspect, { Workspace } from '@teambit/workspace';
import ComponentAspect, { Component, ComponentID, ComponentMain } from '@teambit/component';
import { ForkCmd } from './fork.cmd';
import { Forker, ForkConfig } from './forker';
import { ForkingAspect } from './forking.aspect';
import { ForkingFragment } from './forking.fragment';

export type ForkInfo = {
  forkedFrom: ComponentID;
};

export class ForkingMain {
  getForkInfo(component: Component): ForkInfo | null {
    const forkConfig = component.state.aspects.get(ForkingAspect.id)?.config as ForkConfig | undefined;
    if (!forkConfig) return null;
    return {
      forkedFrom: ComponentID.fromObject(forkConfig.forkedFrom),
    };
  }

  static slots = [];
  static dependencies = [CLIAspect, WorkspaceAspect, DependencyResolverAspect, ComponentAspect];
  static runtime = MainRuntime;
  static async provider(
    [cli, workspace, dependencyResolver, componentMain]: [CLIMain, Workspace, DependencyResolverMain, ComponentMain],
    config,
    _,
    harmony: Harmony
  ) {
    const forker = new Forker(workspace, dependencyResolver, harmony);
    cli.register(new ForkCmd(forker));
    const forkingMain = new ForkingMain();
    componentMain.registerShowFragments([new ForkingFragment(forkingMain)]);
    return forkingMain;
  }
}

ForkingAspect.addRuntime(ForkingMain);
