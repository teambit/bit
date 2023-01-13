import { MergeConfigFilename } from '@teambit/legacy/dist/constants';
import path from 'path';
import fs from 'fs-extra';
import { MergeConfigConflict } from './exceptions/merge-config-conflict';

const idPrefix = `[*]`;
const idDivider = '-'.repeat(80);
type ConflictPerId = { [compIdWithoutVersion: string]: string };

export class MergeConflictFile {
  conflictPerId: ConflictPerId | undefined;
  constructor(private workspacePath: string) {}

  addConflict(id: string, conflict: string) {
    if (!this.conflictPerId) this.conflictPerId = {};
    this.conflictPerId[id] = conflict;
  }

  removeConflict(id: string) {
    delete this.conflictPerId?.[id];
  }

  async getConflict(id: string): Promise<string | undefined> {
    await this.loadIfNeeded();
    if (!this.conflictPerId) throw new Error(`this.conflictPerId must be instantiated after load`);
    return this.conflictPerId[id];
  }

  async getConflictParsed(id: string): Promise<Record<string, any> | undefined> {
    const configMergeContent = await this.getConflict(id);
    if (!configMergeContent) return undefined;
    try {
      return JSON.parse(configMergeContent);
    } catch (err: any) {
      if (this.stringHasConflictMarker(configMergeContent)) {
        throw new MergeConfigConflict(this.getPath());
      }
      throw new Error(`unable to parse the merge-conflict entry for ${id} as the JSON is invalid. err: ${err.message}`);
    }
  }

  hasConflict(): boolean {
    return Boolean(this.conflictPerId && Object.keys(this.conflictPerId).length);
  }

  getPath() {
    return path.join(this.workspacePath, MergeConfigFilename);
  }

  async loadIfNeeded() {
    if (this.conflictPerId) return; // already loaded
    const fileContent = await this.getFileContentIfExists();
    if (!fileContent) {
      this.conflictPerId = {}; // to indicate that it's loaded
      return;
    }
    const parsedConflict = this.parseConflict(fileContent);
    this.conflictPerId = parsedConflict;
  }

  async write() {
    if (!this.hasConflict()) return;
    const afterFormat = this.formatConflicts();
    await fs.writeFile(this.getPath(), afterFormat);
  }

  async delete() {
    await fs.remove(this.getPath());
  }

  private formatConflicts(): string {
    const conflictPerId = this.conflictPerId;
    if (!conflictPerId) throw new Error('conflictPerId is not populated');
    const title = `# Resolve configuration conflicts per component and make sure the Component ID remain in place`;
    const conflicts = Object.keys(conflictPerId)
      .map((id) => {
        const conflict = conflictPerId[id];
        return `${idDivider}
${idPrefix} ${id}
${idDivider}
${conflict}`;
      })
      .join('\n\n');
    return `${title}\n\n${conflicts}`;
  }

  private stringHasConflictMarker(str: string): boolean {
    return str.includes('<<<<<<<') || str.includes('>>>>>>>');
  }

  private parseConflict(conflict: string): ConflictPerId {
    // remove irrelevant lines
    conflict = conflict
      .split('\n')
      .filter((line) => line !== idDivider && !line.startsWith('#'))
      .join('\n');
    // split by id
    const conflictPerId: ConflictPerId = {};
    const split = conflict.split(idPrefix);
    split.forEach((conflictItem) => {
      const conflictItemSplit = conflictItem.split('\n');
      const [rawId, ...conflictStr] = conflictItemSplit;
      const id = rawId.trim();
      if (!id) return; // first line has it empty
      conflictPerId[id] = conflictStr.join('\n');
    });
    return conflictPerId;
  }

  private async getFileContentIfExists(): Promise<string | undefined> {
    const filePath = this.getPath();
    let fileContent: string;
    try {
      fileContent = await fs.readFile(filePath, 'utf-8');
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        return undefined;
      }
      throw err;
    }
    return fileContent;
  }
}
