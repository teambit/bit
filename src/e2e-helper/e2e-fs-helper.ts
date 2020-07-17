import glob from 'glob';
import * as path from 'path';
import fs from 'fs-extra';
import * as fixtures from '../../src/fixtures/fixtures';
import { ensureAndWriteJson } from './e2e-helper';
import ScopesData from './e2e-scopes';
import { generateRandomStr } from '../utils';

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

    return glob.sync(path.normalize(`**/${ext}`), params).map((x) => path.normalize(x));
  }
  getObjectFiles() {
    return glob.sync(path.normalize('*/*'), { cwd: path.join(this.scopes.localPath, '.bit/objects') });
  }
  /**
   * @deprecated use outputFile instead
   */
  createFile(folder: string, name: string, impl: string = fixtures.fooFixture) {
    const filePath = path.join(this.scopes.localPath, folder, name);
    fs.outputFileSync(filePath, impl);
  }

  createJsonFile(filePathRelativeToLocalScope: string, jsonContent: string) {
    const filePath = path.join(this.scopes.localPath, filePathRelativeToLocalScope);
    ensureAndWriteJson(filePath, jsonContent);
  }

  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  createFileOnRootLevel(name = 'foo.js', impl?: string = fixtures.fooFixture) {
    const filePath = path.join(this.scopes.localPath, name);
    fs.outputFileSync(filePath, impl);
  }

  readFile(filePathRelativeToLocalScope: string): string {
    return fs.readFileSync(path.join(this.scopes.localPath, filePathRelativeToLocalScope)).toString();
  }

  readJsonFile(filePathRelativeToLocalScope: string): string {
    return fs.readJsonSync(path.join(this.scopes.localPath, filePathRelativeToLocalScope));
  }

  outputFile(filePathRelativeToLocalScope: string, data = ''): void {
    return fs.outputFileSync(path.join(this.scopes.localPath, filePathRelativeToLocalScope), data);
  }

  appendFile(filePathRelativeToLocalScope: string, data = '\n'): void {
    return fs.appendFileSync(path.join(this.scopes.localPath, filePathRelativeToLocalScope), data);
  }

  moveSync(srcPathRelativeToLocalScope: string, destPathRelativeToLocalScope: string) {
    const src = path.join(this.scopes.localPath, srcPathRelativeToLocalScope);
    const dest = path.join(this.scopes.localPath, destPathRelativeToLocalScope);
    return fs.moveSync(src, dest);
  }

  /**
   * adds "\n" at the beginning of the file to make it modified.
   */
  modifyFile(filePath: string) {
    const content = fs.readFileSync(filePath);
    fs.outputFileSync(filePath, `\n${content}`);
  }

  deletePath(relativePathToLocalScope: string) {
    return fs.removeSync(path.join(this.scopes.localPath, relativePathToLocalScope));
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
