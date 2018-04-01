/** @flow */
import fs from 'fs';
import R from 'ramda';
import path from 'path';
import AbstractBitJson from './abstract-bit-json';
import { BitJsonNotFound, BitJsonAlreadyExists, InvalidBitJson } from './exceptions';
import {
  BIT_JSON,
  DEFAULT_COMPONENTES_DIR_PATH,
  DEFAULT_DEPENDENCIES_DIR_PATH,
  DEFAULT_PACKAGE_MANAGER
} from '../../constants';
import filterObject from '../../utils/filter-object';
import type { PathOsBased } from '../../utils/path';

function composePath(bitPath: PathOsBased): PathOsBased {
  return path.join(bitPath, BIT_JSON);
}

function hasExisting(bitPath: string): boolean {
  return fs.existsSync(composePath(bitPath));
}

const DEFAULT_USE_WORKSPACES = false;
const DEFAULT_MANAGE_WORKSPACES = true;
const DEFAULT_SAVE_DEPENDENCIES_AS_COMPONENTS = false;

type consumerBitJsonProps = {
  impl?: string,
  spec?: string,
  compiler?: string,
  tester?: string,
  dependencies?: { [string]: string },
  saveDependenciesAsComponents?: boolean,
  lang?: string,
  distTarget?: ?string,
  distEntry?: ?string,
  componentsDefaultDirectory?: string,
  dependenciesDirectory?: string,
  bindingPrefix?: string,
  extensions?: Object,
  packageManager?: 'npm' | 'yarn',
  packageManagerArgs?: string[],
  packageManagerProcessOptions?: Object,
  useWorkspaces?: boolean,
  manageWorkspaces?: boolean
};

export default class ConsumerBitJson extends AbstractBitJson {
  distTarget: ?string; // path where to store build artifacts
  // path to remove while storing build artifacts. If, for example the code is in 'src' directory, and the component
  // is-string is in src/components/is-string, the dists files will be in dists/component/is-string (without the 'src')
  distEntry: ?string;
  componentsDefaultDirectory: string;
  dependenciesDirectory: string;
  saveDependenciesAsComponents: boolean; // save hub dependencies as bit components rather than npm packages
  packageManager: 'npm' | 'yarn'; // package manager client to use
  packageManagerArgs: ?(string[]); // package manager client to use
  packageManagerProcessOptions: ?Object; // package manager process options
  useWorkspaces: boolean; // Enables integration with Yarn Workspaces
  manageWorkspaces: boolean; // manage workspaces with yarn

  constructor({
    impl,
    spec,
    compiler,
    tester,
    dependencies,
    saveDependenciesAsComponents = DEFAULT_SAVE_DEPENDENCIES_AS_COMPONENTS,
    lang,
    distTarget,
    distEntry,
    componentsDefaultDirectory = DEFAULT_COMPONENTES_DIR_PATH,
    dependenciesDirectory = DEFAULT_DEPENDENCIES_DIR_PATH,
    bindingPrefix,
    extensions,
    packageManager = DEFAULT_PACKAGE_MANAGER,
    packageManagerArgs,
    packageManagerProcessOptions,
    useWorkspaces = DEFAULT_USE_WORKSPACES,
    manageWorkspaces = DEFAULT_MANAGE_WORKSPACES
  }: consumerBitJsonProps) {
    super({ impl, spec, compiler, tester, dependencies, lang, bindingPrefix, extensions });
    this.distTarget = distTarget;
    this.distEntry = distEntry;
    this.componentsDefaultDirectory = componentsDefaultDirectory;
    this.dependenciesDirectory = dependenciesDirectory;
    this.saveDependenciesAsComponents = saveDependenciesAsComponents;
    this.packageManager = packageManager;
    this.packageManagerArgs = packageManagerArgs;
    this.packageManagerProcessOptions = packageManagerProcessOptions;
    this.useWorkspaces = useWorkspaces;
    this.manageWorkspaces = manageWorkspaces;
  }

