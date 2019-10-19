/** @flow */
import fs from 'fs-extra';
import R from 'ramda';
import parents from 'parents';
import path from 'path';
import { PackageJsonAlreadyExists, PackageJsonNotFound } from '../exceptions';
import { PACKAGE_JSON } from '../constants';

function composePath(componentRootFolder: string) {
  return path.join(componentRootFolder, PACKAGE_JSON);
}
function convertComponentsIdToValidPackageName(registryPrefix: string, id: string): string {
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  return `${registryPrefix}/${id.replace(/\//g, '.')}`;
}
function convertComponentsToValidPackageNames(
  registryPrefix: string,
  bitDependencies: Record<string, any>
): Record<string, any> {
  const obj = {};
  if (R.isEmpty(bitDependencies) || R.isNil(bitDependencies)) return obj;
  Object.keys(bitDependencies).forEach(key => {
    const name = convertComponentsIdToValidPackageName(registryPrefix, key);
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    obj[name] = bitDependencies[key];
  });
  return obj;
}

const PackageJsonPropsNames = [
  'name',
  'version',
  'homepage',
  'main',
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'license',
  'scripts',
  'workspaces',
  'private'
];

export type PackageJsonProps = {
  name?: string;
  version?: string;
  homepage?: string;
  main?: string;
  dependencies?: Record<string, any>;
  devDependencies?: Record<string, any>;
  peerDependencies?: Record<string, any>;
  license?: string;
  scripts?: Record<string, any>;
  workspaces: string[];
  private?: boolean;
};

export default class PackageJson {
  name: string;
  version: string;
  homepage: string;
  main: string;
  dependencies: Record<string, any>;
  devDependencies: Record<string, any>;
  peerDependencies: Record<string, any>;
  componentRootFolder: string; // path where to write the package.json
  license: string;
  scripts: Record<string, any>;
  workspaces: string[];

  constructor(
    componentRootFolder: string,
    {
      name,
      version,
      homepage,
      main,
      dependencies,
      devDependencies,
      peerDependencies,
      license,
      scripts,
      workspaces
    }: PackageJsonProps
  ) {
    this.name = name;
    this.version = version;
    this.homepage = homepage;
    this.main = main;
    this.dependencies = dependencies;
    this.devDependencies = devDependencies;
    this.peerDependencies = peerDependencies;
    this.componentRootFolder = componentRootFolder;
    this.license = license;
    this.scripts = scripts;
    this.workspaces = workspaces;
  }

  toPlainObject(): Record<string, any> {
    const result = {};
    const addToResult = propName => {
      result[propName] = this[propName];
    };

    R.forEach(addToResult, PackageJsonPropsNames);
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    if (this.workspaces) result.private = true;
    return result;
  }

  toJson(readable = true) {
    if (!readable) return JSON.stringify(this.toPlainObject());
    return JSON.stringify(this.toPlainObject(), null, 4);
  }

  addDependencies(bitDependencies: Record<string, any>, registryPrefix: string) {
    this.dependencies = Object.assign(
      {},
      this.dependencies,
      convertComponentsToValidPackageNames(registryPrefix, bitDependencies)
    );
  }

  addDevDependencies(bitDevDependencies: Record<string, any>, registryPrefix: string) {
    this.devDependencies = Object.assign(
      {},
      this.devDependencies,
      convertComponentsToValidPackageNames(registryPrefix, bitDevDependencies)
    );
  }

  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  static hasExisting(componentRootFolder: string, throws? = false): boolean {
    const packageJsonPath = composePath(componentRootFolder);
    const exists = fs.pathExistsSync(packageJsonPath);
    if (!exists && throws) {
      throw new PackageJsonNotFound(packageJsonPath);
    }
    return exists;
  }

  async write({ override = true }: { override?: boolean }): Promise<boolean> {
    if (!override && PackageJson.hasExisting(this.componentRootFolder)) {
      return Promise.reject(new PackageJsonAlreadyExists(this.componentRootFolder));
    }
    const plain = this.toPlainObject();
    return fs.outputJSON(composePath(this.componentRootFolder), plain, { spaces: 2 });
  }

  static create(componentRootFolder: string): PackageJson {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return new PackageJson(componentRootFolder, {});
  }

  static ensure(componentRootFolder): Promise<PackageJson> {
    return this.load(componentRootFolder);
  }

  static fromPlainObject(componentRootFolder: string, object: Record<string, any>) {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return new PackageJson(componentRootFolder, object);
  }

  static async load(componentRootFolder: string, throwError = true): Promise<PackageJson> {
    const composedPath = composePath(componentRootFolder);
    if (!PackageJson.hasExisting(componentRootFolder, throwError)) return null;
    const componentJsonObject = await fs.readJson(composedPath);
    return new PackageJson(componentRootFolder, componentJsonObject);
  }

