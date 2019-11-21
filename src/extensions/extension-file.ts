import * as path from 'path';
import R from 'ramda';
import vinylFile from 'vinyl-file';
import { AbstractVinyl } from '../consumer/component/sources';
import ExtensionFileNotFound from './exceptions/extension-file-not-found';
import logger from '../logger/logger';
import { PathOsBased, PathLinux } from '../utils/path';
import { Repository, Ref } from '../scope/objects';
import Source from '../scope/models/source';
import { EnvType } from './env-extension-types';
import { pathNormalizeToLinux } from '../utils/path';

export type ExtensionFileModel = {
  name: string;
  relativePath: PathLinux;
  file: Ref;
};

export type ExtensionFileSerializedModel = {
  name: string;
  relativePath: PathLinux;
  file: {
    contents: Buffer;
  };
};

export type ExtensionFileObject = {
  name: string;
  relativePath: PathLinux;
  file: string;
};

export default class ExtensionFile extends AbstractVinyl {
  static async load(
    name: string,
    filePath: PathOsBased,
    consumerPath: PathOsBased,
    base: PathOsBased = consumerPath,
    extendedProps?: Record<string, any>
  ): Promise<ExtensionFile> {
    try {
      const baseFile = await vinylFile.read(filePath, { base, cwd: consumerPath });
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      const file = new ExtensionFile(baseFile);
      file.name = name;
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
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
    bitJsonDirPath: PathOsBased,
    envType?: EnvType
  ): Promise<ExtensionFile[]> {
    if (!bitJsonObj || R.isEmpty(bitJsonObj)) return [];
    const loadP: Promise<ExtensionFile>[] = [];

    // for non-envs extension, the base is the consumer root.
    // for envs, bit.json may have "{ENV_TYPE}" in its "ejectedEnvsDirectory" configuration, when
    // this happens, the base dir includes the env-type. e.g. base-dir/compiler or base/dir-tester
    // @todo 1: make sure relativePath is PathLinux
    // @todo 2: pass the 'ejectedEnvsDirectory' and work according to its value. the implementation
    // below won't work well if a user decided to name the compiler folder as 'compiler' without
    // using {ENV_TYPE} notation.
    const getBase = (relativePath: PathLinux): PathOsBased => {
      if (!envType) return consumerPath;
      const pathSplit = relativePath.split('/');
      const envRelativePath = pathSplit[0] === '.' ? R.tail(pathSplit) : pathSplit;
      const potentialEnvTypePlaceholder = R.head(envRelativePath);
      if (potentialEnvTypePlaceholder === envType && envRelativePath.length > 1) {
        return path.join(bitJsonDirPath, envType);
      }
      return bitJsonDirPath;
    };

    const loadFile = (value, key) => {
      // TODO: Gilad - support component bit json
      const fullPath = path.resolve(bitJsonDirPath, value);
      const base = getBase(value);
      loadP.push(this.load(key, fullPath, bitJsonDirPath, base));
    };
    R.forEachObjIndexed(loadFile, bitJsonObj);
    return Promise.all(loadP);
  }

  static loadFromParsedString(parsedString: Record<string, any>): ExtensionFile | null | undefined {
    if (!parsedString) return null;
    const opts = super.loadFromParsedString(parsedString);
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    const extensionFile = new ExtensionFile(opts);
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    extensionFile.file = Source.from(extensionFile.contents);
    return extensionFile;
  }

  static loadFromParsedStringArray(arr: Record<string, any>[]): Array<null | undefined | ExtensionFile> {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    if (!arr) return null;
    return arr.map(this.loadFromParsedString);
  }

  static async loadFromExtensionFileModel(file: ExtensionFileModel, repository: Repository): Promise<ExtensionFile> {
    const content = await file.file.load(repository);
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    const extensionFile = new ExtensionFile({ base: '.', path: file.relativePath, contents: content.contents });
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    extensionFile.file = Source.from(extensionFile.contents);
    extensionFile.name = file.name;
    extensionFile.relativePath = file.relativePath;
    extensionFile.fromModel = true;
    return extensionFile;
  }

  /**
   * Used when running bit show against remote scope
   * @param {*} file
   * @param {*} repository
   */
  static async loadFromExtensionFileSerializedModel(file: ExtensionFileSerializedModel): Promise<ExtensionFile> {
    const contents = Buffer.from(file.file.contents);
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    const extensionFile = new ExtensionFile({ base: '.', path: file.relativePath || '', contents });
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    extensionFile.file = Source.from(extensionFile.contents);
    extensionFile.name = file.name;
    extensionFile.relativePath = file.relativePath;
    extensionFile.fromModel = true;
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
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      name: this.name,
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      relativePath: pathNormalizeToLinux(this.relative),
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      file: this.file.hash()
    };
  }

  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  toReadableString() {
    return {
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      name: this.name,
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      content: this.contents.toString()
    };
  }

  // @ts-ignore
  clone(): ExtensionFile {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return new ExtensionFile(this);
  }
}
