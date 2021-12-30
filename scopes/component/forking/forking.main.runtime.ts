import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import { DependencyResolverAspect, DependencyResolverMain } from '@teambit/dependency-resolver';
import { BitId } from '@teambit/legacy-bit-id';
import WorkspaceAspect, { Workspace } from '@teambit/workspace';
import ComponentAspect, { Component, ComponentID, ComponentMain } from '@teambit/component';
import { ComponentIdObj } from '@teambit/component-id';
import NewComponentHelperAspect, { NewComponentHelperMain } from '@teambit/new-component-helper';
import { ForkCmd, ForkOptions } from './fork.cmd';
import { ForkingAspect } from './forking.aspect';
import { ForkingFragment } from './forking.fragment';

export type ForkInfo = {
  forkedFrom: ComponentID;
};

export class ForkingMain {
  constructor(
    private workspace: Workspace,
    private dependencyResolver: DependencyResolverMain,
    private newComponentHelper: NewComponentHelperMain
  ) {}

  async fork(sourceIdStr: string, targetId?: string, options?: ForkOptions): Promise<ComponentID> {
    const sourceId = await this.workspace.resolveComponentId(sourceIdStr);
    const existingInWorkspace = await this.workspace.getIfExist(sourceId);
    if (existingInWorkspace) {
      return this.forkExistingInWorkspace(existingInWorkspace, targetId, options);
    }
    const sourceIdWithScope = sourceId._legacy.scope
      ? sourceId
      : ComponentID.fromLegacy(BitId.parse(sourceIdStr, true));
    return this.forkRemoteComponent(sourceIdWithScope, targetId, options);
  }

  getForkInfo(component: Component): ForkInfo | null {
    const forkConfig = component.state.aspects.get(ForkingAspect.id)?.config as ForkConfig | undefined;
    if (!forkConfig) return null;
    return {
      forkedFrom: ComponentID.fromObject(forkConfig.forkedFrom),
    };
  }

  private async forkExistingInWorkspace(existing: Component, targetId?: string, options?: ForkOptions) {
    if (!targetId) {
      throw new Error(`error: unable to create "${existing.id.toStringWithoutVersion()}" component, a component with the same name already exists.
please specify the target-id arg`);
    }
    const targetCompId = this.newComponentHelper.getNewComponentId(targetId, undefined, options?.scope);

    const config = await this.getConfig(existing);
    await this.newComponentHelper.writeAndAddNewComp(existing, targetCompId, options, config);

    return targetCompId;
  }
  private async forkRemoteComponent(sourceId: ComponentID, targetId?: string, options?: ForkOptions) {
    const targetName = targetId || sourceId.fullName;
    const targetCompId = this.newComponentHelper.getNewComponentId(targetName, undefined, options?.scope);
    const comp = await this.workspace.scope.getRemoteComponent(sourceId);

    const deps = await this.dependencyResolver.getDependencies(comp);
    // only bring auto-resolved dependencies, others should be set in the workspace.jsonc template
    const workspacePolicyEntries = deps
      .filter((dep) => dep.source === 'auto')
      .map((dep) => ({
        dependencyId: dep.getPackageName?.() || dep.id,
        lifecycleType: dep.lifecycle === 'dev' ? 'runtime' : dep.lifecycle,
        value: {
          version: dep.version,
        },
      }));
    this.dependencyResolver.addToRootPolicy(workspacePolicyEntries, { updateExisting: true });
    const config = await this.getConfig(comp);
    await this.newComponentHelper.writeAndAddNewComp(comp, targetCompId, options, config);
    await this.dependencyResolver.persistConfig(this.workspace.path);
    await this.workspace.install(undefined, {
      dedupe: true,
      import: false,
      copyPeerToRuntimeOnRoot: true,
      copyPeerToRuntimeOnComponents: false,
      updateExisting: false,
    });

    return targetCompId;
  }

  private async getConfig(comp: Component) {
    const fromExisting = await this.newComponentHelper.getConfigFromExistingToNewComponent(comp);
    return {
      ...fromExisting,
      [ForkingAspect.id]: {
        forkedFrom: comp.id.toObject(),
      },
    };
  }

  static slots = [];
  static dependencies = [
    CLIAspect,
    WorkspaceAspect,
    DependencyResolverAspect,
    ComponentAspect,
    NewComponentHelperAspect,
  ];
  static runtime = MainRuntime;
  static async provider([cli, workspace, dependencyResolver, componentMain, newComponentHelper]: [
    CLIMain,
    Workspace,
    DependencyResolverMain,
    ComponentMain,
    NewComponentHelperMain
  ]) {
    const forkingMain = new ForkingMain(workspace, dependencyResolver, newComponentHelper);
    cli.register(new ForkCmd(forkingMain));
    componentMain.registerShowFragments([new ForkingFragment(forkingMain)]);
    return forkingMain;
  }
}

ForkingAspect.addRuntime(ForkingMain);

export type ForkConfig = {
  forkedFrom: ComponentIdObj;
};
