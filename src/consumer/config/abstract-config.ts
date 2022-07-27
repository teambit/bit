import fs from 'fs-extra';
import * as path from 'path';
import R from 'ramda';
import { BitIds } from '../../bit-id';
import { BIT_JSON, DEFAULT_BINDINGS_PREFIX, DEFAULT_EXTENSIONS, DEFAULT_LANGUAGE, PACKAGE_JSON } from '../../constants';
import logger from '../../logger/logger';
import { filterObject } from '../../utils';
import { PathLinux, PathOsBased, PathOsBasedAbsolute, PathOsBasedRelative } from '../../utils/path';
import PackageJsonFile from '../component/package-json-file';
import { AbstractVinyl } from '../component/sources';
import DataToPersist from '../component/sources/data-to-persist';
import JSONFile from '../component/sources/json-file';
import { ExtensionDataList } from './extension-data';

export type EnvFile = {
  [key: string]: PathLinux;
};

export type AbstractConfigProps = {
  dependencies?: Record<string, any>;
  devDependencies?: Record<string, any>;
  lang?: string;
  bindingPrefix?: string;
  extensions?: ExtensionDataList;
};

/**
 * There are two Bit Config: WorkspaceConfig and ComponentConfig, both inherit this class.
 * The config data can be written in package.json inside "bit" property. And, can be written in
 * bit.json file. Also, it might be written in both, in which case, if there is any conflict, the
 * bit.json wins.
 */
export default class AbstractConfig {
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  path: string;
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  dependencies: { [key: string]: string };
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  devDependencies: { [key: string]: string };
  lang: string;
  bindingPrefix: string;
  extensions: ExtensionDataList;
  writeToPackageJson = false;
  writeToBitJson = false;

  constructor(props: AbstractConfigProps) {
    this.lang = props.lang || DEFAULT_LANGUAGE;
    this.bindingPrefix = props.bindingPrefix || DEFAULT_BINDINGS_PREFIX;
    this.extensions = props.extensions || new ExtensionDataList();
  }

  getDependencies(): BitIds {
    return BitIds.fromObject(this.dependencies);
  }

  toPlainObject(): Record<string, any> {
    const isPropDefaultOrNull = (val, key) => {
      if (!val) return false;
      if (key === 'lang') return val !== DEFAULT_LANGUAGE;
      if (key === 'bindingPrefix') return val !== DEFAULT_BINDINGS_PREFIX;
      if (key === 'extensions') return !R.equals(val, DEFAULT_EXTENSIONS);
      return true;
    };

    return filterObject(
      {
        lang: this.lang,
        bindingPrefix: this.bindingPrefix,
        dependencies: this.dependencies,
        extensions: this.extensions?.toConfigObject(),
      },
      isPropDefaultOrNull
    );
  }

  async write({
    workspaceDir,
    componentDir,
  }: {
    workspaceDir: PathOsBasedAbsolute;
    componentDir?: PathOsBasedRelative;
  }): Promise<string[]> {
    const jsonFiles = await this.prepareToWrite({ workspaceDir, componentDir });
    const dataToPersist = new DataToPersist();
    dataToPersist.addManyFiles(jsonFiles);
    dataToPersist.addBasePath(workspaceDir);
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return dataToPersist.persistAllToFS();
  }

  async prepareToWrite({
    workspaceDir,
    componentDir = '.',
  }: {
    workspaceDir: PathOsBasedAbsolute;
    componentDir?: PathOsBasedRelative;
  }): Promise<AbstractVinyl[]> {
    const files = await this.toVinyl({ workspaceDir, componentDir });
    return files;
  }

  async toVinyl({
    workspaceDir,
    componentDir = '.',
  }: {
    workspaceDir: PathOsBasedAbsolute;
    componentDir?: PathOsBasedRelative;
  }): Promise<AbstractVinyl[]> {
    const plainObject = this.toPlainObject();
    const jsonFiles: AbstractVinyl[] = [];
    if (this.writeToPackageJson) {
      const packageJsonFile: PackageJsonFile = await PackageJsonFile.load(workspaceDir, componentDir);
      packageJsonFile.addOrUpdateProperty('bit', plainObject);
      jsonFiles.push(packageJsonFile.toVinylFile());
    }
    if (this.writeToBitJson) {
      const bitJsonPath = AbstractConfig.composeBitJsonPath(componentDir);
      const params = { base: componentDir, override: true, path: bitJsonPath, content: plainObject };
      const bitJsonFile = JSONFile.load(params);
      jsonFiles.push(bitJsonFile);
    }
    return jsonFiles;
  }

  static composeBitJsonPath(bitPath: PathOsBased): PathOsBased {
    return path.join(bitPath, BIT_JSON);
  }
  static composePackageJsonPath(bitPath: PathOsBased): PathOsBased {
    return path.join(bitPath, PACKAGE_JSON);
  }

  static async pathHasBitJson(bitPath: string): Promise<boolean> {
    return fs.pathExists(this.composeBitJsonPath(bitPath));
  }
  static async pathHasPackageJson(bitPath: string): Promise<boolean> {
    return fs.pathExists(this.composePackageJsonPath(bitPath));
  }

  static async loadJsonFileIfExist(jsonFilePath: string): Promise<Record<string, any> | null | undefined> {
    try {
      const file = await fs.readJson(jsonFilePath);
      return file;
    } catch (e: any) {
      if (e.code === 'ENOENT') return null;
      throw e;
    }
  }

  static async removeIfExist(bitPath: string): Promise<boolean> {
    const dirToRemove = this.composeBitJsonPath(bitPath);
    const exists = await fs.pathExists(dirToRemove);
    if (exists) {
      logger.info(`abstract-config, deleting ${dirToRemove}`);
      await fs.remove(dirToRemove);
      return true;
    }
    return false;
  }
}
