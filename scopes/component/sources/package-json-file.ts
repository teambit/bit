import detectIndent from 'detect-indent';
// @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
import detectNewline from 'detect-newline';
import fs from 'fs-extra';
import * as path from 'path';
import stringifyPackage from 'stringify-package';
import { DEPENDENCIES_FIELDS, PACKAGE_JSON } from '@teambit/legacy/dist/constants';
import logger from '@teambit/legacy/dist/logger/logger';
import { PathOsBased, PathOsBasedAbsolute, PathOsBasedRelative, PathRelative } from '@teambit/toolbox.path.path';
import { componentIdToPackageName } from '@teambit/pkg.modules.component-package-name';
import Component from '@teambit/legacy/dist/consumer/component/consumer-component';
import { JsonVinyl } from './json-vinyl';
import { cloneDeep, isEmpty } from 'lodash';

/**
 * when a package.json file is loaded, we save the indentation and the type of newline it uses, so
 * then we could preserve it later on while writing the file. this is same process used by NPM when
 * writing the package.json file
 */
export class PackageJsonFile {
  packageJsonObject: Record<string, any>;
  fileExist: boolean;
  filePath: PathOsBasedRelative;
  workspaceDir: PathOsBasedAbsolute | null | undefined;
  indent: string | null | undefined; // default when writing (in stringifyPackage) is "  ". (two spaces).
  newline: string | null | undefined; // whether "\n" or "\r\n", default when writing (in stringifyPackage) is "\n"
  constructor({
    filePath,
    packageJsonObject = {},
    fileExist,
    workspaceDir,
    indent,
    newline,
  }: {
    filePath: PathOsBasedRelative;
    packageJsonObject?: Record<string, any>;
    fileExist: boolean;
    workspaceDir?: PathOsBasedAbsolute;
    indent?: string;
    newline?: string;
  }) {
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
  static async load(workspaceDir: PathOsBasedAbsolute, componentDir: PathRelative = '.'): Promise<PackageJsonFile> {
    const filePath = composePath(componentDir);
    const filePathAbsolute = path.join(workspaceDir, filePath);
    const packageJsonStr = await PackageJsonFile.getPackageJsonStrIfExist(filePathAbsolute);
    if (!packageJsonStr) {
      return new PackageJsonFile({ filePath, fileExist: false, workspaceDir });
    }
    const packageJsonObject = PackageJsonFile.parsePackageJsonStr(packageJsonStr, componentDir);
    const indent = detectIndent(packageJsonStr).indent;
    const newline = detectNewline(packageJsonStr);
    return new PackageJsonFile({ filePath, packageJsonObject, fileExist: true, workspaceDir, indent, newline });
  }

  static create(
    workspaceDir: PathOsBasedAbsolute,
    componentDir: PathRelative = '.',
    content: Record<string, any>,
    indent = '  ',
    newline = '\n'
  ): PackageJsonFile {
    const filePath = composePath(componentDir);

    return new PackageJsonFile({
      filePath,
      packageJsonObject: content,
      fileExist: false,
      workspaceDir,
      indent,
      newline,
    });
  }

  static async reset(workspaceDir: PathOsBasedAbsolute) {
    const pkgJsonFile = await PackageJsonFile.load(workspaceDir);
    if (pkgJsonFile.fileExist) {
      pkgJsonFile.removeProperty('bit');
      await pkgJsonFile.write();
    }
  }

  static loadSync(workspaceDir: PathOsBasedAbsolute, componentDir: PathRelative = '.'): PackageJsonFile {
    const filePath = composePath(componentDir);
    const filePathAbsolute = path.join(workspaceDir, filePath);
    const packageJsonStr = PackageJsonFile.getPackageJsonStrIfExistSync(filePathAbsolute);
    if (!packageJsonStr) {
      return new PackageJsonFile({ filePath, fileExist: false, workspaceDir });
    }
    const packageJsonObject = PackageJsonFile.parsePackageJsonStr(packageJsonStr, componentDir);
    const indent = detectIndent(packageJsonStr).indent;
    const newline = detectNewline(packageJsonStr);
    return new PackageJsonFile({ filePath, packageJsonObject, fileExist: true, workspaceDir, indent, newline });
  }

  static loadFromPathSync(workspaceDir: PathOsBasedAbsolute, pathToLoad: string) {
    const filePath = composePath(pathToLoad);
    const filePathAbsolute = path.join(workspaceDir, filePath);
    const packageJsonStr = PackageJsonFile.getPackageJsonStrIfExistSync(filePathAbsolute);
    if (!packageJsonStr) {
      return new PackageJsonFile({ filePath, fileExist: false, workspaceDir });
    }
    const packageJsonObject = PackageJsonFile.parsePackageJsonStr(packageJsonStr, pathToLoad);
    return new PackageJsonFile({ filePath, packageJsonObject, fileExist: true, workspaceDir });
  }

  static loadFromCapsuleSync(capsuleRootDir: string) {
    const filePath = composePath('.');
    const filePathAbsolute = path.join(capsuleRootDir, filePath);
    const packageJsonStr = PackageJsonFile.getPackageJsonStrIfExistSync(filePathAbsolute);
    if (!packageJsonStr) {
      throw new Error(`capsule ${capsuleRootDir} is missing package.json`);
    }
    const packageJsonObject = PackageJsonFile.parsePackageJsonStr(packageJsonStr, filePath);
    return new PackageJsonFile({ filePath, packageJsonObject, fileExist: true, workspaceDir: capsuleRootDir });
  }

  static createFromComponent(
    componentDir: PathRelative,
    component: Component,
    addExportProperty = false
  ): PackageJsonFile {
    const filePath = composePath(componentDir);
    const name = componentIdToPackageName(component);
    const packageJsonObject = {
      name,
      version: component.version,
      homepage: component._getHomepage(),
      main: component.mainFile,
      // Used for determine that a package is a component
      // Used when resolve dependencies to identify that some package should be treated as component
      // TODO: replace by better way to identify that something is a component for sure
      // TODO: Maybe need to add the binding prefix here
      componentId: component.id.serialize(),
      dependencies: {
        ...component.packageDependencies,
      },
      devDependencies: {
        ...component.devPackageDependencies,
      },
      peerDependencies: {
        ...component.peerPackageDependencies,
      },
      license: `SEE LICENSE IN ${!isEmpty(component.license) ? 'LICENSE' : 'UNLICENSED'}`,
    };
    // @ts-ignore
    if (addExportProperty) packageJsonObject.exported = component.id.hasScope();
    if (!packageJsonObject.homepage) delete packageJsonObject.homepage;
    return new PackageJsonFile({ filePath, packageJsonObject, fileExist: false });
  }

  toVinylFile(): JsonVinyl {
    return JsonVinyl.load({
      base: path.dirname(this.filePath),
      path: this.filePath,
      content: this.packageJsonObject,
      indent: this.indent,
      newline: this.newline,
    });
  }

  addDependencies(dependencies: Record<string, any>) {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    this.packageJsonObject.dependencies = Object.assign({}, this.packageJsonObject.dependencies, dependencies);
  }

  addDevDependencies(dependencies: Record<string, any>) {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    this.packageJsonObject.devDependencies = Object.assign({}, this.packageJsonObject.devDependencies, dependencies);
  }

  addPeerDependencies(peerDependencies: Record<string, string>) {
    this.packageJsonObject.peerDependencies = {
      ...this.packageJsonObject.peerDependencies,
      ...peerDependencies,
    };
  }

  removeDependency(dependency: string) {
    delete this.packageJsonObject.dependencies[dependency];
  }

  copyPeerDependenciesToDev() {
    const devDeps = this.packageJsonObject.devDependencies || {};
    const peerDeps = this.packageJsonObject.peerDependencies || {};
    this.packageJsonObject.devDependencies = { ...devDeps, ...peerDeps };
  }

  replaceDependencies(dependencies: Record<string, any>) {
    Object.keys(dependencies).forEach((dependency) => {
      DEPENDENCIES_FIELDS.forEach((dependencyField) => {
        if (this.packageJsonObject[dependencyField] && this.packageJsonObject[dependencyField][dependency]) {
          this.packageJsonObject[dependencyField][dependency] = dependencies[dependency];
        }
      });
    });
  }

  addOrUpdateProperty(propertyName: string, propertyValue: any): void {
    this.packageJsonObject[propertyName] = propertyValue;
  }

  removeProperty(propertyName: string) {
    delete this.packageJsonObject[propertyName];
  }

  getProperty(propertyName: string): any {
    return this.packageJsonObject[propertyName];
  }
  setPackageManager(packageManager: string | undefined) {
    if (!packageManager) return;

    this.packageJsonObject.packageManager = packageManager;
  }

  mergePackageJsonObject(packageJsonObject: Record<string, any> | null | undefined): void {
    if (!packageJsonObject || isEmpty(packageJsonObject)) return;
    this.packageJsonObject = Object.assign(this.packageJsonObject, packageJsonObject);
  }

  /*
   * remove components from package.json dependencies
   */
  async removeComponentsFromDependencies(components: Component[]) {
    if (!this.fileExist) return;
    const deps = this.packageJsonObject.dependencies;
    if (!deps) return;
    components.forEach((c) => {
      this.removeDependency(componentIdToPackageName(c));
    });
    await this.write();
  }

  clone(): PackageJsonFile {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    const clone = new PackageJsonFile(this);
    clone.packageJsonObject = cloneDeep(this.packageJsonObject);
    return clone;
  }

  static propsNonUserChangeable() {
    return ['name', 'version', 'main', 'dependencies', 'devDependencies', 'peerDependencies', 'license', 'bit'];
  }

  static parsePackageJsonStr(str: string, dir: string) {
    try {
      return JSON.parse(str);
    } catch (err: any) {
      throw new Error(`failed parsing package.json file at ${dir}. original error: ${err.message}`);
    }
  }

  static async getPackageJsonStrIfExist(filePath: PathOsBased) {
    try {
      return await fs.readFile(filePath, 'utf-8');
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        return null; // file not found
      }
      throw err;
    }
  }

  static getPackageJsonStrIfExistSync(filePath: PathOsBased) {
    try {
      return fs.readFileSync(filePath, 'utf-8');
    } catch (err: any) {
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
