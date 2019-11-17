import * as path from 'path';
import R from 'ramda';
import * as RA from 'ramda-adjunct';
import fs from 'fs-extra';
import set from 'lodash.set';
import { BitIds, BitId } from '../../bit-id';
import { filterObject } from '../../utils';
import { ExtensionOptions } from '../../extensions/extension';
import { EnvExtensionOptions, EnvType } from '../../extensions/env-extension-types';
import { PathOsBased, PathLinux, PathOsBasedAbsolute, PathOsBasedRelative } from '../../utils/path';
import {
  BIT_JSON,
  NO_PLUGIN_TYPE,
  COMPILER_ENV_TYPE,
  DEFAULT_LANGUAGE,
  DEFAULT_BINDINGS_PREFIX,
  DEFAULT_EXTENSIONS,
  PACKAGE_JSON,
  EXTENSION_BIT_CONFIG_PREFIX
} from '../../constants';
import logger from '../../logger/logger';
import JSONFile from '../component/sources/json-file';
import PackageJsonFile from '../component/package-json-file';
import DataToPersist from '../component/sources/data-to-persist';

export type RawExtensionObject = any;

export type RegularExtensionObject = {
  rawConfig: Record<string, any>;
  options: ExtensionOptions;
};

export type EnvFile = {
  [key: string]: PathLinux;
};

export type EnvExtensionObject = {
  rawConfig: Record<string, any>;
  options: EnvExtensionOptions;
  files: string[];
};

export type TesterExtensionObject = EnvExtensionObject;

export type CompilerExtensionObject = EnvExtensionObject;

export type Extensions = { [extensionName: string]: RegularExtensionObject };
export type RawExtensions = { [extensionName: string]: RawExtensionObject };
export type Envs = { [envName: string]: EnvExtensionObject };
export type Compilers = { [compilerName: string]: CompilerExtensionObject };
export type Testers = { [testerName: string]: TesterExtensionObject };

