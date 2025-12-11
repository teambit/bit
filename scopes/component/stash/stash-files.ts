import type { Workspace } from '@teambit/workspace';
import globby from 'globby';
import path from 'path';
import fs from 'fs-extra';
import { StashData } from './stash-data';

const STASH_DIR = 'stash';
const STASH_FILE_PREFIX = 'stash';

export class StashFiles {
  constructor(private workspace: Workspace) {}

  getPath() {
    return path.join(this.workspace.scope.path, STASH_DIR);
  }

  async getStashFiles(): Promise<string[]> {
    const stashPath = this.getPath();
    const files = await globby(`${STASH_FILE_PREFIX}-*`, { cwd: stashPath });
    return files;
  }

  async getLatestStashFile(): Promise<string | undefined> {
    const files = await this.getStashFiles();
    const latest = files.sort().pop();
    return latest;
  }

  async getNextStashFileName(): Promise<string> {
    const latest = await this.getLatestStashFile();
    const latestIndex = latest ? parseInt(latest.split('-')[1]) : 0;
    return `${STASH_FILE_PREFIX}-${latestIndex + 1}.json`;
  }

  async deleteStashFile(filename: string) {
    await fs.remove(path.join(this.getPath(), filename));
  }

  async saveStashData(stashData: StashData) {
    const nextStashFile = await this.getNextStashFileName();
    const stashPath = this.getPath();
    const filePath = path.join(stashPath, nextStashFile);
    await fs.outputFile(filePath, JSON.stringify(stashData.toObject(), undefined, 4));
  }

  async getStashData(filename: string): Promise<StashData> {
    const stashPath = this.getPath();
    const filePath = path.join(stashPath, filename);
    const content = await fs.readFile(filePath, 'utf8');
    const data = JSON.parse(content);
    return StashData.fromObject(data);
  }
}
