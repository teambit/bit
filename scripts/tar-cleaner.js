import path from 'path';
import fs from 'fs';
import chalk from 'chalk';
import _ from 'lodash';
import { promisify } from 'util';

const { sortBy } = _;

const readdirAsync = promisify(fs.readdir);
const statAsync = promisify(fs.stat);

/**
 * Recursively searches for files with specified extensions in a folder and calculates the total size.
 */
export async function FileExplorer({
  extensions,
  folderPath,
  verbose = false,
  allExtensions = false,
  minSizeToPrint = 1,
}) {
  let totalSize = 0;
  let totalCount = 0;
  const extRes = {};

  async function searchFiles(dir) {
    let files;
    try {
      files = await readdirAsync(dir);
    } catch (err) {
      console.error(`Error reading directory ${dir}:`, err);
      return;
    }
    for (const file of files) {
      const filePath = path.join(dir, file);
      let stats;
      try {
        stats = await statAsync(filePath);
      } catch (err) {
        console.error(`Error reading stats for ${filePath}:`, err);
        continue;
      }
      if (stats.isDirectory()) {
        await searchFiles(filePath);
      } else {
        const ext = file.endsWith('.d.ts') ? 'd.ts' : path.extname(file).slice(1); // Get extension without leading dot
        if (extensions.includes(ext) || allExtensions) {
          totalSize += stats.size;
          totalCount++;
          if (extRes[ext]) {
            extRes[ext].size += stats.size;
            extRes[ext].count++;
          } else {
            extRes[ext] = {
              size: stats.size,
              count: 1,
            };
          }
          if (verbose) {
            console.log(filePath);
          }
        }
      }
    }
  }

  await searchFiles(folderPath);
  const sortedExtRes = sortBy(Object.keys(extRes), (ext) => extRes[ext].size).reverse();
  sortedExtRes.forEach((ext) => {
    if (toMb(extRes[ext].size) > minSizeToPrint) {
      console.log(
        `${chalk.green(ext)}: ${chalk.cyan(extRes[ext].count)} files, ${chalk.cyan(toMb(extRes[ext].size))} MB`
      );
    }
  });

  console.log(`\nFound ${chalk.cyan(totalCount)} files with extensions ${extensions.join(', ')}.`);
  console.log(`Total size: ${chalk.cyan(toMb(totalSize))} MB`);
}

function toMb(bytes) {
  return (bytes / (1024 * 1024)).toFixed(2);
}

const fileExtensionsLargerThan1mb = [
  'js',
  'yaml',
  'cjs',
  'mjs',
  'd.ts',
  'json',
  'ts',
  'flow',
  'css',
  'png',
  'node',
  'tsx',
  'tgz',
  'bare',
  'py',
];

const _fileExtensionsFull = [
  'd.ts',
  'svg',
  'ts',
  'tsx',
  'APACHE',
  'APACHE2',
  'BSD',
  'DOCS',
  'DS_Store',
  'MD',
  'MIT',
  '_js',
  'all-contributorsrc',
  'applescript',
  'auto-changelog',
  'babelrc',
  'bak',
  'bar',
  'bare',
  'bat',
  'bin',
  'bit-capsule-ready',
  'bitmap',
  'bnf',
  'browser',
  'browserslistrc',
  'bud',
  'c',
  'cc',
  'cjs',
  'closure-compiler',
  'cmd',
  'coffee',
  'conf',
  'cs',
  'css',
  'cts',
  'def',
  'docx',
  'dot',
  'editorconfig',
  'ejs',
  'error',
  'eslintcache',
  'eslintignore',
  'eslintrc',
  'esprima',
  'flow',
  'flowconfig',
  'foo',
  'g',
  'gif',
  'gitattributes',
  'gitignore',
  'gitkeep',
  'gitmodules',
  'gyp',
  'gypi',
  'gz',
  'hash',
  'hbs',
  'header',
  'html',
  'huskyrc',
  'ignore',
  'iml',
  'jpg',
  'js',
  'jscsrc',
  'jsdoc',
  'jshintignore',
  'jshintrc',
  'json',
  'jsonc',
  'jst',
  'jsx',
  'js~',
  'key',
  'less',
  'lint',
  'list',
  'lock',
  'log',
  'ls',
  'markdown',
  'mdown',
  'mjs',
  'mts',
  'ninja',
  'nix',
  'njs',
  'node',
  'npmignore',
  'npmingore',
  'npmrc',
  'nvmrc',
  'nycrc',
  'opts',
  'pdf',
  'pdl',
  'pegjs',
  'pem',
  'php',
  'png',
  'prettierignore',
  'prettierrc',
  'priv',
  'proto',
  'pub',
  'py',
  'sass',
  'scss',
  'sh',
  'size-limit',
  'snap',
  'styl',
  'sublime-project',
  'svg',
  'swf',
  'taprc',
  'tar',
  'testignore',
  'tgz',
  'tm_properties',
  'tmpl',
  'toml',
  'tsbuildinfo',
  'tsxx',
  'ttf',
  'txt',
  'typed',
  'wasm',
  'wmf',
  'xml',
  'yaml',
  'yml',
  'zip',
];

FileExplorer({
  extensions: fileExtensionsLargerThan1mb,
  allExtensions: true,
  folderPath: '/Users/giladshoham/.bvm/versions/1.9.27/bit-1.9.27',
  // folderPath: '/Users/giladshoham/.bvm/versions/1.9.27/bit-1.9.27/node_modules/@teambit',
  // verbose: true,
});