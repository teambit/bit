import path from 'path';
import tempy from 'tempy';
import fs from 'fs-extra';
import yesno from 'yesno';
import chalk from 'chalk';
import { BitMap } from '@teambit/legacy.bit-map';
import { PromptCanceled } from '@teambit/legacy.cli.prompts';
import { ScopeMain } from '@teambit/scope';
import { BitObject, Lane } from '@teambit/scope.objects';
import { StagedSnaps } from '@teambit/legacy.scope';
import { Consumer } from '@teambit/legacy.consumer';
import { BitError } from '@teambit/bit-error';
import { Logger } from '@teambit/logger';
import { MergeAbortOpts } from './merge-abort.cmd';

const LAST_MERGED_LANE_FILENAME = 'lane';
const LAST_MERGED_BITMAP_FILENAME = 'bitmap';

type Snapshot = {
  copyOfCurrentLane?: Lane;
  copyOfBitmap: string;
  copyOfWorkspaceJsonc: string;
  copyOfStagedSnaps?: string;
  copyOfStagedConfig?: string;
};

export class LastMerged {
  constructor(
    private scope: ScopeMain,
    private consumer: Consumer,
    private logger: Logger
  ) {}

  get path() {
    return this.scope.getLastMergedPath();
  }

  async takeSnapshot(currentLane?: Lane | null): Promise<Snapshot> {
    const consumer = this.consumer;
    const copyOfCurrentLane = currentLane ? currentLane.clone() : undefined;
    const copyOfBitmap = tempy.file();
    const copyOfWorkspaceJsonc = tempy.file();
    let copyOfStagedSnaps: string | undefined;
    await fs.copyFile(consumer.bitMap.mapPath, copyOfBitmap);
    await fs.copyFile(consumer.config.path, copyOfWorkspaceJsonc);
    if (!consumer.scope.stagedSnaps.isEmpty()) {
      copyOfStagedSnaps = tempy.file();
      await fs.copyFile(StagedSnaps.getPath(consumer.scope.path), copyOfStagedSnaps);
    }
    const stagedConfig = await this.scope.getStagedConfig();
    let copyOfStagedConfig: string | undefined;
    if (!stagedConfig.isEmpty()) {
      copyOfStagedConfig = tempy.file();
      await fs.copyFile(stagedConfig.filePath, copyOfStagedConfig);
    }

    return {
      copyOfCurrentLane,
      copyOfBitmap,
      copyOfWorkspaceJsonc,
      copyOfStagedSnaps,
      copyOfStagedConfig,
    };
  }

  async persistSnapshot(snapshot: Snapshot) {
    const { copyOfCurrentLane, copyOfBitmap, copyOfWorkspaceJsonc, copyOfStagedSnaps, copyOfStagedConfig } = snapshot;
    await fs.remove(this.path);
    await fs.ensureDir(this.path);
    await fs.copyFile(copyOfBitmap, this.getLastMergedBitmapPath());
    await fs.copyFile(copyOfWorkspaceJsonc, this.getLastMergedWorkspacePath());
    if (copyOfCurrentLane) {
      const compressed = await copyOfCurrentLane.compress();
      await fs.outputFile(this.getLastMergedLanePath(), compressed);
    }
    if (copyOfStagedSnaps) {
      await fs.copyFile(copyOfStagedSnaps, this.getLastMergedStagedSnapsPath());
    }
    if (copyOfStagedConfig) {
      await fs.copyFile(copyOfStagedConfig, this.getLastMergedStagedConfigPath());
    }
  }

  async restoreLaneObjectFromLastMerged() {
    if (!fs.pathExistsSync(this.path)) {
      throw new BitError(`unable to abort the last lane-merge because "bit export" was running since then`);
    }
    const lastLane = await this.getLastMergedLaneContentIfExists();
    if (!lastLane) {
      throw new BitError(
        `unable to revert the last lane-merge because the ${LAST_MERGED_LANE_FILENAME} is missing from ${this.path}`
      );
    }
    const laneFromBackup = await BitObject.parseObject(lastLane, LAST_MERGED_LANE_FILENAME);
    await this.scope.legacyScope.objects.writeObjectsToTheFS([laneFromBackup]);
  }

