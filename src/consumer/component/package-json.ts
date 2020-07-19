import fs from 'fs-extra';
import R from 'ramda';
import parents from 'parents';
import path from 'path';
import { PACKAGE_JSON } from '../../constants';
import { BitId } from '../../bit-id';
import componentIdToPackageName from '../../utils/bit/component-id-to-package-name';
import ConsumerComponent from '.';

function composePath(componentRootFolder: string) {
  return path.join(componentRootFolder, PACKAGE_JSON);
}

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
  workspaces?: string[];
  private?: boolean;
  componentId?: BitId;
};

export default class PackageJson {
  name?: string;
  version?: string;
  homepage?: string;
  main?: string;
  dependencies?: Record<string, any>;
  devDependencies?: Record<string, any>;
  peerDependencies?: Record<string, any>;
  componentRootFolder?: string; // path where to write the package.json
  license?: string;
  scripts?: Record<string, any>;
  workspaces?: string[];
  componentId?: BitId;

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
      workspaces,
      componentId,
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
    this.componentId = componentId;
  }

  static loadSync(componentRootFolder: string): PackageJson | null {
    const composedPath = composePath(componentRootFolder);
    if (!PackageJson.hasExisting(componentRootFolder)) return null;
    const componentJsonObject = fs.readJsonSync(composedPath);
    return new PackageJson(componentRootFolder, componentJsonObject);
  }

  static hasExisting(componentRootFolder: string): boolean {
    const packageJsonPath = composePath(componentRootFolder);
    return fs.pathExistsSync(packageJsonPath);
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
  static findPackage(dir, addPaths?) {
    const pathToConfig = this.findPath(dir);
    let configJSON: any = null;
    // eslint-disable-next-line import/no-dynamic-require, global-require
    if (pathToConfig !== null) configJSON = require(path.resolve(pathToConfig));
    if (configJSON && addPaths) {
      configJSON.paths = {
        // @ts-ignore
        relative: path.relative(dir, pathToConfig),
        absolute: pathToConfig,
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
   * adds workspaces with private flag if dosent exist.
   */
  static async addWorkspacesToPackageJson(
    rootDir: string,
    componentsDefaultDirectory: string,
    dependenciesDirectory: string,
    customImportPath: string | null | undefined
  ) {
    const pkg = (await PackageJson.getPackageJson(rootDir)) || {};
    const workSpaces = PackageJson.extractWorkspacesPackages(pkg) || [];
    workSpaces.push(dependenciesDirectory);
    workSpaces.push(componentsDefaultDirectory);
    if (customImportPath) workSpaces.push(customImportPath);
    if (!pkg.workspaces) pkg.workspaces = [];
    this.updateWorkspacesPackages(pkg, R.uniq(workSpaces));
    pkg.private = !!pkg.workspaces;
    await PackageJson.saveRawObject(rootDir, pkg);
  }

  /*
   * remove workspaces dir from workspace in package.json with changing other fields in package.json
   */
  static async removeComponentsFromWorkspaces(rootDir: string, pathsTOoRemove: string[]) {
    const pkg = (await PackageJson.getPackageJson(rootDir)) || {};
    const workspaces = this.extractWorkspacesPackages(pkg);
    if (!workspaces) return;
    const updatedWorkspaces = workspaces.filter((folder) => !pathsTOoRemove.includes(folder));
    this.updateWorkspacesPackages(pkg, updatedWorkspaces);
    await PackageJson.saveRawObject(rootDir, pkg);
  }

  /*
   * remove components from package.json dependencies
   */
  static async removeComponentsFromDependencies(rootDir: string, components: ConsumerComponent[]) {
    const pkg = await PackageJson.getPackageJson(rootDir);
    if (pkg && pkg.dependencies) {
      components.forEach((c) => {
        delete pkg.dependencies[componentIdToPackageName(c)];
      });
      await PackageJson.saveRawObject(rootDir, pkg);
    }
  }

  static extractWorkspacesPackages(packageJson: { [k: string]: any }): string[] | null {
    if (!packageJson.workspaces) return null;
    this.throwForInvalidWorkspacesConfig(packageJson);
    if (Array.isArray(packageJson.workspaces)) {
      return packageJson.workspaces;
    }
    if (Array.isArray(packageJson.workspaces.packages)) {
      return packageJson.workspaces.packages;
    }
    return null;
  }

  static updateWorkspacesPackages(packageJson, workspacesPackages): void {
    if (!packageJson.workspaces) return;
    this.throwForInvalidWorkspacesConfig(packageJson);
    if (Array.isArray(packageJson.workspaces)) {
      packageJson.workspaces = workspacesPackages;
    }
    if (Array.isArray(packageJson.workspaces.packages)) {
      packageJson.workspaces.packages = workspacesPackages;
    }
  }

  /**
   * according to Yarn Git repo, the workspaces type configured as the following
   * `workspaces?: Array<string> | WorkspacesConfig`
   * and `WorkspacesConfig` is:
   * `export type WorkspacesConfig = { packages?: Array<string>, nohoist?: Array<string> };`
   * see https://github.com/yarnpkg/yarn/blob/master/src/types.js
   */
  static throwForInvalidWorkspacesConfig(packageJson) {
    if (!packageJson.workspaces) return;
    if (
      typeof packageJson.workspaces !== 'object' ||
      (!Array.isArray(packageJson.workspaces) && !Array.isArray(packageJson.workspaces.packages))
    ) {
      throw new Error('workspaces property does not have the correct format, please refer to Yarn documentation');
    }
  }
}
