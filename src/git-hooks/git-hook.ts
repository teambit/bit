import * as path from 'path';
import fs from 'fs-extra';
import logger from '../logger/logger';
import * as errors from './exceptions';

export default class GitHook {
  hooksDirPath: string;
  name: string;
  content: string;

  constructor(hooksDirPath: string, name: string, content: string) {
    this.hooksDirPath = hooksDirPath;
    this.name = name;
    this.content = content;
  }

  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  get fullPath(): string {
    return path.join(this.hooksDirPath, this.name);
  }

  isExistSync() {
    return fs.existsSync(this.fullPath);
  }

  writeSync(override: boolean = false, throws: boolean = false) {
    const exist = this.isExistSync();
    if (exist && !override) {
      if (throws) throw new errors.GitHookAlreadyExists(this.name);
      return null;
    }
    fs.writeFileSync(this.fullPath, this.content);
    return true;
  }
}
