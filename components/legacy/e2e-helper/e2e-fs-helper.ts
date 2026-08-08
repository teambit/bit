/// <reference types="chai-fs" />
import fs from 'fs-extra';
import { use, expect } from 'chai';
import { globSync } from 'glob';
import * as path from 'path';
import * as yaml from 'yaml';
import resolveFrom from 'resolve-from';
import { generateRandomStr } from '@teambit/toolbox.string.random';
import { depPathToDirName } from '@teambit/dependencies.pnpm.dep-path';
import * as fixtures from './fixtures';
import { ensureAndWriteJson } from './e2e-helper';
import type ScopesData from './e2e-scopes';

use(require('chai-fs'));

export default class FsHelper {
  scopes: ScopesData;
  externalDirsArray: string[] = [];
  constructor(scopes: ScopesData) {
    this.scopes = scopes;
  }

  getConsumerFiles(ext = '*.{js,ts}', includeDot = true, includeNodeModules = true) {
    const params = { cwd: this.scopes.localPath, dot: includeDot };
    if (!includeNodeModules) {
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      params.ignore = 'node_modules/**/*';
    }

    return globSync(path.normalize(`**/${ext}`), params).map((x) => path.normalize(x));
  }
  /**
   * Walk a chain of package names the way Node resolves them - each name is resolved from the real
   * directory of the one before it - and return the last one's directory.
   *
   * Use this instead of hand-writing a path into `node_modules/.pnpm/<depPath>/node_modules/<dep>`:
   * that spelling only exists in the project-local virtual store. Under the global virtual store the
   * package lives in a hash-named directory in the shared store, and under a hoisted `nodeLinker` it
   * is nested in `node_modules` - resolution finds the right copy in all three.
   */
  resolvePackageDir(chain: string[], workspacePath: string = this.scopes.localPath): string {
    let dir = workspacePath;
    for (const packageName of chain) {
      dir = path.dirname(fs.realpathSync(resolveFrom(dir, `${packageName}/package.json`)));
    }
    return dir;
  }

  /** The `package.json` of the package at the end of a `resolvePackageDir` chain. */
  readPackageJsonOfChain(chain: string[], workspacePath?: string): Record<string, any> {
    return fs.readJsonSync(path.join(this.resolvePackageDir(chain, workspacePath), 'package.json'));
  }

