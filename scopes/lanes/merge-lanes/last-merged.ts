import path from 'path';
import tempy from 'tempy';
import fs from 'fs-extra';
import yesno from 'yesno';
import chalk from 'chalk';
import { BitMap, canRecoverBitmapNatively } from '@teambit/legacy.bit-map';
import type { ScopeMain } from '@teambit/scope';
import {
  type Lane,
  type RustRecoveryOperation,
  BitObject,
  advanceRustRecovery,
  isRustSnapshotOperation,
  withRustSnapshotOperation,
  hasRustRecoveryScope,
  requestRustRecovery,
} from '@teambit/objects';
import { StagedSnaps } from '@teambit/legacy.scope';
import type { Consumer } from '@teambit/legacy.consumer';
import { BitError } from '@teambit/bit-error';
import type { Logger } from '@teambit/logger';
import type { MergeAbortOpts } from './merge-abort.cmd';

const recoveryFs = { copy: fs.copyFile, remove: fs.remove, ensureDir: fs.ensureDir };
const recoveryPath = { join: path.join, resolve: path.resolve };

class PromptCanceled extends BitError {
  constructor() {
    super(chalk.yellow('operation aborted'));
  }
}

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
    return withRustSnapshotOperation(() => this.takeSnapshotWithinOperation(currentLane));
  }

  private async takeSnapshotWithinOperation(currentLane?: Lane | null): Promise<Snapshot> {
    const consumer = this.consumer;
    const copyOfCurrentLane = currentLane ? currentLane.clone() : undefined;
    const copyOfBitmap = tempy.file();
    const copyOfWorkspaceJsonc = tempy.file();
    let copyOfStagedSnaps: string | undefined;
    if (canBatchRecovery(this)) {
      const batch = captureRecoveryBatch(this);
      await runRecoveryPhase(
        [
          { kind: 'copy', source: consumer.bitMap.mapPath, destination: copyOfBitmap },
          { kind: 'copy', source: consumer.config.path, destination: copyOfWorkspaceJsonc },
        ],
        () => sameRecoveryBatch(this, batch),
        async (completed) => {
          if (completed < 1) await fs.copyFile(consumer.bitMap.mapPath, copyOfBitmap);
          if (completed < 2) await fs.copyFile(consumer.config.path, copyOfWorkspaceJsonc);
        }
      );
    } else {
      await fs.copyFile(consumer.bitMap.mapPath, copyOfBitmap);
      await fs.copyFile(consumer.config.path, copyOfWorkspaceJsonc);
    }
    if (!consumer.scope.stagedSnaps.isEmpty()) {
      copyOfStagedSnaps = tempy.file();
      await recoveryCopy(StagedSnaps.getPath(consumer.scope.path), copyOfStagedSnaps);
    }
    const stagedConfig = await this.scope.getStagedConfig();
    let copyOfStagedConfig: string | undefined;
    if (!stagedConfig.isEmpty()) {
      copyOfStagedConfig = tempy.file();
      await recoveryCopy(stagedConfig.filePath, copyOfStagedConfig);
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
    return withRustSnapshotOperation(() => this.persistSnapshotWithinOperation(snapshot));
  }

  private async persistSnapshotWithinOperation(snapshot: Snapshot) {
    const { copyOfCurrentLane, copyOfBitmap, copyOfWorkspaceJsonc, copyOfStagedSnaps, copyOfStagedConfig } = snapshot;
    if (canBatchRecovery(this)) {
      const batch = captureRecoveryBatch(this);
      await runRecoveryPhase(
        [
          { kind: 'remove', path: this.path },
          { kind: 'ensureDir', path: this.path },
          { kind: 'copy', source: copyOfBitmap, destination: this.getLastMergedBitmapPath() },
          { kind: 'copy', source: copyOfWorkspaceJsonc, destination: this.getLastMergedWorkspacePath() },
        ],
        () => sameRecoveryBatch(this, batch),
        async (completed) => {
          if (completed < 1) await fs.remove(this.path);
          if (completed < 2) await fs.ensureDir(this.path);
          if (completed < 3) await fs.copyFile(copyOfBitmap, this.getLastMergedBitmapPath());
          if (completed < 4) await fs.copyFile(copyOfWorkspaceJsonc, this.getLastMergedWorkspacePath());
        }
      );
    } else {
      await fs.remove(this.path);
      await fs.ensureDir(this.path);
      await fs.copyFile(copyOfBitmap, this.getLastMergedBitmapPath());
      await fs.copyFile(copyOfWorkspaceJsonc, this.getLastMergedWorkspacePath());
    }
    if (copyOfCurrentLane) {
      const compressed = await copyOfCurrentLane.compress();
      await fs.outputFile(this.getLastMergedLanePath(), compressed);
    }
    if (copyOfStagedSnaps) {
      await recoveryCopy(copyOfStagedSnaps, this.getLastMergedStagedSnapsPath());
    }
    if (copyOfStagedConfig) {
      await recoveryCopy(copyOfStagedConfig, this.getLastMergedStagedConfigPath());
    }
  }

  async restoreLaneObjectFromLastMerged() {
    return withRustSnapshotOperation(() => this.restoreLaneObjectFromLastMergedWithinOperation());
  }

  private async restoreLaneObjectFromLastMergedWithinOperation() {
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
    return withRustSnapshotOperation(() => this.restoreFromLastMergedWithinOperation(mergeAbortOpts, currentLane));
  }

  private async restoreFromLastMergedWithinOperation(mergeAbortOpts: MergeAbortOpts, currentLane?: Lane | null) {
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
    const nativeDirs =
      canBatchRecovery(this) && canRecoverBitmapNatively(this.consumer.bitMap)
        ? await this.planRecoveryDirectories()
        : undefined;
    let compDirsToRemove: string[];
    if (nativeDirs) compDirsToRemove = nativeDirs;
    else {
      const previousBitmapBuffer = await fs.readFile(this.getLastMergedBitmapPath());
      const previousBitmap = BitMap.loadFromContentWithoutLoadingFiles(previousBitmapBuffer, '', '', '');
      const currentRootDirs = this.consumer.bitMap.getAllTrackDirs();
      const previousRootDirs = previousBitmap.getAllTrackDirs();
      compDirsToRemove = Object.keys(currentRootDirs).filter((dir) => !previousRootDirs[dir] && !isWorkspaceRoot(dir));
    }

    if (!mergeAbortOpts.silent) {
      await this.mergeAbortPrompt(compDirsToRemove);
    }
    if (canBatchRecovery(this) && disjointDirectories(compDirsToRemove)) {
      const completed = await advanceRustRecovery(
        compDirsToRemove.map((dir) => ({ kind: 'remove', path: path.resolve(dir) })),
        () => fs.remove === recoveryFs.remove
      );
      await Promise.all(compDirsToRemove.slice(completed).map((dir) => fs.remove(dir)));
    } else {
      await Promise.all(compDirsToRemove.map((dir) => fs.remove(dir)));
    }
    if (canBatchRecovery(this)) {
      const batch = captureRecoveryBatch(this);
      await runRecoveryPhase(
        [
          { kind: 'copy', source: this.getLastMergedBitmapPath(), destination: this.consumer.bitMap.mapPath },
          { kind: 'copy', source: this.getLastMergedWorkspacePath(), destination: this.consumer.config.path },
        ],
        () => sameRecoveryBatch(this, batch),
        async (completed) => {
          if (completed < 1) await fs.copyFile(this.getLastMergedBitmapPath(), this.consumer.bitMap.mapPath);
          if (completed < 2) await fs.copyFile(this.getLastMergedWorkspacePath(), this.consumer.config.path);
        }
      );
    } else {
      await fs.copyFile(this.getLastMergedBitmapPath(), this.consumer.bitMap.mapPath);
      await fs.copyFile(this.getLastMergedWorkspacePath(), this.consumer.config.path);
    }
    if (fs.pathExistsSync(this.getLastMergedStagedSnapsPath())) {
      await recoveryCopy(this.getLastMergedStagedSnapsPath(), StagedSnaps.getPath(this.scope.path));
    } else {
      await this.scope.legacyScope.stagedSnaps.deleteFile();
    }
    const stagedConfig = await this.scope.getStagedConfig();
    if (fs.pathExistsSync(this.getLastMergedStagedConfigPath())) {
      await recoveryCopy(this.getLastMergedStagedConfigPath(), stagedConfig.filePath);
    } else {
      await stagedConfig.deleteFile();
    }
    await recoveryRemove(this.path);

    return {
      compDirsToRemove,
    };
  }

  private async planRecoveryDirectories(): Promise<string[] | undefined> {
    const batch = captureRecoveryBatch(this);
    const backupPath = path.resolve(this.getLastMergedBitmapPath());
    const bitmap = this.consumer.bitMap;
    const currentRootDirs = Object.keys(bitmap.getAllTrackDirs());
    const result = await requestRustRecovery<{ removeDirs: string[] }>(
      { kind: 'recoveryBitmap', path: backupPath, currentRootDirs },
      (data) =>
        Array.isArray(data.removeDirs) &&
        data.removeDirs.every(
          (dir: unknown) => typeof dir === 'string' && currentRootDirs.includes(dir) && !isWorkspaceRoot(dir)
        ) &&
        new Set(data.removeDirs).size === data.removeDirs.length
    );
    if (
      !result ||
      !sameRecoveryBatch(this, batch) ||
      path.resolve(this.getLastMergedBitmapPath()) !== backupPath ||
      this.consumer.bitMap !== bitmap ||
      !canRecoverBitmapNatively(bitmap) ||
      JSON.stringify(Object.keys(bitmap.getAllTrackDirs())) !== JSON.stringify(currentRootDirs)
    )
      return undefined;
    return result.removeDirs;
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

function recoveryCopy(source: string, destination: string): Promise<void> {
  if (
    !isRustSnapshotOperation() ||
    fs.copyFile !== recoveryFs.copy ||
    typeof source !== 'string' ||
    typeof destination !== 'string'
  )
    return fs.copyFile(source, destination);
  return (async () => {
    const completed = await advanceRustRecovery(
      [{ kind: 'copy', source: path.resolve(source), destination: path.resolve(destination) }],
      () => fs.copyFile === recoveryFs.copy && path.resolve === recoveryPath.resolve && path.join === recoveryPath.join
    );
    if (!completed) await fs.copyFile(source, destination);
  })();
}
function recoveryRemove(filename: string): Promise<void> {
  if (!isRustSnapshotOperation() || fs.remove !== recoveryFs.remove || typeof filename !== 'string')
    return fs.remove(filename);
  return (async () => {
    const completed = await advanceRustRecovery(
      [{ kind: 'remove', path: path.resolve(filename) }],
      () => fs.remove === recoveryFs.remove && path.resolve === recoveryPath.resolve && path.join === recoveryPath.join
    );
    if (!completed) await fs.remove(filename);
  })();
}

const recoveryPaths = Object.getOwnPropertyDescriptors(LastMerged.prototype);
function isWorkspaceRoot(dir: string): boolean {
  return path.resolve(dir) === path.resolve('.');
}
function disjointDirectories(dirs: string[]): boolean {
  const absolute = dirs.map((dir) => path.resolve(dir));
  return absolute.every((filename, index) =>
    absolute.every(
      (other, otherIndex) => index === otherIndex || (filename !== other && !filename.startsWith(`${other}${path.sep}`))
    )
  );
}
function canBatchRecovery(value: LastMerged): boolean {
  if (path.join !== recoveryPath.join || path.resolve !== recoveryPath.resolve) return false;
  if (
    !isRustSnapshotOperation() ||
    fs.copyFile !== recoveryFs.copy ||
    fs.remove !== recoveryFs.remove ||
    fs.ensureDir !== recoveryFs.ensureDir
  )
    return false;
  if (
    Object.getPrototypeOf(value) !== LastMerged.prototype ||
    Reflect.ownKeys(LastMerged.prototype).length !== Reflect.ownKeys(recoveryPaths).length
  )
    return false;
  for (const name of Reflect.ownKeys(recoveryPaths)) {
    const current = Object.getOwnPropertyDescriptor(LastMerged.prototype, name);
    const original = (recoveryPaths as any)[name];
    if (
      Object.getOwnPropertyDescriptor(value, name) ||
      current?.value !== original.value ||
      current?.get !== original.get ||
      current?.set !== original.set ||
      current?.writable !== original.writable ||
      current?.enumerable !== original.enumerable ||
      current?.configurable !== original.configurable
    )
      return false;
  }
  const scope = Object.getOwnPropertyDescriptor(value, 'scope')?.value;
  const consumer = Object.getOwnPropertyDescriptor(value, 'consumer')?.value;
  const bitmap = Object.getOwnPropertyDescriptor(consumer || {}, 'bitMap')?.value;
  const config = Object.getOwnPropertyDescriptor(consumer || {}, 'config')?.value;
  return (
    hasRustRecoveryScope(scope) &&
    typeof Object.getOwnPropertyDescriptor(bitmap || {}, 'mapPath')?.value === 'string' &&
    typeof Object.getOwnPropertyDescriptor(config || {}, 'path')?.value === 'string'
  );
}
async function runRecoveryPhase(
  operations: RustRecoveryOperation[],
  eligible: () => boolean,
  fallback: (completed: number) => Promise<void>
): Promise<void> {
  const valid = () =>
    eligible() &&
    fs.copyFile === recoveryFs.copy &&
    fs.remove === recoveryFs.remove &&
    fs.ensureDir === recoveryFs.ensureDir;
  const paths = operations.every((entry) =>
    entry.kind === 'copy'
      ? typeof entry.source === 'string' && typeof entry.destination === 'string'
      : typeof entry.path === 'string'
  );
  const absolute = paths
    ? operations.map((entry) =>
        entry.kind === 'copy'
          ? { ...entry, source: path.resolve(entry.source), destination: path.resolve(entry.destination) }
          : { ...entry, path: path.resolve(entry.path) }
      )
    : [];
  const completed = valid() && paths ? await advanceRustRecovery(absolute, valid) : 0;
  if (completed < operations.length) await fallback(completed);
}

function captureRecoveryBatch(value: LastMerged) {
  const scope = Object.getOwnPropertyDescriptor(value, 'scope')?.value;
  const legacyScope = Object.getOwnPropertyDescriptor(scope || {}, 'legacyScope')?.value;
  const consumer = Object.getOwnPropertyDescriptor(value, 'consumer')?.value;
  const bitmap = Object.getOwnPropertyDescriptor(consumer || {}, 'bitMap')?.value;
  const config = Object.getOwnPropertyDescriptor(consumer || {}, 'config')?.value;
  return {
    scope,
    legacyScope,
    consumer,
    bitmap,
    config,
    scopePath: Object.getOwnPropertyDescriptor(legacyScope || {}, 'path')?.value,
    bitmapPath: Object.getOwnPropertyDescriptor(bitmap || {}, 'mapPath')?.value,
    configPath: Object.getOwnPropertyDescriptor(config || {}, 'path')?.value,
  };
}
function sameRecoveryBatch(value: LastMerged, captured: ReturnType<typeof captureRecoveryBatch>): boolean {
  if (!canBatchRecovery(value)) return false;
  const live = captureRecoveryBatch(value);
  return Object.keys(captured).every((key) => live[key] === captured[key]);
}
