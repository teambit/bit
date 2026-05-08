import { expect } from 'chai';
import fs from 'fs-extra';
import path from 'path';
import { globalBitTempDir } from '@teambit/defender.fs.global-bit-temp-dir';
import symlinkDir from 'symlink-dir';
import { hardLinkDirectory } from './hard-link-directory';

describe('hardLinkDirectory()', () => {
  it('should hard link files (excluding node_modules)', async () => {
    const tempDir = globalBitTempDir();
    const srcDir = path.join(tempDir, 'source');
    const dest1Dir = path.join(tempDir, 'dest1');
    const dest2Dir = path.join(tempDir, 'dest2');

    fs.mkdirpSync(srcDir);
    fs.mkdirpSync(dest1Dir);
    fs.mkdirpSync(path.join(srcDir, 'node_modules'));
    fs.mkdirpSync(path.join(srcDir, 'subdir'));

    fs.writeFileSync(path.join(srcDir, 'file.txt'), 'Hello World');
    fs.writeFileSync(path.join(srcDir, 'subdir/file.txt'), 'Hello World');
    fs.writeFileSync(path.join(srcDir, 'node_modules/file.txt'), 'Hello World');

    await hardLinkDirectory(srcDir, [dest1Dir, dest2Dir]);

    // It should link the files from the root
    expect(fs.readFileSync(path.join(dest1Dir, 'file.txt'), 'utf8')).to.equal('Hello World');
    expect(fs.readFileSync(path.join(dest2Dir, 'file.txt'), 'utf8')).to.equal('Hello World');

    // It should link files from a subdirectory
    expect(fs.readFileSync(path.join(dest1Dir, 'subdir/file.txt'), 'utf8')).to.equal('Hello World');
    expect(fs.readFileSync(path.join(dest2Dir, 'subdir/file.txt'), 'utf8')).to.equal('Hello World');

    // It should not link files from node_modules
    expect(fs.existsSync(path.join(dest1Dir, 'node_modules/file.txt'))).to.equal(false);
    expect(fs.existsSync(path.join(dest2Dir, 'node_modules/file.txt'))).to.equal(false);
  });

  it('hard link a directory that has a symlinked directory', async () => {
    const tempDir = globalBitTempDir();
    const symlinkTargetDir = path.join(tempDir, 'symlink-target');
    const srcDir = path.join(tempDir, 'source');
    const dest1Dir = path.join(tempDir, 'dest1');
    const dest2Dir = path.join(tempDir, 'dest2');

    fs.mkdirpSync(symlinkTargetDir);
    fs.writeFileSync(path.join(symlinkTargetDir, 'file.txt'), 'Hello World');
    fs.mkdirpSync(srcDir);
    fs.mkdirpSync(dest1Dir);
    await symlinkDir(symlinkTargetDir, path.join(srcDir, 'symlinked-dir'));

    await hardLinkDirectory(srcDir, [dest1Dir, dest2Dir]);

    expect(fs.readFileSync(path.join(dest1Dir, 'symlinked-dir', 'file.txt'), 'utf8')).to.equal('Hello World');
    expect(fs.readFileSync(path.join(dest2Dir, 'symlinked-dir', 'file.txt'), 'utf8')).to.equal('Hello World');
  });

  it('copy symlinked files', async () => {
    const tempDir = globalBitTempDir();
    const symlinkTargetDir = path.join(tempDir, 'symlink-target');
    const srcDir = path.join(tempDir, 'source');
    const dest1Dir = path.join(tempDir, 'dest1');
    const dest2Dir = path.join(tempDir, 'dest2');

    fs.mkdirpSync(symlinkTargetDir);
    fs.mkdirpSync(srcDir);
    fs.mkdirpSync(dest1Dir);
    const symlinkTargetFile = path.join(symlinkTargetDir, 'file.txt');
    fs.writeFileSync(symlinkTargetFile, 'Hello World');
    await symlinkDir(symlinkTargetFile, path.join(srcDir, 'file.txt'));

    await hardLinkDirectory(srcDir, [dest1Dir, dest2Dir]);

    expect(fs.readFileSync(path.join(dest1Dir, 'file.txt'), 'utf8')).to.equal('Hello World');
    expect(fs.lstatSync(path.join(dest1Dir, 'file.txt')).isSymbolicLink()).to.equal(false);
    expect(fs.readFileSync(path.join(dest2Dir, 'file.txt'), 'utf8')).to.equal('Hello World');
    expect(fs.lstatSync(path.join(dest2Dir, 'file.txt')).isSymbolicLink()).to.equal(false);
  });

  it('fall back to copying when hard linking fails with EXDEV', async () => {
    const tempDir = globalBitTempDir();
    const srcDir = path.join(tempDir, 'source');
    const dest1Dir = path.join(tempDir, 'dest1');
    const dest2Dir = path.join(tempDir, 'dest2');

    fs.mkdirpSync(srcDir);
    fs.mkdirpSync(dest1Dir);
    fs.mkdirpSync(dest2Dir);
    fs.writeFileSync(path.join(srcDir, 'file.txt'), 'Hello World');

    const originalLink = fs.link;
    (fs as any).link = () => {
      const err = new Error('EXDEV: cross-device link not permitted');
      (err as any).code = 'EXDEV';
      return Promise.reject(err);
    };
    try {
      await hardLinkDirectory(srcDir, [dest1Dir, dest2Dir]);
    } finally {
      (fs as any).link = originalLink;
    }

    expect(fs.readFileSync(path.join(dest1Dir, 'file.txt'), 'utf8')).to.equal('Hello World');
    expect(fs.readFileSync(path.join(dest2Dir, 'file.txt'), 'utf8')).to.equal('Hello World');
    // the fallback copies the file, so it must not share an inode with the source
    expect(fs.statSync(path.join(dest1Dir, 'file.txt')).ino).to.not.equal(
      fs.statSync(path.join(srcDir, 'file.txt')).ino
    );
  });

  it('skip broken symlink', async () => {
    const tempDir = globalBitTempDir();
    const symlinkTargetDir = path.join(tempDir, 'symlink-target');
    const srcDir = path.join(tempDir, 'source');
    const dest1Dir = path.join(tempDir, 'dest1');
    const dest2Dir = path.join(tempDir, 'dest2');

    fs.mkdirpSync(symlinkTargetDir);
    fs.mkdirpSync(srcDir);
    fs.mkdirpSync(dest1Dir);
    fs.mkdirpSync(dest2Dir);
    const symlinkTargetFile = path.join(symlinkTargetDir, 'file.txt');
    fs.writeFileSync(symlinkTargetFile, 'Hello World');
    await symlinkDir(symlinkTargetFile, path.join(srcDir, 'file.txt'));
    fs.unlinkSync(symlinkTargetFile);

    await hardLinkDirectory(srcDir, [dest1Dir, dest2Dir]);

    expect(fs.readdirSync(dest1Dir)).to.deep.equal([]);
    expect(fs.readdirSync(dest2Dir)).to.deep.equal([]);
  });
});