  async restoreFromLastMerged(mergeAbortOpts: MergeAbortOpts, currentLane?: Lane | null) {
    if (!fs.pathExistsSync(this.path)) {
      throw new BitError(`unable to abort the last lane-merge because "bit export" was running since then`);
    }
    const lastLane = await this.getLastMergedLaneContentIfExists();

    if (!fs.pathExistsSync(this.getLastMergedBitmapPath())) {
      throw new BitError(
        `unable to abort the last lane-merge because the ${LAST_MERGED_BITMAP_FILENAME} is missing from ${this.path}`
      );
    }
    if (!fs.pathExistsSync(this.getLastMergedWorkspacePath())) {
      throw new BitError(
        `unable to abort the last lane-merge because the workspace.jsonc is missing from ${this.path}`
      );
    }
    if (currentLane) {
      if (!lastLane) {
        throw new BitError(
          `unable to abort the last lane-merge because the ${LAST_MERGED_LANE_FILENAME} is missing from ${this.path}`
        );
      }
      const laneFromBackup = await BitObject.parseObject(lastLane, LAST_MERGED_LANE_FILENAME);
      await this.scope.legacyScope.objects.writeObjectsToTheFS([laneFromBackup]);
    }
    const previousBitmapBuffer = await fs.readFile(this.getLastMergedBitmapPath());
    const previousBitmap = BitMap.loadFromContentWithoutLoadingFiles(previousBitmapBuffer, '', '', '');
    const currentRootDirs = this.consumer.bitMap.getAllTrackDirs();
    const previousRootDirs = previousBitmap.getAllTrackDirs();
    const compDirsToRemove = Object.keys(currentRootDirs).filter((dir) => !previousRootDirs[dir]);

    if (!mergeAbortOpts.silent) {
      await this.mergeAbortPrompt(compDirsToRemove);
    }
    await Promise.all(compDirsToRemove.map((dir) => fs.remove(dir))); // it doesn't throw if not-exist, so we're good here.
    await fs.copyFile(this.getLastMergedBitmapPath(), this.consumer.bitMap.mapPath);
    await fs.copyFile(this.getLastMergedWorkspacePath(), this.consumer.config.path);
    if (fs.pathExistsSync(this.getLastMergedStagedSnapsPath())) {
      await fs.copyFile(this.getLastMergedStagedSnapsPath(), StagedSnaps.getPath(this.scope.path));
    } else {
      await this.scope.legacyScope.stagedSnaps.deleteFile();
    }
    const stagedConfig = await this.scope.getStagedConfig();
    if (fs.pathExistsSync(this.getLastMergedStagedConfigPath())) {
      await fs.copyFile(this.getLastMergedStagedConfigPath(), stagedConfig.filePath);
    } else {
      await stagedConfig.deleteFile();
    }
    await fs.remove(this.path);

    return {
      compDirsToRemove,
    };
  }

  private async mergeAbortPrompt(dirsToRemove: string[]) {
    this.logger.clearStatusLine();
    const dirsToRemoveStr = dirsToRemove.length
      ? `\nThe following directories introduced by the merge will be deleted: ${dirsToRemove.join(', ')}`
      : '';
    const ok = await yesno({
      question: `Code changes that were done since the last lane-merge will be lost.${dirsToRemoveStr}
The .bitmap and workspace.jsonc files will be restored to the state before the merge.
This action is irreversible.
${chalk.bold('Do you want to continue? [yes(y)/no(n)]')}`,
    });
    if (!ok) {
      throw new PromptCanceled();
    }
  }

  private async getLastMergedLaneContentIfExists(): Promise<Buffer | null> {
    const filename = this.getLastMergedLanePath();
    return this.getFileContentIfExist(filename);
  }
  private async getFileContentIfExist(filename: string): Promise<Buffer | null> {
    try {
      return await fs.readFile(filename);
    } catch (err: any) {
      if (err.code === 'ENOENT') return null;
      throw err;
    }
  }
  private getLastMergedBitmapPath() {
    return path.join(this.path, LAST_MERGED_BITMAP_FILENAME);
  }
  private getLastMergedWorkspacePath() {
    return path.join(this.path, 'workspace.jsonc');
  }
  private getLastMergedLanePath() {
    return path.join(this.path, LAST_MERGED_LANE_FILENAME);
  }
  private getLastMergedStagedSnapsPath() {
    return path.join(this.path, 'staged-snaps');
  }
  private getLastMergedStagedConfigPath() {
    return path.join(this.path, 'staged-config.json');
  }
}
