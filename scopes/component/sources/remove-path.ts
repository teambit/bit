import fs from 'fs-extra';
import { removeFilesAndEmptyDirsRecursively } from './remove-files-and-empty-dirs-recursively';

export class RemovePath {
  path: string;
  removeItsDirIfEmpty: boolean;
  // @ts-expect-error AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  constructor(path: string, removeItsDirIfEmpty? = false) {
    this.path = path;
    this.removeItsDirIfEmpty = removeItsDirIfEmpty;
  }

  async persistToFS() {
    if (this.removeItsDirIfEmpty) {
      return removeFilesAndEmptyDirsRecursively([this.path]);
    }
    return fs.remove(this.path);
  }
}
