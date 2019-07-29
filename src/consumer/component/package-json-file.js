// @flow
import fs from 'fs-extra';
import path from 'path';
import R from 'ramda';
import detectIndent from 'detect-indent';
import detectNewline from 'detect-newline';
import stringifyPackage from 'stringify-package';
import type { PathOsBased, PathOsBasedRelative, PathOsBasedAbsolute, PathRelative } from '../../utils/path';
import { PACKAGE_JSON } from '../../constants';
import logger from '../../logger/logger';
import Component from './consumer-component';
import componentIdToPackageName from '../../utils/bit/component-id-to-package-name';
import PackageJsonVinyl from './package-json-vinyl';

/**
 * when a package.json file is loaded, we save the indentation and the type of newline it uses, so
 * then we could preserve it later on while writing the file. this is same process used by NPM when
 * writing the package.json file
 */
export default class PackageJsonFile {
  packageJsonObject: Object;
  fileExist: boolean;
  filePath: PathOsBasedRelative;
  workspaceDir: ?PathOsBasedAbsolute;
  indent: ?string; // default when writing (in stringifyPackage) is "  ". (two spaces).
  newline: ?string; // whether "\n" or "\r\n", default when writing (in stringifyPackage) is "\n"
  constructor(
    filePath: PathOsBasedRelative,
    packageJsonObject: Object,
    fileExist: boolean,
    workspaceDir?: PathOsBasedAbsolute,
    indent?: string,
    newline?: string
  ) {
    this.filePath = filePath;
    this.packageJsonObject = packageJsonObject;
    this.fileExist = fileExist;
    this.workspaceDir = workspaceDir;
    this.indent = indent;
    this.newline = newline;
  }

  async write() {
    if (!this.workspaceDir) throw new Error('PackageJsonFile is unable to write, workspaceDir is not defined');
    const pathToWrite = path.join(this.workspaceDir, this.filePath);
    logger.debug(`package-json-file.write, path ${pathToWrite}`);
    const packageJsonStr = stringifyPackage(this.packageJsonObject, this.indent, this.newline);
    await fs.outputFile(pathToWrite, packageJsonStr);
    this.fileExist = true;
  }

  /**
   * load from the given dir, if not exist, don't throw an error, just set packageJsonObject as an
   * empty object
   */
  static async load(workspaceDir: PathOsBasedAbsolute, componentDir?: PathRelative = '.'): Promise<PackageJsonFile> {
    const filePath = composePath(componentDir);
    const filePathAbsolute = path.join(workspaceDir, filePath);
    const packageJsonStr = await PackageJsonFile.getPackageJsonStrIfExist(filePathAbsolute);
    if (!packageJsonStr) {
      return new PackageJsonFile(filePath, {}, false, workspaceDir);
    }
    const packageJsonObject = PackageJsonFile.parsePackageJsonStr(packageJsonStr, componentDir);
    const indent = detectIndent(packageJsonStr).indent;
    const newline = detectNewline(packageJsonStr);
    return new PackageJsonFile(filePath, packageJsonObject, true, workspaceDir, indent, newline);
  }

  static createFromComponent(
    componentDir: PathRelative,
    component: Component,
    excludeRegistryPrefix?: boolean = false
  ): PackageJsonFile {
    const filePath = composePath(componentDir);
    const name = excludeRegistryPrefix
      ? componentIdToPackageName(component.id, component.bindingPrefix, false)
      : componentIdToPackageName(component.id, component.bindingPrefix);
    const packageJsonObject = {
      name,
      version: component.version,
      homepage: component._getHomepage(),
      main: component.mainFile,
      dependencies: component.packageDependencies,
      devDependencies: {
        ...component.devPackageDependencies,
        ...component.compilerPackageDependencies,
        ...component.testerPackageDependencies
      },
      peerDependencies: component.peerPackageDependencies,
      license: `SEE LICENSE IN ${!R.isEmpty(component.license) ? 'LICENSE' : 'UNLICENSED'}`
    };
    return new PackageJsonFile(filePath, packageJsonObject, false);
  }

  toVinylFile(): PackageJsonVinyl {
    return PackageJsonVinyl.load({
      base: path.dirname(this.filePath),
      path: this.filePath,
      content: this.packageJsonObject,
      indent: this.indent,
      newline: this.newline
    });
  }

  addDependencies(dependencies: Object) {
    this.packageJsonObject.dependencies = Object.assign({}, this.packageJsonObject.dependencies, dependencies);
  }

  addDevDependencies(dependencies: Object) {
    this.packageJsonObject.devDependencies = Object.assign({}, this.packageJsonObject.devDependencies, dependencies);
  }

  addOrUpdateProperty(propertyName: string, propertyValue: any): void {
    this.packageJsonObject[propertyName] = propertyValue;
  }

  getProperty(propertyName: string): any {
    return this.packageJsonObject[propertyName];
  }

  mergePackageJsonObject(packageJsonObject: ?Object): void {
    if (!packageJsonObject || R.isEmpty(packageJsonObject)) return;
    this.packageJsonObject = Object.assign(this.packageJsonObject, packageJsonObject);
  }

  static propsNonUserChangeable() {
    return ['name', 'version', 'main', 'dependencies', 'devDependencies', 'peerDependencies', 'license', 'bit'];
  }

  static parsePackageJsonStr(str: string, dir: string) {
    try {
      return JSON.parse(str);
    } catch (err) {
      throw new Error(`failed parsing package.json file at ${dir}. original error: ${err.message}`);
    }
  }

  static async getPackageJsonStrIfExist(filePath: PathOsBased) {
    try {
      return await fs.readFile(filePath, 'utf-8');
    } catch (err) {
      if (err.code === 'ENOENT') {
        return null; // file not found
      }
      throw err;
    }
  }
}

function composePath(componentRootFolder: string) {
  return path.join(componentRootFolder, PACKAGE_JSON);
}
