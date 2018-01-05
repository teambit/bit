/** @flow */
import fs from 'fs-extra';
import R from 'ramda';
import path from 'path';
import { PackageJsonAlreadyExists, PackageJsonNotFound } from '../exceptions';
import { PACKAGE_JSON } from '../constants';
import generatePostInstallScript from './postInstall';

function composePath(componentRootFolder: string) {
  return path.join(componentRootFolder, PACKAGE_JSON);
}

function convertComponentsToValidPackageNames(registryPrefix: string, bitDependencies: Object): Object {
  const obj = {};
  if (R.isEmpty(bitDependencies) || R.isNil(bitDependencies)) return obj;
  Object.keys(bitDependencies).forEach((key) => {
    const name = `${registryPrefix}/${key.replace(/\//g, '.')}`;
    obj[name] = bitDependencies[key];
  });
  return obj;
}

const PackageJsonPropsNames = ['name', 'version', 'homepage', 'main', 'dependencies', 'devDependencies', 'peerDependencies', 'license', 'scripts'];

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

  constructor(componentRootFolder: string, { name, version, homepage, main, dependencies, devDependencies, peerDependencies, license, scripts }: PackageJsonProps) {
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
  }

  toPlainObject(): Object {
    const self = this;
    const result = {};
    const addToResult = (propName) => {
      result[propName] = self[propName];
    };

    R.forEach(addToResult, PackageJsonPropsNames);
    return result;
  }

  toJson(readable: boolean = true) {
    if (!readable) return JSON.stringify(this.toPlainObject());
    return JSON.stringify(this.toPlainObject(), null, 4);
  }

  setScripts(postInstallLinkData: Array<Object> = [], domainPrefix: string) {
    this.scripts = R.isEmpty(postInstallLinkData) ? {} : generatePostInstallScript(this.componentRootFolder, postInstallLinkData, domainPrefix);
  }

  setDependencies(dependencies, bitDependencies: Object, registryPrefix: string) {
    this.dependencies = Object.assign({}, dependencies, convertComponentsToValidPackageNames(registryPrefix, bitDependencies));
  }

  static hasExisting(componentRootFolder: string, throws?: boolean = false): boolean {
    const packageJsonPath = composePath(componentRootFolder);
    const exists = fs.pathExistsSync(packageJsonPath);
    if (!exists && throws) {
      throw (new PackageJsonNotFound(packageJsonPath));
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

  static async load(componentRootFolder: string): Promise<PackageJson> {
    const THROWS = true;
    const composedPath = composePath(componentRootFolder);
    PackageJson.hasExisting(componentRootFolder, THROWS);
    const componentJsonObject = await fs.readJson(composedPath);
    return new PackageJson(componentRootFolder, componentJsonObject);
  }

  /**
   * For an existing package.json file of the root project, we don't want to do any change, other than what needed.
   * That's why this method doesn't use the 'load' and 'write' methods of this class. Otherwise, it'd write only the
   * PackageJsonPropsNames attributes.
   * Also, in case there is no package.json file in this project, it generates a new one with only the 'dependencies'
   * attribute. Nothing more, nothing less.
   */
  static async addComponentsIntoExistingPackageJson(rootDir: string, components: Array, registryPrefix: string) {
    const getRawObject = () => fs.readJson(composePath(rootDir));
    const saveRawObject = obj => fs.outputJSON(composePath(rootDir), obj, { spaces: 2 });
    const getPackageJson = async () => {
      const exist = PackageJson.hasExisting(rootDir);
      return exist ? getRawObject() : { dependencies: {} };
    };
    const packageJson = await getPackageJson();
    packageJson.dependencies = Object.assign({}, packageJson.dependencies, convertComponentsToValidPackageNames(registryPrefix, components));
    await saveRawObject(packageJson);
  }
}
