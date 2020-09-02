import fs from 'fs-extra';

import removeFilesAndEmptyDirsRecursively from '../../../utils/fs/remove-files-and-empty-dirs-recursively';

export default class RemovePath {
  path: string;
  removeItsDirIfEmpty: boolean;
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
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