test('recover when an ancestor of the destination subdirectory is a regular file', async () => {
  const tempDir = globalBitTempDir();
  const srcDir = path.join(tempDir, 'source');
  const destDir = path.join(tempDir, 'dest');

  fs.mkdirpSync(srcDir);
  fs.mkdirpSync(path.join(srcDir, '@scope', 'pkg'));
  fs.writeFileSync(path.join(srcDir, '@scope/pkg/file.txt'), 'Hello World');

  // Simulate a corrupted node_modules layout: '@scope' exists as a regular file
  // where a directory is expected. This is the shape of the ENOTDIR mkdir failure
  // seen during 'bit install' post-install linking into '.bit_roots'.
  fs.mkdirpSync(destDir);
  fs.writeFileSync(path.join(destDir, '@scope'), 'stray file');

  await hardLinkDirectory(srcDir, [destDir]);

  expect(fs.readFileSync(path.join(destDir, '@scope/pkg/file.txt'), 'utf8')).toBe('Hello World');
});

test('recover when the exact destination subdirectory exists as a regular file', async () => {
  const tempDir = globalBitTempDir();
  const srcDir = path.join(tempDir, 'source');
  const destDir = path.join(tempDir, 'dest');

  fs.mkdirpSync(srcDir);
  fs.mkdirpSync(path.join(srcDir, 'subdir'));
  fs.writeFileSync(path.join(srcDir, 'subdir/file.txt'), 'Hello World');

  fs.mkdirpSync(destDir);
  fs.writeFileSync(path.join(destDir, 'subdir'), 'stray file');

  await hardLinkDirectory(srcDir, [destDir]);

  expect(fs.readFileSync(path.join(destDir, 'subdir/file.txt'), 'utf8')).toBe('Hello World');
});

test('recover when an ancestor of the destination subdirectory is a dangling symlink', async () => {
  const tempDir = globalBitTempDir();
  const srcDir = path.join(tempDir, 'source');
  const destDir = path.join(tempDir, 'dest');

  fs.mkdirpSync(srcDir);
  fs.mkdirpSync(path.join(srcDir, '@scope', 'pkg'));
  fs.writeFileSync(path.join(srcDir, '@scope/pkg/file.txt'), 'Hello World');

  fs.mkdirpSync(destDir);
  // Dangling symlink at '@scope' — points to a non-existent target. lstat reports it
  // as a symlink (not a directory), so mkdir(@scope/pkg) fails with ENOENT through it.
  fs.symlinkSync(path.join(tempDir, 'does-not-exist'), path.join(destDir, '@scope'));

  await hardLinkDirectory(srcDir, [destDir]);

  expect(fs.readFileSync(path.join(destDir, '@scope/pkg/file.txt'), 'utf8')).toBe('Hello World');
});