export type AbstractConfigProps = {
  compiler?: string | Compilers;
  tester?: string | Testers;
  dependencies?: Record<string, any>;
  devDependencies?: Record<string, any>;
  compilerDependencies?: Record<string, any>;
  testerDependencies?: Record<string, any>;
  lang?: string;
  bindingPrefix?: string;
  extensions?: RawExtensions;
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
  _compiler: Compilers | string;
  _tester: Testers | string;
  rawExtensions: RawExtensions;
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  dependencies: { [key: string]: string };
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  devDependencies: { [key: string]: string };
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  compilerDependencies: { [key: string]: string };
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  testerDependencies: { [key: string]: string };
  lang: string;
  bindingPrefix: string;
  writeToPackageJson = false;
  writeToBitJson = false;

  constructor(props: AbstractConfigProps) {
    this._compiler = props.compiler || {};
    this._tester = props.tester || {};
    this.lang = props.lang || DEFAULT_LANGUAGE;
    this.bindingPrefix = props.bindingPrefix || DEFAULT_BINDINGS_PREFIX;
    this.rawExtensions = props.extensions
      ? AbstractConfig.transformAllExtensionsToRawExtensions(props.extensions)
      : DEFAULT_EXTENSIONS;
  }

  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  get compiler(): Compilers | undefined {
    const compilerObj = AbstractConfig.transformEnvToObject(this._compiler);
    if (R.isEmpty(compilerObj)) return undefined;
    return compilerObj;
  }

  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  set compiler(compiler: string | Compilers) {
    this._compiler = AbstractConfig.transformEnvToObject(compiler);
  }

  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  get tester(): Testers | undefined {
    const testerObj = AbstractConfig.transformEnvToObject(this._tester);
    if (R.isEmpty(testerObj)) return undefined;
    return testerObj;
  }

  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  set tester(tester: string | Testers) {
    this._tester = AbstractConfig.transformEnvToObject(tester);
  }

  get extensions(): Extensions {
    if (!this.rawExtensions) {
      return {};
    }
    return AbstractConfig.transformAllRawExtensionsToExtensions(this.rawExtensions);
  }

  addDependencies(bitIds: BitId[]): this {
    const idObjects = R.mergeAll(bitIds.map(bitId => bitId.toObject()));
    this.dependencies = R.merge(this.dependencies, idObjects);
    return this;
  }

  addDependency(bitId: BitId): this {
    this.dependencies = R.merge(this.dependencies, bitId.toObject());
    return this;
  }

  hasCompiler(): boolean {
    return !!this.compiler && this._compiler !== NO_PLUGIN_TYPE && !R.isEmpty(this.compiler);
  }

  hasTester(): boolean {
    return !!this.tester && this._tester !== NO_PLUGIN_TYPE && !R.isEmpty(this.tester);
  }

  getEnvsByType(type: EnvType): Compilers | null | undefined | Testers {
    if (type === COMPILER_ENV_TYPE) {
      return this.compiler;
    }
    return this.tester;
  }

  /**
   * if there is only one env (compiler/tester) and it doesn't have any special configuration, only
   * the name, convert it to a string.
   */
  static convertEnvToStringIfPossible(envObj?: Envs): string | undefined | Envs {
    if (!envObj) return undefined;
    if (Object.keys(envObj).length !== 1) return envObj; // it has more than one id
    const envId = Object.keys(envObj)[0];
    if (
      RA.isNilOrEmpty(envObj[envId].rawConfig) &&
      RA.isNilOrEmpty(envObj[envId].options) &&
      RA.isNilOrEmpty(envObj[envId].files)
    ) {
      return envId;
    }
    return envObj;
  }

  getDependencies(): BitIds {
    return BitIds.fromObject(this.dependencies);
  }

  toPlainObject(): Record<string, any> {
    const isPropDefaultOrNull = (val, key) => {
      if (!val) return false;
      if (key === 'lang') return val !== DEFAULT_LANGUAGE;
      if (key === 'bindingPrefix') return val !== DEFAULT_BINDINGS_PREFIX;
      if (key === 'extensions')
        return !R.equals(AbstractConfig.transformAllExtensionsToRawExtensions(val), DEFAULT_EXTENSIONS);
      return true;
    };

    return filterObject(
      {
        lang: this.lang,
        bindingPrefix: this.bindingPrefix,
        env: {
          compiler: AbstractConfig.convertEnvToStringIfPossible(this.compiler),
          tester: AbstractConfig.convertEnvToStringIfPossible(this.tester)
        },
        dependencies: this.dependencies,
        extensions: AbstractConfig.transformAllExtensionsToRawExtensions(this.rawExtensions)
      },
      isPropDefaultOrNull
    );
  }

  async write({
    workspaceDir,
    componentDir
  }: {
    workspaceDir: PathOsBasedAbsolute;
    componentDir?: PathOsBasedRelative;
  }): Promise<void> {
    const jsonFiles = await this.prepareToWrite({ workspaceDir, componentDir });
    const dataToPersist = new DataToPersist();
    dataToPersist.addManyFiles(jsonFiles);
    dataToPersist.addBasePath(workspaceDir);
    return dataToPersist.persistAllToFS();
  }

  async prepareToWrite({
    workspaceDir,
    componentDir = '.'
  }: {
    workspaceDir: PathOsBasedAbsolute;
    componentDir?: PathOsBasedRelative;
  }): Promise<JSONFile[]> {
    const plainObject = this.toPlainObject();
    const JsonFiles: Array<JSONFile> = [];
    if (this.writeToPackageJson) {
      const packageJsonFile: PackageJsonFile = await PackageJsonFile.load(workspaceDir, componentDir);
      packageJsonFile.addOrUpdateProperty('bit', plainObject);
      JsonFiles.push(packageJsonFile.toVinylFile());
    }
    if (this.writeToBitJson) {
      const bitJsonPath = AbstractConfig.composeBitJsonPath(componentDir);
      const params = { base: componentDir, override: true, path: bitJsonPath, content: plainObject };
      JsonFiles.push(JSONFile.load(params));
    }
    return JsonFiles;
  }

  static composeBitJsonPath(bitPath: PathOsBased): PathOsBased {
    return path.join(bitPath, BIT_JSON);
  }
  static composePackageJsonPath(bitPath: PathOsBased): PathOsBased {
    return path.join(bitPath, PACKAGE_JSON);
  }

  static async pathHasBitJson(bitPath: string): Promise<boolean> {
    return fs.exists(this.composeBitJsonPath(bitPath));
  }
  static async pathHasPackageJson(bitPath: string): Promise<boolean> {
    return fs.exists(this.composePackageJsonPath(bitPath));
  }

  static async loadJsonFileIfExist(jsonFilePath: string): Promise<Record<string, any> | null | undefined> {
    try {
      const file = await fs.readJson(jsonFilePath);
      return file;
    } catch (e) {
      if (e.code === 'ENOENT') return null;
      throw e;
    }
  }

  static async removeIfExist(bitPath: string): Promise<boolean> {
    const dirToRemove = this.composeBitJsonPath(bitPath);
    if (fs.exists(dirToRemove)) {
      logger.info(`abstract-config, deleting ${dirToRemove}`);
      return fs.remove(dirToRemove);
    }
    return false;
  }

  static transformEnvToObject(env: string | Record<string, any>): Envs {
    if (typeof env === 'string') {
      if (env === NO_PLUGIN_TYPE) return {};
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      return {
        [env]: {}
      };
    }
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return AbstractConfig.transformAllRawExtensionsToExtensions(env);
  }

  static transformExtensionToRawExtension(extension: RegularExtensionObject | RawExtensionObject): RawExtensionObject {
    const rawExtension = {};
    // Support case when got a raw extension instead of extension
    if (!extension.options && !extension.rawConfig && !extension.files) {
      return extension;
    }
    if (extension.options) {
      R.forEachObjIndexed((value, key) => {
        rawExtension[`${EXTENSION_BIT_CONFIG_PREFIX}${key}`] = value;
      }, extension.options);
    }
    if (extension.files) {
      rawExtension[`${EXTENSION_BIT_CONFIG_PREFIX}files`] = extension.files;
    }
    if (extension.rawConfig) {
      R.forEachObjIndexed((value, key) => {
        rawExtension[key] = value;
      }, extension.rawConfig);
    }
    return rawExtension;
  }

  static transformRawExtensionToExtension(
    rawExtension: RawExtensionObject | RegularExtensionObject
  ): RegularExtensionObject {
    const extension: RegularExtensionObject = {
      options: {},
      rawConfig: {}
    };
    // Backward compatibility support
    // Support extensions which defined as extension rather than raw extensions (nested object rather than flat)
    // Also support using the options.file instead of pathToLoadFrom
    if (rawExtension.options || rawExtension.rawConfig) {
      if (rawExtension.options && rawExtension.options.file) {
        rawExtension.options.pathToLoadFrom = rawExtension.options.file;
      }
      return rawExtension;
    }
    R.forEachObjIndexed((value, key) => {
      if (R.startsWith(EXTENSION_BIT_CONFIG_PREFIX, key)) {
        const optionKey = key.replace(EXTENSION_BIT_CONFIG_PREFIX, '');
        if (optionKey === 'files') {
          extension.files = value;
        } else {
          set(extension, ['options', optionKey], value);
        }
      } else {
        set(extension, ['rawConfig', key], value);
      }
    }, rawExtension);
    return extension;
  }

  static transformAllRawExtensionsToExtensions(rawExtensions: RawExtensions): Extensions {
    let extensions;
    if (rawExtensions) {
      extensions = {};
      R.forEachObjIndexed((value, key) => {
        extensions[key] = AbstractConfig.transformRawExtensionToExtension(value);
      }, rawExtensions);
    }
    return extensions;
  }

  static transformAllExtensionsToRawExtensions(extensions: RawExtensions): RawExtensions {
    let rawExtensions;
    if (extensions) {
      rawExtensions = {};
      R.forEachObjIndexed((value, key) => {
        rawExtensions[key] = AbstractConfig.transformExtensionToRawExtension(value);
      }, extensions);
    }
    return rawExtensions;
  }
}
