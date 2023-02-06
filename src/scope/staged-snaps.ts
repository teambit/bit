import path from 'path';
import fs from 'fs-extra';

const STAGED_SNAPS = 'staged-snaps';

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