  toPlainObject() {
    const superObject = super.toPlainObject();
    let consumerObject = R.merge(superObject, {
      componentsDefaultDirectory: this.componentsDefaultDirectory,
      dependenciesDirectory: this.dependenciesDirectory,
      saveDependenciesAsComponents: this.saveDependenciesAsComponents,
      packageManager: this.packageManager,
      packageManagerArgs: this.packageManagerArgs,
      packageManagerProcessOptions: this.packageManagerProcessOptions,
      useWorkspaces: this.useWorkspaces,
      manageWorkspaces: this.manageWorkspaces
    });
    if (this.distEntry || this.distTarget) {
      const dist = {};
      if (this.distEntry) dist.entry = this.distEntry;
      if (this.distTarget) dist.target = this.distTarget;
      consumerObject = R.merge(consumerObject, { dist });
    }

    const isPropDefault = (val, key) => {
      if (key === 'dependenciesDirectory') return val !== DEFAULT_DEPENDENCIES_DIR_PATH;
      if (key === 'useWorkspaces') return val !== DEFAULT_USE_WORKSPACES;
      if (key === 'manageWorkspaces') return val !== DEFAULT_MANAGE_WORKSPACES;
      if (key === 'saveDependenciesAsComponents') return val !== DEFAULT_SAVE_DEPENDENCIES_AS_COMPONENTS;
      return true;
    };

    return filterObject(consumerObject, isPropDefault);
  }

  write({ bitDir, override = true }: { bitDir: string, override?: boolean }): Promise<boolean> {
    return new Promise((resolve, reject) => {
      if (!override && hasExisting(bitDir)) {
        throw new BitJsonAlreadyExists();
      }

      const respond = (err, res) => {
        if (err) return reject(err);
        return resolve(res);
      };

      fs.writeFile(composePath(bitDir), this.toJson(), respond);
    });
  }

  static create(): ConsumerBitJson {
    return new ConsumerBitJson({});
  }

  static ensure(dirPath): Promise<ConsumerBitJson> {
    return new Promise((resolve) => {
      return this.load(dirPath)
        .then(resolve)
        .catch(() => resolve(this.create()));
    });
  }

  static fromPlainObject(object: Object) {
    const {
      sources,
      env,
      dependencies,
      lang,
      componentsDefaultDirectory,
      dependenciesDirectory,
      dist,
      bindingPrefix,
      extensions,
      saveDependenciesAsComponents,
      packageManager,
      packageManagerArgs,
      packageManagerProcessOptions,
      useWorkspaces,
      manageWorkspaces
    } = object;

    return new ConsumerBitJson({
      impl: R.propOr(undefined, 'impl', sources),
      spec: R.propOr(undefined, 'spec', sources),
      compiler: R.propOr(undefined, 'compiler', env),
      tester: R.propOr(undefined, 'tester', env),
      lang,
      bindingPrefix,
      extensions,
      dependencies,
      saveDependenciesAsComponents,
      componentsDefaultDirectory,
      dependenciesDirectory,
      packageManager,
      packageManagerArgs,
      packageManagerProcessOptions,
      useWorkspaces,
      manageWorkspaces,
      distTarget: R.propOr(undefined, 'target', dist),
      distEntry: R.propOr(undefined, 'entry', dist)
    });
  }

  static load(dirPath: string): Promise<ConsumerBitJson> {
    return new Promise((resolve, reject) => {
      if (!hasExisting(dirPath)) return reject(new BitJsonNotFound());
      return fs.readFile(composePath(dirPath), (err, data) => {
        if (err) return reject(err);
        try {
          const file = JSON.parse(data.toString('utf8'));
          return resolve(this.fromPlainObject(file));
        } catch (e) {
          return reject(new InvalidBitJson(composePath(dirPath)));
        }
      });
    });
  }
}