  static loadSync(componentRootFolder: string, throwError = true): PackageJson {
    const composedPath = composePath(componentRootFolder);
    if (!PackageJson.hasExisting(componentRootFolder, throwError)) return null;
    const componentJsonObject = fs.readJsonSync(composedPath);
    return new PackageJson(componentRootFolder, componentJsonObject);
  }

  /**
   * Taken from this package (with some minor changes):
   * https://www.npmjs.com/package/find-package
   * https://github.com/jalba/find-package
   */
  static findPath(dir) {
    const parentsArr = parents(dir);
    let i;
    // eslint-disable-next-line
    for (i = 0; i < parentsArr.length; i++) {
      const config = `${parentsArr[i]}/package.json`;
      try {
        if (fs.lstatSync(config).isFile()) {
          return config;
        }
      } catch (e) {} // eslint-disable-line
    }
    return null;
  }

  /**
   * Taken from this package (with some minor changes):
   * https://www.npmjs.com/package/find-package
   * https://github.com/jalba/find-package
   *
   */
  static findPackage(dir, addPaths) {
    const pathToConfig = this.findPath(dir);
    let configJSON = null;
    // eslint-disable-next-line import/no-dynamic-require, global-require
    if (pathToConfig !== null) configJSON = require(path.resolve(pathToConfig));
    if (configJSON && addPaths) {
      configJSON.paths = {
        relative: path.relative(dir, pathToConfig),
        absolute: pathToConfig
      };
    } else if (configJSON !== null) {
      delete configJSON.paths;
    }

    return configJSON;
  }

  /*
   * load package.json from path
   */
  static async getPackageJson(pathStr: string) {
    const getRawObject = () => fs.readJson(composePath(pathStr));
    const exist = PackageJson.hasExisting(pathStr);
    if (exist) return getRawObject();
    return null;
  }

  /*
   * save package.json in path
   */
  static saveRawObject(pathStr: string, obj: Record<string, any>) {
    return fs.outputJSON(composePath(pathStr), obj, { spaces: 2 });
  }

  /*
   * For an existing package.json file of the root project, we don't want to do any change, other than what needed.
   * That's why this method doesn't use the 'load' and 'write' methods of this class. Otherwise, it'd write only the
   * PackageJsonPropsNames attributes.
   * Also, in case there is no package.json file in this project, it generates a new one with only the 'dependencies'
   * attribute. Nothing more, nothing less.
   */
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  static async addComponentsIntoExistingPackageJson(rootDir: string, components: Array, registryPrefix: string) {
    const packageJson = (await PackageJson.getPackageJson(rootDir)) || { dependencies: {} };
    packageJson.dependencies = Object.assign(
      {},
      packageJson.dependencies,
      convertComponentsToValidPackageNames(registryPrefix, components)
    );
    await PackageJson.saveRawObject(rootDir, packageJson);
  }
  /*
   * For an existing package.json file of the root project, we don't want to do any change, other than what needed.
   * That's why this method doesn't use the 'load' and 'write' methods of this class. Otherwise, it'd write only the
   * PackageJsonPropsNames attributes.
   * Also, in case there is no package.json file in this project, it generates a new one with only the 'dependencies'
   * adds workspaces with private flag if dosent exist.
   */
  static async addWorkspacesToPackageJson(
    rootDir: string,
    componentsDefaultDirectory: string,
    dependenciesDirectory: string,
    customImportPath: string | null | undefined
  ) {
    const pkg = (await PackageJson.getPackageJson(rootDir)) || {};
    const workSpaces = pkg.workspaces || [];
    workSpaces.push(dependenciesDirectory);
    workSpaces.push(componentsDefaultDirectory);
    if (customImportPath) workSpaces.push(customImportPath);
    pkg.workspaces = R.uniq(workSpaces);
    pkg.private = !!pkg.workspaces;
    await PackageJson.saveRawObject(rootDir, pkg);
  }

  /*
   * remove workspaces dir from workspace in package.json with changing other fields in package.json
   */
  static async removeComponentsFromWorkspaces(rootDir: string, pathsTOoRemove: string[]) {
    const pkg = (await PackageJson.getPackageJson(rootDir)) || {};
    const workSpaces = pkg.workspaces || [];
    pkg.workspaces = workSpaces.filter(folder => !pathsTOoRemove.includes(folder));
    await PackageJson.saveRawObject(rootDir, pkg);
  }

  /*
   * remove components from package.json dependencies
   */
  static async removeComponentsFromDependencies(rootDir: string, registryPrefix, componentIds: string[]) {
    const pkg = await PackageJson.getPackageJson(rootDir);
    if (pkg && pkg.dependencies) {
      componentIds.forEach(id => {
        delete pkg.dependencies[convertComponentsIdToValidPackageName(registryPrefix, id)];
      });
      await PackageJson.saveRawObject(rootDir, pkg);
    }
  }
}
