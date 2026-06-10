import { expect } from 'chai';
import fs from 'fs-extra';
import path from 'path';
import { globalBitTempDir } from '@teambit/defender.fs.global-bit-temp-dir';
import { createLinkOrSymlink } from './create-link-or-symlink';

/**
 * Stubs fs.removeSync to skip removal of a specific path, simulating a concurrent process
 * that re-creates the link between removeSync and linkSync/symlinkSync.
 */
function stubRemoveSyncFor(targetPath: string): () => void {
  const originalRemoveSync = fs.removeSync;
  fs.removeSync = (p: string) => {
    if (p === targetPath) return;
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
});
