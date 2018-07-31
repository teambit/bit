// @flow

import path from 'path';
import R from 'ramda';
import vinylFile from 'vinyl-file';
import { AbstractVinyl } from '../consumer/component/sources';
import ExtensionFileNotFound from './exceptions/extension-file-not-found';
import logger from '../logger/logger';
import type { PathOsBased, PathLinux } from '../utils/path';
import { Repository, Ref } from '../scope/objects';
import Source from '../scope/models/source';

export type ExtensionFileModel = {
  name: string,
  relativePath: PathLinux,
  file: Ref
};

export type ExtensionFileObject = {
  name: string,
  relativePath: PathLinux,
  file: string
};

export default class ExtensionFile extends AbstractVinyl {
  static async load(
    name: string,
    filePath: PathOsBased,
    consumerPath: PathOsBased,
    base: PathOsBased = consumerPath,
    extendedProps?: Object
  ): Promise<ExtensionFile> {
    try {
      const baseFile = await vinylFile.read(filePath, { base, cwd: consumerPath });
      const file = new ExtensionFile(baseFile);
      file.name = name;
      file.file = Source.from(file.contents);
      const addToFile = (value, key) => (file[key] = value); /* eslint-disable-line no-return-assign */
      R.forEachObjIndexed(addToFile, extendedProps);
      return file;
    } catch (err) {
      logger.error(`failed loading file ${filePath}. Error: ${err}`);
      if (err.code === 'ENOENT' && err.path) {
        throw new ExtensionFileNotFound(err.path);
      }
      throw err;
    }
  }

  static async loadFromBitJsonObject(
    bitJsonObj: PathOsBased,
    consumerPath: PathOsBased,
    bitJsonPath: PathOsBased
  ): Promise<ExtensionFile[]> {
    if (!bitJsonObj || R.isEmpty(bitJsonObj)) return [];
    const loadP: Promise<ExtensionFile>[] = [];
    const bitJsonDirPath = path.dirname(bitJsonPath);
    const loadFile = (value, key) => {
      // TODO: Gilad - support component bit json
      const fullPath = path.resolve(bitJsonDirPath, value);
      loadP.push(this.load(key, fullPath, bitJsonDirPath, consumerPath));
    };
    R.forEachObjIndexed(loadFile, bitJsonObj);
    return Promise.all(loadP);
  }

  static loadFromParsedString(parsedString: Object): ?ExtensionFile {
    if (!parsedString) return null;
    const opts = super.loadFromParsedString(parsedString);
    const extensionFile = new ExtensionFile(opts);
    extensionFile.file = Source.from(extensionFile.contents);
    return extensionFile;
  }

  static loadFromParsedStringArray(arr: Object[]): ?Array<?ExtensionFile> {
    if (!arr) return null;
    return arr.map(this.loadFromParsedString);
  }

  static async loadFromExtensionFileModel(file: ExtensionFileModel, repository: Repository): Promise<ExtensionFile> {
    // $FlowFixMe
    const content = await file.file.load(repository);
    const extensionFile = new ExtensionFile({ base: '.', path: file.name, contents: content.contents });
    extensionFile.file = Source.from(extensionFile.contents);
    extensionFile.name = file.name;
    return extensionFile;
  }

  /**
   * Util function to transform the file from Ref to string
   * Used in version.toObject
   * The opposite action of fromObjectToModelObject
   * @param {*} file
   */
  static fromModelObjectToObject(file: ExtensionFileModel): ExtensionFileObject {
    return {
      name: file.name,
      relativePath: file.relativePath,
      file: file.file.toString()
    };
  }

  /**
   * Util function to transform the file from string to Ref
   * Used in version.parse
   * The opposite action of fromModelObjectToObject
   * @param {*} file
   */
  static fromObjectToModelObject(file: ExtensionFileObject): ExtensionFileModel {
    return {
      name: file.name,
      relativePath: file.relativePath,
      file: new Ref(file.file)
    };
  }

  /**
   * Transform an instance of extension file to model object
   * (before storing in the models)
   */
  toModelObject(): ExtensionFileModel {
    return {
      name: this.name,
      relativePath: this.relative,
      file: this.file.hash()
    };
  }

  toReadableString() {
    return {
      name: this.name,
      content: this.contents.toString()
    };
  }

  clone(): ExtensionFile {
    return new ExtensionFile(this);
  }
}
