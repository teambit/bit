import path from 'path';
import { Workspace } from '@teambit/workspace';
import { PathOsBasedAbsolute } from '@teambit/legacy/dist/utils/path';

export class APIForVSCode {
  constructor(private workspace: Workspace) {}

  async listIdsWithPaths() {
    const ids = await this.workspace.listIds();
    return ids.reduce((acc, id) => {
      acc[id.toStringWithoutVersion()] = this.workspace.componentDir(id);
      return acc;
    }, {});
  }

  async getMainFilePath(id: string): Promise<PathOsBasedAbsolute> {
    const compId = await this.workspace.resolveComponentId(id);
    const comp = await this.workspace.get(compId);
    return path.join(this.workspace.componentDir(compId), comp.state._consumer.mainFile);
  }
}
