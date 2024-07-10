import { BitError } from '@teambit/bit-error';

export default class OutsideRootDir extends BitError {
  filePath: string;
  rootDir: string;

  constructor(filePath: string, rootDir: string) {
    super(`unable to add file ${filePath} because it's located outside the component root dir ${rootDir}`);
    this.filePath = filePath;
    this.rootDir = rootDir;
  }
}
