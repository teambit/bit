// @flow
import fs from 'fs-extra';
import path from 'path';
import R from 'ramda';
import detectIndent from 'detect-indent';
import type { PathOsBased } from '../../utils/path';
import { PACKAGE_JSON, PACKAGE_JSON_DEFAULT_INDENT } from '../../constants';
import JSONFile from './sources/json-file';
import logger from '../../logger/logger';
import Component from './consumer-component';
import componentIdToPackageName from '../../utils/bit/component-id-to-package-name';

export default class PackageJsonFile {
  packageJsonObject: Object;
  indent: number;
  fileExist: boolean;
  filePath: PathOsBased;
  constructor(filePath: PathOsBased, packageJsonObject: Object, fileExist: boolean, indent?: number) {
    this.filePath = filePath;
    this.packageJsonObject = packageJsonObject;
    this.fileExist = fileExist;
    this.indent = indent || PACKAGE_JSON_DEFAULT_INDENT;
  }

  async write() {
    logger.debug(`package-json-file.write, path ${this.filePath}`);
    return fs.outputJSON(this.filePath, this.packageJsonObject, { spaces: this.indent });
  }

  /**
   * load from the given dir, if not exist, don't throw an error, just set packageJsonObject as an
   * empty object
   */
  static async load(dir: string): Promise<PackageJsonFile> {
    const filePath = composePath(dir);
    const packageJsonStr = await PackageJsonFile.getPackageJsonStrIfExist(filePath);
    if (!packageJsonStr) {
      return new PackageJsonFile(filePath, {}, false);
    }
    const packageJsonObject = PackageJsonFile.parsePackageJsonStr(packageJsonStr, dir);
    const indent = detectIndent(packageJsonStr).amount;
    return new PackageJsonFile(filePath, packageJsonObject, true, indent);
  }

  static create(dir: string, packageJsonObject: Object): PackageJsonFile {
    const filePath = composePath(dir);
    return new PackageJsonFile(filePath, packageJsonObject, false);
  }

  static createFromComponent(
    dir: string,
    component: Component,
    excludeRegistryPrefix?: boolean = false
  ): PackageJsonFile {
    const filePath = composePath(dir);
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

  toJSONFile(): JSONFile {
    return JSONFile.load({
      base: path.dirname(this.filePath),
      path: this.filePath,
      content: this.packageJsonObject,
      indent: this.indent,
      override: true
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
