import fs from 'fs-extra';
import { removeFilesAndEmptyDirsRecursively } from './remove-files-and-empty-dirs-recursively';

export class RemovePath {
  path: string;
  removeItsDirIfEmpty: boolean;
  /**
   * relevant when removeItsDirIfEmpty is true. the empty parent dirs are removed up to (not including) this dir.
   * set by DataToPersist.addBasePath. when missing, only the immediate parent dir is removed (if empty).
   */
  stopAtDir?: string;
  constructor(path: string, removeItsDirIfEmpty = false) {
    this.path = path;
    this.removeItsDirIfEmpty = removeItsDirIfEmpty;
  }

  async persistToFS() {
    if (this.removeItsDirIfEmpty) {
      return removeFilesAndEmptyDirsRecursively([this.path], this.stopAtDir);
    }
    return fs.remove(this.path);
  }
}
