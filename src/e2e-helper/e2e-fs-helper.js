// @flow
import glob from 'glob';
import path from 'path';
import fs from 'fs-extra';
import * as fixtures from '../../e2e/fixtures/fixtures';
import { ensureAndWriteJson, generateRandomStr } from './e2e-helper';
import ScopesData from './e2e-scopes';

export default class FsHelper {
  scopes: ScopesData;
  externalDirsArray: string[] = [];
  constructor(scopes: ScopesData) {
    this.scopes = scopes;
  }

  getConsumerFiles(ext: string = '*.{js,ts}', includeDot: boolean = true) {
    return glob
      .sync(path.normalize(`**/${ext}`), { cwd: this.scopes.localPath, dot: includeDot })
      .map(x => path.normalize(x));
  }
  getObjectFiles() {
    return glob.sync(path.normalize('*/*'), { cwd: path.join(this.scopes.localPath, '.bit/objects') });
  }
  createFile(folder: string, name: string, impl?: string = fixtures.fooFixture) {
    const filePath = path.join(this.scopes.localPath, folder, name);
    fs.outputFileSync(filePath, impl);
  }

  createJsonFile(filePathRelativeToLocalScope: string, jsonContent: string) {
    const filePath = path.join(this.scopes.localPath, filePathRelativeToLocalScope);
    ensureAndWriteJson(filePath, jsonContent);
  }

  createFileOnRootLevel(name: string = 'foo.js', impl?: string = fixtures.fooFixture) {
    const filePath = path.join(this.scopes.localPath, name);
    fs.outputFileSync(filePath, impl);
  }

  readFile(filePathRelativeToLocalScope: string): string {
    return fs.readFileSync(path.join(this.scopes.localPath, filePathRelativeToLocalScope)).toString();
  }

  readJsonFile(filePathRelativeToLocalScope: string): string {
    return fs.readJsonSync(path.join(this.scopes.localPath, filePathRelativeToLocalScope));
  }

  outputFile(filePathRelativeToLocalScope: string, data: string = ''): string {
    return fs.outputFileSync(path.join(this.scopes.localPath, filePathRelativeToLocalScope), data);
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
