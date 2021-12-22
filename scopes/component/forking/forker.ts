import { Component, ComponentID } from '@teambit/component';
import { DependencyResolverMain } from '@teambit/dependency-resolver';
import { Workspace } from '@teambit/workspace';
import { ForkOptions } from './fork.cmd';

export class Forker {
  constructor(private workspace: Workspace, private dependencyResolver: DependencyResolverMain) {}

  async fork(sourceId: string, targetId?: string, options?: ForkOptions): Promise<ComponentID> {
    const sourceCompId = await this.workspace.resolveComponentId(sourceId);
    const existingInWorkspace = await this.workspace.getIfExist(sourceCompId);
    return existingInWorkspace
      ? this.forkExistingInWorkspace(existingInWorkspace, targetId, options)
      : this.forkRemoteComponent(sourceCompId, targetId, options);
  }

  async forkExistingInWorkspace(existing: Component, targetId?: string, options?: ForkOptions) {
    if (!targetId) {
      throw new Error(`error: unable to create "${existing.id.toStringWithoutVersion()}" component, a component with the same name already exists.
please specify the target-id arg`);
    }
    const targetCompId = this.workspace.getNewComponentId(targetId, undefined, options?.scope);
    const targetPath = this.workspace.getNewComponentPath(targetCompId, options?.path);
    await this.workspace.write(targetPath, existing);
    await this.workspace.track({
      rootDir: targetPath,
      componentName: targetCompId.fullName,
      mainFile: existing.state._consumer.mainFile,
    });

    await this.workspace.bitMap.write();
    this.workspace.clearCache();
    // @todo: compile components.

    return targetCompId;
  }
  async forkRemoteComponent(compId: ComponentID, targetId?: string, options?: ForkOptions) {
    const targetName = targetId || compId.fullName;
    const targetCompId = this.workspace.getNewComponentId(targetName, undefined, options?.scope);
    const targetPath = this.workspace.getNewComponentPath(targetCompId, options?.path);
    const comp = await this.workspace.scope.getRemoteComponent(compId);
    await this.workspace.write(targetPath, comp);
    await this.workspace.track({
      rootDir: targetPath,
      componentName: targetCompId.fullName,
      mainFile: comp.state._consumer.mainFile,
    });
    const deps = await this.dependencyResolver.getDependencies(comp);

    // const currentPackages = Object.keys(oldAndNewPackageNames);
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
    // .filter((entry) => !currentPackages.includes(entry.dependencyId)); // remove components that are now imported
    this.dependencyResolver.addToRootPolicy(workspacePolicyEntries, { updateExisting: true });

    await this.workspace.bitMap.write();
    await this.dependencyResolver.persistConfig(this.workspace.path);
    this.workspace.clearCache();
    await this.workspace.install(undefined, {
      dedupe: true,
      import: false,
      copyPeerToRuntimeOnRoot: true,
      copyPeerToRuntimeOnComponents: false,
      updateExisting: false,
    });

    return targetCompId;
  }
}
