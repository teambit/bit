import { expect } from 'chai';
import fs from 'fs-extra';
import path from 'path';
import { globalBitTempDir } from '@teambit/defender.fs.global-bit-temp-dir';
import { createLinkOrSymlink } from './create-link-or-symlink';

/**
 * Stubs fs.removeSync to skip removal of a specific path, simulating a concurrent process
 * that re-creates the link between removeSync and linkSync/symlinkSync.
 */
function stubRemoveSyncFor(targetPath: string, timesToSkip = Infinity): () => void {
  const originalRemoveSync = fs.removeSync;
  let skipped = 0;
  fs.removeSync = (p: string) => {
    if (p === targetPath && skipped < timesToSkip) {
      skipped++;
      return;
    }
    originalRemoveSync(p);
  };
  return () => {
    fs.removeSync = originalRemoveSync;
  };
}

describe('createLinkOrSymlink EEXIST handling', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = globalBitTempDir();
  });

  describe('when destination already exists as a symlink to the same source directory', () => {
    it('should succeed without error', () => {
      const srcDir = path.join(tempDir, 'source');
      const destDir = path.join(tempDir, 'dest');
      fs.mkdirpSync(srcDir);
      fs.symlinkSync(srcDir, destDir, 'junction');

      const restore = stubRemoveSyncFor(destDir);
      try {
        createLinkOrSymlink(srcDir, destDir);
      } finally {
        restore();
      }
    });
  });

  describe('when destination already exists as a symlink to a different source', () => {
    it('should throw an error', () => {
      const srcDir = path.join(tempDir, 'source');
      const otherDir = path.join(tempDir, 'other');
      const destDir = path.join(tempDir, 'dest');
      fs.mkdirpSync(srcDir);
      fs.mkdirpSync(otherDir);
      fs.symlinkSync(otherDir, destDir, 'junction');

      const restore = stubRemoveSyncFor(destDir);
      try {
        expect(() => createLinkOrSymlink(srcDir, destDir)).to.throw();
      } finally {
        restore();
      }
    });
  });

  describe('when destination already exists as a hard link to the same source file', () => {
    it('should succeed without error', () => {
      const srcFile = path.join(tempDir, 'source-file.txt');
      const destFile = path.join(tempDir, 'dest-file.txt');
      fs.writeFileSync(srcFile, 'hello');
      fs.linkSync(srcFile, destFile);

      const restore = stubRemoveSyncFor(destFile);
      try {
        createLinkOrSymlink(srcFile, destFile);
      } finally {
        restore();
      }
    });
  });

  describe('when destination already exists as a hard link to a different file', () => {
    it('should throw an error', () => {
      const srcFile = path.join(tempDir, 'source-file.txt');
      const otherFile = path.join(tempDir, 'other-file.txt');
      const destFile = path.join(tempDir, 'dest-file.txt');
      fs.writeFileSync(srcFile, 'hello');
      fs.writeFileSync(otherFile, 'world');
      fs.linkSync(otherFile, destFile);

      const restore = stubRemoveSyncFor(destFile);
      try {
        expect(() => createLinkOrSymlink(srcFile, destFile)).to.throw();
      } finally {
        restore();
      }
    });
  });

  describe('when a different file occupies the destination only temporarily', () => {
    it('should retry and link the source', () => {
      const srcFile = path.join(tempDir, 'source-file.txt');
      const otherFile = path.join(tempDir, 'other-file.txt');
      const destFile = path.join(tempDir, 'dest-file.txt');
      fs.writeFileSync(srcFile, 'hello');
      fs.writeFileSync(otherFile, 'world');
      fs.linkSync(otherFile, destFile);

      const restore = stubRemoveSyncFor(destFile, 1);
      try {
        createLinkOrSymlink(srcFile, destFile);
      } finally {
        restore();
      }
      expect(fs.readFileSync(destFile, 'utf8')).to.equal('hello');
    });
  });

  describe('when the retry cleanup of a locked destination fails temporarily', () => {
    it('should keep retrying and link the source', () => {
      const srcFile = path.join(tempDir, 'source-file.txt');
      const otherFile = path.join(tempDir, 'other-file.txt');
      const destFile = path.join(tempDir, 'dest-file.txt');
      fs.writeFileSync(srcFile, 'hello');
      fs.writeFileSync(otherFile, 'world');
      fs.linkSync(otherFile, destFile);

      // 1st call (before the first attempt): skipped, so the link fails with EEXIST.
      // 2nd call (the first retry cleanup): throws EPERM, as a locked file does on Windows.
      const originalRemoveSync = fs.removeSync;
      let calls = 0;
      fs.removeSync = (p: string) => {
        if (p === destFile) {
          calls++;
          if (calls === 1) return;
          if (calls === 2) throw Object.assign(new Error('EPERM: operation not permitted'), { code: 'EPERM' });
        }
        originalRemoveSync(p);
      };
      try {
        createLinkOrSymlink(srcFile, destFile);
      } finally {
        fs.removeSync = originalRemoveSync;
      }
      expect(fs.readFileSync(destFile, 'utf8')).to.equal('hello');
    });
  });
});
