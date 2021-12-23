import { Component, ComponentID } from '@teambit/component';
import { DependencyResolverMain } from '@teambit/dependency-resolver';
import { Harmony } from '@teambit/harmony';
import { Workspace } from '@teambit/workspace';
import { ForkingAspect } from './forking.aspect';
import { ForkOptions } from './fork.cmd';

export class Forker {
  constructor(
    private workspace: Workspace,
    private dependencyResolver: DependencyResolverMain,
    private harmony: Harmony
  ) {}

  async fork(sourceIdStr: string, targetId?: string, options?: ForkOptions): Promise<ComponentID> {
    const sourceId = await this.workspace.resolveComponentId(sourceIdStr);
    const existingInWorkspace = await this.workspace.getIfExist(sourceId);
    return existingInWorkspace
      ? this.forkExistingInWorkspace(existingInWorkspace, targetId, options)
      : this.forkRemoteComponent(sourceId, targetId, options);
  }

  async forkExistingInWorkspace(existing: Component, targetId?: string, options?: ForkOptions) {
    if (!targetId) {
      throw new Error(`error: unable to create "${existing.id.toStringWithoutVersion()}" component, a component with the same name already exists.
please specify the target-id arg`);
    }
    const targetCompId = this.workspace.getNewComponentId(targetId, undefined, options?.scope);
    const targetPath = this.workspace.getNewComponentPath(targetCompId, options?.path);

    await this.writeAndAddTheNewComp(existing, targetPath, targetCompId);

    return targetCompId;
  }
  async forkRemoteComponent(sourceId: ComponentID, targetId?: string, options?: ForkOptions) {
    const targetName = targetId || sourceId.fullName;
    const targetCompId = this.workspace.getNewComponentId(targetName, undefined, options?.scope);
    const targetPath = this.workspace.getNewComponentPath(targetCompId, options?.path);
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
    await this.writeAndAddTheNewComp(comp, targetPath, targetCompId);
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

  private async writeAndAddTheNewComp(comp: Component, targetPath: string, targetId: ComponentID) {
    await this.workspace.write(targetPath, comp);
    const config = await this.getConfig(comp);
    await this.workspace.track({
      rootDir: targetPath,
      componentName: targetId.fullName,
      mainFile: comp.state._consumer.mainFile,
      config,
    });
    await this.workspace.bitMap.write();
    this.workspace.clearCache();
    // @todo: compile components.
  }

  private async getConfig(comp: Component) {
    const aspectIds = comp.state.aspects.entries.map((e) => e.id.toString());
    await this.workspace.loadAspects(aspectIds);
    const fromExisting = {};
    comp.state.aspects.entries.forEach((entry) => {
      if (!entry.config) return;
      const aspectId = entry.id.toString();
      const aspect = this.harmony.get<ForkAspectConfig>(aspectId);
      if (!aspect) throw new Error(`error: unable to get "${aspectId}" aspect from Harmony`);
      if (
        'shouldPreserveConfigForForkedComponent' in aspect &&
        aspect.shouldPreserveConfigForForkedComponent === false
      ) {
        return;
      }
      fromExisting[aspectId] = entry.config;
    });
    return {
      ...fromExisting,
      [ForkingAspect.id]: {
        forkedFrom: comp.id.toObject(),
      },
    };
  }
}

export interface ForkAspectConfig {
  readonly shouldPreserveConfigForForkedComponent?: boolean; // default true
}
