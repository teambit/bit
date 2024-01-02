import fs from 'fs-extra';
import path from 'path';
import { globalBitTempDir } from '@teambit/defender.fs.global-bit-temp-dir';
import symlinkDir from 'symlink-dir';
import { hardLinkDirectory } from './hard-link-directory';

test('hardLinkDirectory()', async () => {
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
  expect(fs.readFileSync(path.join(dest1Dir, 'file.txt'), 'utf8')).toBe('Hello World');
  expect(fs.readFileSync(path.join(dest2Dir, 'file.txt'), 'utf8')).toBe('Hello World');

  // It should link files from a subdirectory
  expect(fs.readFileSync(path.join(dest1Dir, 'subdir/file.txt'), 'utf8')).toBe('Hello World');
  expect(fs.readFileSync(path.join(dest2Dir, 'subdir/file.txt'), 'utf8')).toBe('Hello World');

  // It should not link files from node_modules
  expect(fs.existsSync(path.join(dest1Dir, 'node_modules/file.txt'))).toBe(false);
  expect(fs.existsSync(path.join(dest2Dir, 'node_modules/file.txt'))).toBe(false);
});

test('hard link a directory that has a symlinked directory', async () => {
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

  expect(fs.readFileSync(path.join(dest1Dir, 'symlinked-dir', 'file.txt'), 'utf8')).toBe('Hello World');
  expect(fs.readFileSync(path.join(dest2Dir, 'symlinked-dir', 'file.txt'), 'utf8')).toBe('Hello World');
});

test('copy symlinked files', async () => {
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

  expect(fs.readFileSync(path.join(dest1Dir, 'file.txt'), 'utf8')).toBe('Hello World');
  expect(fs.lstatSync(path.join(dest1Dir, 'file.txt')).isSymbolicLink()).toBeFalsy();
  expect(fs.readFileSync(path.join(dest2Dir, 'file.txt'), 'utf8')).toBe('Hello World');
  expect(fs.lstatSync(path.join(dest2Dir, 'file.txt')).isSymbolicLink()).toBeFalsy();
});

test('skip broken symlink', async () => {
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

  expect(fs.readdirSync(dest1Dir)).toEqual([]);
  expect(fs.readdirSync(dest2Dir)).toEqual([]);
});
