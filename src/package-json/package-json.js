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
function convertComponentsIdToValidPackageName(registryPrefix: string, id: string): Object {
  return `${registryPrefix}/${id.replace(/\//g, '.')}`;
}
function convertComponentsToValidPackageNames(registryPrefix: string, bitDependencies: Object): Object {
  const obj = {};
  if (R.isEmpty(bitDependencies) || R.isNil(bitDependencies)) return obj;
  Object.keys(bitDependencies).forEach((key) => {
    const name = convertComponentsIdToValidPackageName(registryPrefix, key);
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
  name?: string,
  version?: string,
  homepage?: string,
  main?: string,
  dependencies?: Object,
  devDependencies?: Object,
  peerDependencies?: Object,
  license?: string,
  scripts?: Object,
  workspaces: string[],
  private?: boolean
};

export default class PackageJson {
  name: string;
  version: string;
  homepage: string;
  main: string;
  dependencies: Object;
  devDependencies: Object;
  peerDependencies: Object;
  componentRootFolder: string; // path where to write the package.json
  license: string;
  scripts: Object;
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

  toPlainObject(): Object {
    const self = this;
    const result = {};
    const addToResult = (propName) => {
      result[propName] = self[propName];
    };

    R.forEach(addToResult, PackageJsonPropsNames);
    if (this.workspaces) result.private = true;
    return result;
  }

  toJson(readable: boolean = true) {
    if (!readable) return JSON.stringify(this.toPlainObject());
    return JSON.stringify(this.toPlainObject(), null, 4);
  }

  addDependencies(bitDependencies: Object, registryPrefix: string) {
    this.dependencies = Object.assign(
      {},
      this.dependencies,
      convertComponentsToValidPackageNames(registryPrefix, bitDependencies)
    );
  }

  addDevDependencies(bitDevDependencies: Object, registryPrefix: string) {
    this.devDependencies = Object.assign(
      {},
      this.devDependencies,
      convertComponentsToValidPackageNames(registryPrefix, bitDevDependencies)
    );
  }

  static hasExisting(componentRootFolder: string, throws?: boolean = false): boolean {
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
    return new PackageJson(componentRootFolder, {});
  }

  static ensure(componentRootFolder): Promise<PackageJson> {
    return this.load(componentRootFolder);
  }

  static fromPlainObject(componentRootFolder: string, object: Object) {
    return new PackageJson(componentRootFolder, object);
  }

  static async load(componentRootFolder: string, throwError: boolean = true): Promise<PackageJson> {
    const composedPath = composePath(componentRootFolder);
    if (!PackageJson.hasExisting(componentRootFolder, throwError)) return null;
    const componentJsonObject = await fs.readJson(composedPath);
    return new PackageJson(componentRootFolder, componentJsonObject);
  }

  static loadSync(componentRootFolder: string, throwError: boolean = true): PackageJson {
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
    for (i = 0; i < parentsArr.length; i++) {
      const config = `${parentsArr[i]}/package.json`;
      try {
        if (fs.lstatSync(config).isFile()) {
          return config;
        }
      } catch (e) {}
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
    if (pathToConfig !== null) configJSON = require(pathToConfig);
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
  static getPackageJson(path: string) {
    const getRawObject = () => fs.readJson(composePath(path));
    const exist = PackageJson.hasExisting(path);
    if (exist) return getRawObject();
  }

  /*
   * save package.json in path
   */
  static saveRawObject(path: string, obj: Object) {
    return fs.outputJSON(composePath(path), obj, { spaces: 2 });
  }

  /*
   * For an existing package.json file of the root project, we don't want to do any change, other than what needed.
   * That's why this method doesn't use the 'load' and 'write' methods of this class. Otherwise, it'd write only the
   * PackageJsonPropsNames attributes.
   * Also, in case there is no package.json file in this project, it generates a new one with only the 'dependencies'
   * attribute. Nothing more, nothing less.
   */
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
    customImportPath: ?string
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
      componentIds.forEach((id) => {
        delete pkg.dependencies[convertComponentsIdToValidPackageName(registryPrefix, id)];
      });
      await PackageJson.saveRawObject(rootDir, pkg);
    }
  }
}
