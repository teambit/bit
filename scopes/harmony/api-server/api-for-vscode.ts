import path from 'path';
import fs from 'fs-extra';
import filenamify from 'filenamify';
import { Workspace } from '@teambit/workspace';
import { PathOsBasedAbsolute, PathOsBasedRelative, pathJoinLinux } from '@teambit/legacy/dist/utils/path';
import pMap from 'p-map';

const FILES_HISTORY_DIR = 'files-history';
const LAST_SNAP_DIR = 'last-snap';

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

  async getCompFiles(id: string): Promise<{ dirAbs: string; filesRelative: PathOsBasedRelative[] }> {
    const compId = await this.workspace.resolveComponentId(id);
    const comp = await this.workspace.get(compId);
    const dirAbs = this.workspace.componentDir(compId);
    const filesRelative = comp.state.filesystem.files.map((file) => file.relative);
    return { dirAbs, filesRelative };
  }

  async getCompFilesDirPathFromLastSnap(id: string): Promise<{ [relativePath: string]: string }> {
    const compId = await this.workspace.resolveComponentId(id);
    if (!compId.hasVersion()) return {}; // it's a new component.
    const compDir = this.workspace.componentDir(compId, { ignoreVersion: true }, { relative: true });
    // const dirName = filenamify(compId.toString(), { replacement: '_' });
    const filePathsRootDir = path.join(this.workspace.scope.path, FILES_HISTORY_DIR, LAST_SNAP_DIR, compDir);
    await fs.remove(filePathsRootDir); // in case it has old data

    const modelComponent = await this.workspace.scope.getBitObjectModelComponent(compId);
    if (!modelComponent) {
      throw new Error(`unable to find ${compId.toString()} in the local scope, please run "bit import"`);
    }
    const versionObject = await this.workspace.scope.getBitObjectVersion(modelComponent, compId.version as string);
    if (!versionObject)
      throw new Error(`unable to find the Version object of ${compId.toString()}, please run "bit import"`);
    const sourceFiles = await versionObject.modelFilesToSourceFiles(this.workspace.scope.legacyScope.objects);
    const results: { [relativePath: string]: string } = {};
    await Promise.all(
      sourceFiles.map(async (file) => {
        const filePath = path.join(filePathsRootDir, file.relative);
        await fs.outputFile(filePath, file.contents);
        results[pathJoinLinux(compDir, file.relative)] = filePath;
      })
    );
    return results;
  }

  async getCompFilesDirPathFromLastSnapForAllComps(): Promise<{ [relativePath: string]: string }> {
    const ids = await this.workspace.listIds();
    let results = {};
    await pMap(
      ids,
      async (id) => {
        const idStr = id.toStringWithoutVersion();
        const compResults = await this.getCompFilesDirPathFromLastSnap(idStr);
        results = { ...results, ...compResults };
      },
      { concurrency: 30 }
    );
    return results;
  }
}
