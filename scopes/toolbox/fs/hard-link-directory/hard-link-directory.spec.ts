import fs from 'fs-extra';
import path from 'path';
import tempy from 'tempy';
import { hardLinkDirectory } from './hard-link-directory';

test('hardLinkDirectory()', async () => {
  process.chdir(tempy.directory());

  fs.mkdirpSync('source');
  fs.mkdirpSync('dest1');
  fs.mkdirpSync('dest2');
  fs.mkdirpSync('source/node_modules');
  fs.mkdirpSync('source/subdir');

  fs.writeFileSync('source/file.txt', 'Hello World');
  fs.writeFileSync('source/subdir/file.txt', 'Hello World');
  fs.writeFileSync('source/node_modules/file.txt', 'Hello World');

  await hardLinkDirectory(path.resolve('source'), [
    path.resolve('dest1'),
    path.resolve('dest2'),
  ]);

  // It should link the files from the root
  expect(fs.readFileSync('dest1/file.txt', 'utf8')).toBe('Hello World');
  expect(fs.readFileSync('dest2/file.txt', 'utf8')).toBe('Hello World');

  // It should link files from a subdirectory
  expect(fs.readFileSync('dest1/subdir/file.txt', 'utf8')).toBe('Hello World');
  expect(fs.readFileSync('dest2/subdir/file.txt', 'utf8')).toBe('Hello World');

  // It should not link files from node_modules
  expect(fs.existsSync('dest1/node_modules/file.txt')).toBe(false);
  expect(fs.existsSync('dest2/node_modules/file.txt')).toBe(false);
})
