import { MainRuntime } from '@teambit/cli';
import { BitId } from '@teambit/legacy-bit-id';
import { Workspace, WorkspaceAspect } from '@teambit/workspace';
import { BitIds } from '@teambit/legacy/dist/bit-id';
import { changeCodeFromRelativeToModulePaths } from '@teambit/legacy/dist/consumer/component-ops/codemod-components';
import NodeModuleLinker, { NodeModulesLinksResult } from './node-modules-linker';
import { WorkspaceLinkerAspect } from './workspace-linker.aspect';

export class WorkspaceLinkerMain {
  constructor(private workspace: Workspace) {}

  async linkToNodeModulesWithCodemod(bitIds: BitId[], changeRelativeToModulePaths: boolean) {
    let codemodResults;
    if (changeRelativeToModulePaths) {
      codemodResults = await changeCodeFromRelativeToModulePaths(this.workspace.consumer, bitIds);
    }
    const linksResults = await this.linkToNodeModules(bitIds);
    return { linksResults, codemodResults };
  }

  async linkToNodeModules(bitIds: BitId[] = []): Promise<NodeModulesLinksResult[]> {
    const componentsIds = bitIds.length
      ? BitIds.fromArray(bitIds)
      : this.workspace.consumer.bitMap.getAllIdsAvailableOnLane();
    if (!componentsIds.length) return [];
    const { components } = await this.workspace.consumer.loadComponents(componentsIds);
    const nodeModuleLinker = new NodeModuleLinker(components, this.workspace.consumer);
    return nodeModuleLinker.link();
  }

  static slots = [];
  static dependencies = [WorkspaceAspect];
  static runtime = MainRuntime;

  static async provider([workspace]: [Workspace]) {
    return new WorkspaceLinkerMain(workspace);
  }
}

WorkspaceLinkerAspect.addRuntime(WorkspaceLinkerMain);

export default WorkspaceLinkerMain;
