import { MainRuntime } from '@teambit/cli';
import type { Component, ComponentMain } from '@teambit/component';
import { ComponentAspect } from '@teambit/component';
import type { ComponentID } from '@teambit/component-id';
import { WORKSPACE_ROOT_DIR } from '@teambit/legacy.bit-map';
import type { ConsumerComponent } from '@teambit/legacy.consumer-component';
import type { Workspace } from '@teambit/workspace';
import { WorkspaceAspect } from '@teambit/workspace';
import { WorkspaceRootAspect } from './workspace-root.aspect';
import { WorkspaceRootFragment } from './workspace-root.fragment';
import type { WorkspaceRootData } from './workspace-root-data';
import { findWorkspaceRootMap, isWorkspaceRootComponent, readWorkspaceRoot } from './workspace-root-data';

/**
 * the workspace-root component is the one tracked at the workspace root (rootDir "."). it versions
 * the workspace's own files - workspace.jsonc, .bitmap, the lockfile, repo scripts and configs - and
 * a git-free workspace is restored from it. this aspect is the home of that concept: the marker that
 * tells a root apart wherever it is, and the record every member carries of the root it was snapped
 * in.
 *
 * "workspace-root component" rather than "root component", which is the dependency-resolver's
 * rootComponents, or "workspace component", which is every component loaded from a workspace.
 */
export class WorkspaceRootMain {
  constructor(private workspace?: Workspace) {}

  /**
   * the id of the component that owns the workspace root, if the workspace has one.
   */
  getRootComponentId(): ComponentID | undefined {
    if (!this.workspace) return undefined;
    return findWorkspaceRootMap(this.workspace.consumer.bitMap)?.id;
  }

  /**
   * whether the component is a workspace-root component. read from its aspect data, so it works
   * for a component loaded from a scope as well as from a workspace.
   */
  isWorkspaceRootComponent(component: Component): boolean {
    return isWorkspaceRootComponent(this.extensionsOf(component));
  }

  /**
   * the workspace-root component a component was snapped in, at the version the root had then. the
   * snap records it as aspect data, so it is available wherever the component is, a bare scope
   * included. it is the way to know which root files (lockfile, tsconfig, scripts) a version was
   * made with. a component snapped in a workspace without a root component has none.
   */
  getRootOf(component: Component): ComponentID | undefined {
    return readWorkspaceRoot(this.extensionsOf(component));
  }

  private extensionsOf(component: Component) {
    return (component.state._consumer as ConsumerComponent).extensions;
  }

  static runtime = MainRuntime;

  static dependencies = [WorkspaceAspect, ComponentAspect];

  static async provider([workspace, component]: [Workspace | undefined, ComponentMain]) {
    const workspaceRoot = new WorkspaceRootMain(workspace);
    component.registerShowFragments([new WorkspaceRootFragment(workspaceRoot)]);
    workspace?.registerOnComponentLoad(markWorkspaceRoot);
    return workspaceRoot;
  }
}

/**
 * the root marks itself as such in its aspect data when loaded. the snap saves the data with the
 * version, and every consumer of the model reads the marker rather than guessing from the files.
 */
async function markWorkspaceRoot(component: Component): Promise<WorkspaceRootData | undefined> {
  const consumerComponent = component.state._consumer as ConsumerComponent;
  return consumerComponent.componentMap?.rootDir === WORKSPACE_ROOT_DIR ? { isRoot: true } : undefined;
}

WorkspaceRootAspect.addRuntime(WorkspaceRootMain);