  /**
   * The dependency directories the last install materialized, named the way `node_modules/.pnpm`
   * names them (`@scope+name@version`).
   *
   * With the global virtual store enabled those directories live in the shared store instead of
   * `node_modules/.pnpm`, and the shared store holds every workspace's packages - so the equivalent
   * per-workspace list comes from the current lockfile the install writes next to them.
   */
  getVirtualStoreDirNames(workspacePath: string = this.scopes.localPath): string[] {
    const virtualStoreDir = path.join(workspacePath, 'node_modules/.pnpm');
    if (!fs.existsSync(virtualStoreDir)) return [];
    // dependency directories only - metadata files (`lock.yaml`) and pnpm's own entries
    // (`node_modules`, dot-entries) would otherwise read as materialized deps and suppress
    // the lockfile fallback below
    const dirs = fs
      .readdirSync(virtualStoreDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules')
      .map((entry) => entry.name);
    if (dirs.length) return dirs;
    const currentLockfile = path.join(virtualStoreDir, 'lock.yaml');
    if (!fs.existsSync(currentLockfile)) return dirs;
    const lockfile = yaml.parse(fs.readFileSync(currentLockfile, 'utf8'));
    return Object.keys(lockfile?.packages ?? {}).map((depPath: string) => depPathToDirName(depPath));
  }

  getObjectFiles() {
    return globSync(path.normalize('*/*'), { cwd: path.join(this.scopes.localPath, '.bit/objects') });
  }
  /**
   * @deprecated use outputFile instead
   */
  createFile(folder: string, name: string, impl: string = fixtures.fooFixture) {
    const filePath = path.join(this.scopes.localPath, folder, name);
    fs.outputFileSync(filePath, impl);
  }

  createJsonFile(filePathRelativeToLocalScope: string, jsonContent: Record<string, any>) {
    const filePath = path.join(this.scopes.localPath, filePathRelativeToLocalScope);
    ensureAndWriteJson(filePath, jsonContent);
  }

  createFileOnRootLevel(name = 'foo.js', impl: string = fixtures.fooFixture) {
    const filePath = path.join(this.scopes.localPath, name);
    fs.outputFileSync(filePath, impl);
  }

  readFile(filePathRelativeToLocalScope: string): string {
    return fs.readFileSync(path.join(this.scopes.localPath, filePathRelativeToLocalScope)).toString();
  }

  readJsonFile(filePathRelativeToLocalScope: string): Record<string, any> {
    return fs.readJsonSync(path.join(this.scopes.localPath, filePathRelativeToLocalScope));
  }

  exists(filePathRelativeToLocalScope: string): boolean {
    return fs.existsSync(path.join(this.scopes.localPath, filePathRelativeToLocalScope));
  }

  expectDirToExist(filePathRelativeToLocalScope: string): void {
    expect(path.join(this.scopes.localPath, filePathRelativeToLocalScope)).to.be.a.directory();
  }
  expectFileToExist(filePathRelativeToLocalScope: string): void {
    expect(path.join(this.scopes.localPath, filePathRelativeToLocalScope)).to.be.a.file();
  }
  expectPathNotToExist(filePathRelativeToLocalScope: string): void {
    expect(path.join(this.scopes.localPath, filePathRelativeToLocalScope)).to.not.be.a.path();
  }

  outputFile(filePathRelativeToLocalScope: string, data = ''): void {
    return fs.outputFileSync(path.join(this.scopes.localPath, filePathRelativeToLocalScope), data);
  }

  appendFile(filePathRelativeToLocalScope: string, data = '\n'): void {
    return fs.appendFileSync(path.join(this.scopes.localPath, filePathRelativeToLocalScope), data);
  }

  prependFile(filePathRelativeToLocalScope: string, data = '\n'): void {
    const filePath = path.join(this.scopes.localPath, filePathRelativeToLocalScope);
    if (!fs.existsSync(filePath)) return fs.writeFileSync(filePath, data);
    const content = fs.readFileSync(filePath).toString();
    return fs.writeFileSync(filePath, `${data}${content}`);
  }

  writeFile(filePathRelativeToLocalScope: string, content: string): void {
    const filePath = path.join(this.scopes.localPath, filePathRelativeToLocalScope);
    return fs.writeFileSync(filePath, content);
  }

  moveSync(srcPathRelativeToLocalScope: string, destPathRelativeToLocalScope: string) {
    const src = path.join(this.scopes.localPath, srcPathRelativeToLocalScope);
    const dest = path.join(this.scopes.localPath, destPathRelativeToLocalScope);
    return fs.moveSync(src, dest);
  }

  /**
   * adds "\n" at the beginning of the file to make it modified.
   */
  modifyFile(filePath: string, basePath = this.scopes.localPath) {
    const absPath = basePath ? path.join(basePath, filePath) : filePath;
    const content = fs.readFileSync(absPath);
    fs.outputFileSync(absPath, `\n${content}`);
  }

  deletePath(relativePathToLocalScope: string) {
    return fs.removeSync(path.join(this.scopes.localPath, relativePathToLocalScope));
  }

  deleteObject(objectPath: string) {
    // general-helper can be helpful with getting the path
    return fs.removeSync(path.join(this.scopes.localPath, '.bit/objects', objectPath));
  }

  deleteRemoteObject(objectPath: string) {
    // general-helper can be helpful with getting the path
    return fs.removeSync(path.join(this.scopes.remotePath, 'objects', objectPath));
  }

  createNewDirectory() {
    const newDir = `${generateRandomStr()}-dir`;
    const newDirPath = path.join(this.scopes.e2eDir, newDir);
    fs.ensureDirSync(newDirPath);
    this.externalDirsArray.push(newDirPath);
    return newDirPath;
  }

  createNewDirectoryInLocalWorkspace(dirPath: string) {
    const newDirPath = path.join(this.scopes.localPath, dirPath);
    fs.ensureDirSync(newDirPath);
    return newDirPath;
  }
  cleanDir(dirPath: string) {
    fs.removeSync(dirPath);
  }
  cleanExternalDirs() {
    this.externalDirsArray.forEach((dirPath) => {
      this.cleanDir(dirPath);
    });
  }
}
