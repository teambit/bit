import path from 'path';
import fs from 'fs-extra';

const STAGED_SNAPS = 'staged-snaps';

/**
 * keeps track of the local snaps/tags.
 * during tag/snap, the hash is saved into `STAGED_SNAPS` file. during export, it gets deleted.
 * the purpose of this file is to easily get an answer whether a hash is local, without making the expensive
 * calculation of `getDivergeData` for `sources.get()` method.
 * It's not 100% accurate (during export, we delete the entire file, even when the user entered ids to export),
 * but because it is only used for optimization of the import process, it's good enough.
 */
export class StagedSnaps {
  private hasChanged = false;
  constructor(private scopePath: string, private snaps: string[]) {}

  async write() {
    if (this.hasChanged) {
      await fs.writeFile(StagedSnaps.getPath(this.scopePath), this.snaps.join('\n'));
    }
  }

  addSnap(snap: string) {
    this.snaps.push(snap);
    this.hasChanged = true;
  }

  has(snap: string) {
    return this.snaps.includes(snap);
  }

  async deleteFile() {
    await fs.remove(StagedSnaps.getPath(this.scopePath));
  }

  static getPath(scopePath: string) {
    return path.join(scopePath, STAGED_SNAPS);
  }

  static load(scopePath: string) {
    const stagedSnapsPath = StagedSnaps.getPath(scopePath);
    if (!fs.existsSync(stagedSnapsPath)) return new StagedSnaps(scopePath, []);
    const stagedSnapsStr = fs.readFileSync(stagedSnapsPath).toString();
    return new StagedSnaps(scopePath, stagedSnapsStr.split('\n'));
  }
}
