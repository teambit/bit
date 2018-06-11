/** @flow */
import R from 'ramda';
import semver from 'semver';
import packageNameValidate from 'validate-npm-package-name';
import { Ref, BitObject } from '../objects';
import Scope from '../scope';
import Source from './source';
import { filterObject, first, bufferFrom, getStringifyArgs, isValidPath } from '../../utils';
import ConsumerComponent from '../../consumer/component';
import type { customResolvedPath } from '../../consumer/component';
import { BitIds, BitId } from '../../bit-id';
import ComponentVersion from '../component-version';
import type { Doclet } from '../../jsdoc/parser';
import { DEFAULT_BUNDLE_FILENAME, DEFAULT_BINDINGS_PREFIX } from '../../constants';
import type { Results } from '../../specs-runner/specs-runner';
import { Dependencies, Dependency } from '../../consumer/component/dependencies';
import type { PathLinux } from '../../utils/path';
import type { CompilerExtensionModel } from '../../extensions/compiler-extension';
import type { TesterExtensionModel } from '../../extensions/tester-extension';
import ExtensionFile from '../../extensions/extension-file';
import { SourceFile } from '../../consumer/component/sources';
import Repository from '../objects/repository';
import type { RelativePath } from '../../consumer/component/dependencies/dependency';
import VersionInvalid from '../exceptions/version-invalid';
import logger from '../../logger/logger';
import validateType from '../../utils/validate-type';

type CiProps = {
  error: Object,
  startTime: string,
  endTime: string
};

export type SourceFileModel = {
  name: string,
  relativePath: PathLinux,
  test: boolean,
  file: Ref
};

type DistFileModel = SourceFileModel;

export type Log = {
  message: string,
  date: string,
  username: ?string,
  email: ?string
};

export type VersionProps = {
  mainFile: PathLinux,
  files: Array<SourceFileModel>,
  dists?: ?Array<DistFileModel>,
  compiler?: ?CompilerExtensionModel,
  tester?: ?TesterExtensionModel,
  log: Log,
  ci?: CiProps,
  specsResults?: ?Results,
  docs?: Doclet[],
  dependencies?: BitIds,
  devDependencies?: BitIds,
  flattenedDependencies?: BitIds,
  flattenedDevDependencies?: BitIds,
  packageDependencies?: { [string]: string },
  devPackageDependencies?: { [string]: string },
  peerPackageDependencies?: { [string]: string },
  envsPackageDependencies?: { [string]: string },
  bindingPrefix?: string,
  customResolvedPaths?: customResolvedPath[]
};

/**
 * Represent a version model in the scope
 */
export default class Version extends BitObject {
  mainFile: PathLinux;
  files: Array<SourceFileModel>;
  dists: ?Array<DistFileModel>;
  compiler: ?CompilerExtensionModel;
  tester: ?TesterExtensionModel;
  log: Log;
  ci: CiProps | {};
  specsResults: ?Results;
  docs: ?(Doclet[]);
  dependencies: Dependencies;
  devDependencies: Dependencies;
  flattenedDependencies: BitIds;
  flattenedDevDependencies: BitIds;
  packageDependencies: { [string]: string };
  devPackageDependencies: { [string]: string };
  peerPackageDependencies: { [string]: string };
  envsPackageDependencies: { [string]: string };
  bindingPrefix: ?string;
  customResolvedPaths: ?(customResolvedPath[]);

  constructor({
    mainFile,
    files,
    dists,
    compiler,
    tester,
    log,
    dependencies,
    devDependencies,
    docs,
    ci,
    specsResults,
    flattenedDependencies,
    flattenedDevDependencies,
    packageDependencies,
    devPackageDependencies,
    peerPackageDependencies,
    envsPackageDependencies,
    bindingPrefix,
    customResolvedPaths
  }: VersionProps) {
    super();
    this.mainFile = mainFile;
    this.files = files;
    this.dists = dists;
    this.compiler = compiler;
    this.tester = tester;
    this.log = log;
    this.dependencies = new Dependencies(dependencies);
    this.devDependencies = new Dependencies(devDependencies);
    this.docs = docs;
    this.ci = ci || {};
    this.specsResults = specsResults;
    this.flattenedDependencies = flattenedDependencies || new BitIds();
    this.flattenedDevDependencies = flattenedDevDependencies || new BitIds();
    this.packageDependencies = packageDependencies || {};
    this.devPackageDependencies = devPackageDependencies || {};
    this.peerPackageDependencies = peerPackageDependencies || {};
    this.envsPackageDependencies = envsPackageDependencies || {};
    this.bindingPrefix = bindingPrefix;
    this.customResolvedPaths = customResolvedPaths;
    this.validateVersion();
  }

  validateVersion() {
    const nonEmptyFields = ['mainFile', 'files'];
    nonEmptyFields.forEach((field) => {
      if (!this[field]) {
        throw new VersionInvalid(`failed creating a version object, the field "${field}" can't be empty`);
      }
    });
  }

  id() {
    const obj = this.toObject();

    // @todo: remove the entire dependencies.relativePaths from the ID (it's going to be a breaking change)
    const getDependencies = (deps) => {
      const clonedDependencies = R.clone(deps);
      if (!clonedDependencies) return clonedDependencies;
      return clonedDependencies.map((dependency: Dependency) => {
        return {
          id: dependency.id,
          relativePaths: dependency.relativePaths.map((relativePath) => {
            return {
              sourceRelativePath: relativePath.sourceRelativePath,
              destinationRelativePath: relativePath.destinationRelativePath
            };
          })
        };
      });
    };

    const filterFunction = (val, key) => {
      if (
        key === 'devDependencies' ||
        key === 'devPackageDependencies' ||
        key === 'peerPackageDependencies' ||
        key === 'envsPackageDependencies'
      ) {
        return !R.isEmpty(val);
      }
      return !!val;
    };

    return JSON.stringify(
      filterObject(
        {
          mainFile: obj.mainFile,
          files: obj.files,
          compiler: obj.compiler,
          tester: obj.tester,
          log: obj.log,
          dependencies: getDependencies(obj.dependencies),
          devDependencies: getDependencies(obj.devDependencies),
          packageDependencies: obj.packageDependencies,
          devPackageDependencies: obj.devPackageDependencies,
          peerPackageDependencies: obj.peerPackageDependencies,
          envsPackageDependencies: obj.envsPackageDependencies,
          bindingPrefix: obj.bindingPrefix
        },
        filterFunction
      )
    );
  }

  getAllFlattenedDependencies() {
    return this.flattenedDependencies.concat(this.flattenedDevDependencies);
  }

  getAllDependencies() {
    return this.dependencies.dependencies.concat(this.devDependencies.dependencies);
  }

  collectDependencies(scope: Scope, withEnvironments?: boolean, dev?: boolean = false): Promise<ComponentVersion[]> {
    const envDependencies = [this.compiler, this.tester];
    const flattenedDependencies = dev ? this.flattenedDevDependencies : this.flattenedDependencies;
    const dependencies = withEnvironments ? flattenedDependencies.concat(envDependencies) : flattenedDependencies;
    const allDependencies = dependencies.concat(this.flattenedDevDependencies);
    return scope.importManyOnes(allDependencies);
  }

  refs(): Ref[] {
    const extractRefsFromFiles = (files) => {
      const refs = files ? files.map(file => file.file) : [];
      return refs;
    };
    const files = extractRefsFromFiles(this.files);
    const dists = extractRefsFromFiles(this.dists);
    const compilerFiles = this.compiler ? extractRefsFromFiles(this.compiler.files) : [];
    const testerFiles = this.tester ? extractRefsFromFiles(this.tester.files) : [];
    return [...dists, ...files, ...compilerFiles, ...testerFiles].filter(ref => ref);
  }

  toObject() {
    const _convertFileToObject = (file) => {
      return {
        file: file.file.toString(),
        relativePath: file.relativePath,
        name: file.name,
        test: file.test
      };
    };

    const _convertEnvToObject = (env) => {
      if (typeof env === 'string') {
        return env;
      }
      // Store the env as string in case there is no config and files (for backward compatibility)
      if (envNameOnly(env)) {
        return env.name;
      }
      const result = {
        name: env.name,
        config: env.config,
        files: []
      };
      if (env.files && !R.isEmpty(env.files)) {
        result.files = env.files.map(ExtensionFile.fromModelObjectToObject);
      }
      return result;
    };

    return filterObject(
      {
        files: this.files ? this.files.map(_convertFileToObject) : null,
        mainFile: this.mainFile,
        dists: this.dists ? this.dists.map(_convertFileToObject) : null,
        compiler: this.compiler ? _convertEnvToObject(this.compiler) : null,
        bindingPrefix: this.bindingPrefix || DEFAULT_BINDINGS_PREFIX,
        tester: this.tester ? _convertEnvToObject(this.tester) : null,
        log: {
          message: this.log.message,
          date: this.log.date,
          username: this.log.username,
          email: this.log.email
        },
        ci: this.ci,
        specsResults: this.specsResults,
        docs: this.docs,
        dependencies: this.dependencies.cloneAsString(),
        devDependencies: this.devDependencies.cloneAsString(),
        flattenedDependencies: this.flattenedDependencies.map(dep => dep.toString()),
        flattenedDevDependencies: this.flattenedDevDependencies.map(dep => dep.toString()),
        packageDependencies: this.packageDependencies,
        devPackageDependencies: this.devPackageDependencies,
        peerPackageDependencies: this.peerPackageDependencies,
        envsPackageDependencies: this.envsPackageDependencies,
        customResolvedPaths: this.customResolvedPaths
      },
      val => !!val
    );
  }

  validateBeforePersisting(versionStr: string): void {
    logger.debug('validating version object: ', this.hash().hash);
    const version = Version.parse(versionStr);
    version.validate();
  }

  toBuffer(pretty: boolean): Buffer {
    const obj = this.toObject();
    const args = getStringifyArgs(pretty);
    const str = JSON.stringify(obj, ...args);
    if (this.validateBeforePersist) this.validateBeforePersisting(str);
    return bufferFrom(str);
  }

  /**
   * used by the super class BitObject
   */
  static parse(contents: string): Version {
    const {
      mainFile,
      dists,
      files,
      compiler,
      bindingPrefix,
      tester,
      log,
      docs,
      ci,
      specsResults,
      dependencies,
      flattenedDependencies,
      devDependencies,
      flattenedDevDependencies,
      devPackageDependencies,
      peerPackageDependencies,
      envsPackageDependencies,
      packageDependencies,
      customResolvedPaths
    } = JSON.parse(contents);
    const _getDependencies = (deps = []) => {
      if (deps.length && R.is(String, first(deps))) {
        // backward compatibility
        return deps.map(dependency => ({ id: BitId.parse(dependency) }));
      }

      return deps.map(dependency => ({
        id: BitId.parse(dependency.id),
        relativePaths: dependency.relativePaths
      }));
    };

    const parseFile = (file) => {
      return {
        file: Ref.from(file.file),
        relativePath: file.relativePath,
        name: file.name,
        test: file.test
      };
    };

    return new Version({
      mainFile,
      files: files ? files.map(parseFile) : null,
      dists: dists ? dists.map(parseFile) : null,
      compiler: compiler ? parseEnv(compiler) : null,
      bindingPrefix: bindingPrefix || null,
      tester: tester ? parseEnv(tester) : null,
      log: {
        message: log.message,
        date: log.date,
        username: log.username,
        email: log.email
      },
      ci,
      specsResults,
      docs,
      dependencies: _getDependencies(dependencies),
      flattenedDependencies: BitIds.deserialize(flattenedDependencies),
      devDependencies: _getDependencies(devDependencies),
      flattenedDevDependencies: BitIds.deserialize(flattenedDevDependencies),
      devPackageDependencies,
      peerPackageDependencies,
      envsPackageDependencies,
      packageDependencies,
      customResolvedPaths
    });
  }

  /**
   * used by raw-object.toRealObject()
   */
  static from(versionProps: VersionProps): Version {
    const compiler = versionProps.compiler ? parseEnv(versionProps.compiler) : null;
    const tester = versionProps.tester ? parseEnv(versionProps.tester) : null;
    const actualVersionProps = { ...versionProps, compiler, tester };
    return new Version(actualVersionProps);
  }

  /**
   * Create version model object from consumer component
   * @param {*} param0
   */
  static fromComponent({
    component,
    files,
    dists,
    flattenedDependencies,
    flattenedDevDependencies,
    message,
    specsResults,
    username,
    email
  }: {
    component: ConsumerComponent,
    files: ?Array<SourceFileModel>,
    flattenedDependencies: BitId[],
    flattenedDevDependencies: BitId[],
    message: string,
    dists: ?Array<DistFileModel>,
    specsResults: ?Results,
    username: ?string,
    email: ?string
  }) {
    const parseFile = (file) => {
      return {
        file: file.file.hash(),
        relativePath: file.relativePath,
        name: file.name,
        test: file.test
      };
    };

    const mergePackageDependencies = (
      envsPackageDependencies = {},
      compilerDynamicPakageDependencies = {},
      testerDynamicPakageDependencies = {}
    ) => {
      return { ...envsPackageDependencies, ...testerDynamicPakageDependencies, ...compilerDynamicPakageDependencies };
    };

    const compilerDynamicPakageDependencies = component.compiler
      ? component.compiler.dynamicPackageDependencies
      : undefined;
    const testerDynamicPakageDependencies = component.tester ? component.tester.dynamicPackageDependencies : undefined;

    return new Version({
      mainFile: component.mainFile,
      files: files ? files.map(parseFile) : null,
      dists: dists ? dists.map(parseFile) : null,
      compiler: component.compiler ? component.compiler.toModelObject() : undefined,
      bindingPrefix: component.bindingPrefix,
      tester: component.tester ? component.tester.toModelObject() : undefined,
      log: {
        message,
        username,
        email,
        date: Date.now().toString()
      },
      specsResults,
      docs: component.docs,
      packageDependencies: component.packageDependencies,
      devPackageDependencies: component.devPackageDependencies,
      peerPackageDependencies: component.peerPackageDependencies,
      envsPackageDependencies: mergePackageDependencies(
        component.envsPackageDependencies,
        compilerDynamicPakageDependencies,
        testerDynamicPakageDependencies
      ),
      flattenedDependencies,
      flattenedDevDependencies,
      dependencies: component.dependencies.get(),
      devDependencies: component.devDependencies.get(),
      customResolvedPaths: component.customResolvedPaths
    });
  }

  setSpecsResults(specsResults: ?Results) {
    this.specsResults = specsResults;
  }

  setDist(dist: ?Source) {
    this.dist = dist
      ? {
        file: dist.hash(),
        name: DEFAULT_BUNDLE_FILENAME
      }
      : null;
  }

  setCIProps(ci: CiProps) {
    this.ci = ci;
  }

  modelFilesToSourceFiles(repository: Repository): Promise<SourceFile[]> {
    return Promise.all(this.files.map(file => SourceFile.loadFromSourceFileModel(file, repository)));
  }
  /**
   * Validate the version model properties, to make sure we are not inserting something
   * in the wrong format
   */
  validate(): void {
    const message = 'unable to save Version object';
    const validateBitIdStr = (bitIdStr: string, field: string) => {
      validateType(message, bitIdStr, field, 'string');
      let bitId;
      try {
        bitId = BitId.parse(bitIdStr);
      } catch (err) {
        throw new VersionInvalid(`${message}, the ${field} has an invalid Bit id`);
      }
      if (!bitId.hasVersion()) throw new VersionInvalid(`${message}, the ${field} ${bitIdStr} does not have a version`);
      if (!bitId.scope) throw new VersionInvalid(`${message}, the ${field} ${bitIdStr} does not have a scope`);
    };
    const _validateEnv = (env) => {
      if (!env) return;
      if (typeof env === 'string') {
        validateBitIdStr(env, 'environment-id');
        return;
      }
      validateType(message, env, 'env', 'object');
      if (!env.name) {
        throw new VersionInvalid(`${message}, the environment is missing the name attribute`);
      }
      validateBitIdStr(env.name, 'env.name');
      if (env.files) {
        const compilerName = env.name || '';
        env.files.forEach((file) => {
          if (!file.name) {
            throw new VersionInvalid(
              `${message}, the environment ${compilerName} has a file which missing the name attribute`
            );
          }
        });
      }
    };

    /**
     * Validate that the package name and version are valid
     * @param {*} packageName
     * @param {*} packageVersion
     */
    const _validatePackageDependency = (packageVersion, packageName) => {
      const version = semver.valid(packageVersion);
      const versionRange = semver.validRange(packageVersion);
      const packageNameValidateResult = packageNameValidate(packageName);
      if (!packageNameValidateResult.validForNewPackages && !packageNameValidateResult.validForOldPackages) {
        const errors = packageNameValidateResult.errors || [];
        throw new VersionInvalid(`${packageName} is invalid package name, errors:  ${errors.join()}`);
      }
      if (!version && !versionRange) {
        throw new VersionInvalid(`${packageName} version - ${packageVersion} is not a valid semantic version`);
      }
    };
    const _validatePackageDependencies = (packageDependencies) => {
      validateType(message, packageDependencies, 'packageDependencies', 'object');
      R.forEachObjIndexed(_validatePackageDependency, packageDependencies);
    };
    const validateFile = (file, isDist: boolean = false) => {
      const field = isDist ? 'dist-file' : 'file';
      validateType(message, file, field, 'object');
      if (!isValidPath(file.relativePath)) {
        throw new VersionInvalid(`${message}, the ${field} ${file.relativePath} is invalid`);
      }
      if (!file.name) {
        throw new VersionInvalid(`${message}, the ${field} ${file.relativePath} is missing the name attribute`);
      }
      if (!file.file) throw new VersionInvalid(`${message}, the ${field} ${file.relativePath} is missing the hash`);
      validateType(message, file.name, `${field}.name`, 'string');
      validateType(message, file.file, `${field}.file`, 'object');
      validateType(message, file.file.hash, `${field}.file.hash`, 'string');
    };

    if (!this.mainFile) throw new VersionInvalid(`${message}, the mainFile is missing`);
    if (!isValidPath(this.mainFile)) throw new VersionInvalid(`${message}, the mainFile ${this.mainFile} is invalid`);
    if (!this.files || !this.files.length) throw new VersionInvalid(`${message}, the files are missing`);
    let foundMainFile = false;
    validateType(message, this.files, 'files', 'array');
    const filesPaths = [];
    this.files.forEach((file) => {
      validateFile(file);
      filesPaths.push(file.relativePath);
      if (file.relativePath === this.mainFile) foundMainFile = true;
    });
    if (!foundMainFile) {
      throw new VersionInvalid(`${message}, unable to find the mainFile ${this.mainFile} in the files list`);
    }
    const duplicateFiles = filesPaths.filter(
      file => filesPaths.filter(f => file.toLowerCase() === f.toLowerCase()).length > 1
    );
    if (duplicateFiles.length) {
      throw new VersionInvalid(`${message} the following files are duplicated ${duplicateFiles.join(', ')}`);
    }
    _validateEnv(this.compiler);
    _validateEnv(this.tester);
    _validatePackageDependencies(this.packageDependencies);
    _validatePackageDependencies(this.devPackageDependencies);
    _validatePackageDependencies(this.peerPackageDependencies);
    _validatePackageDependencies(this.envsPackageDependencies);
    if (this.dists && this.dists.length) {
      validateType(message, this.dists, 'dist', 'array');
      // $FlowFixMe
      this.dists.forEach((file) => {
        validateFile(file, true);
      });
    }
    if (!(this.dependencies instanceof Dependencies)) {
      throw new VersionInvalid(
        `${message}, dependencies must be an instance of Dependencies, got ${typeof this.dependencies}`
      );
    }
    if (!(this.devDependencies instanceof Dependencies)) {
      throw new VersionInvalid(
        `${message}, devDependencies must be an instance of Dependencies, got ${typeof this.devDependencies}`
      );
    }
    this.dependencies.validate();
    this.devDependencies.validate();
    if (!this.dependencies.isEmpty() && !this.flattenedDependencies.length) {
      throw new VersionInvalid(`${message}, it has dependencies but its flattenedDependencies is empty`);
    }
    if (!this.devDependencies.isEmpty() && !this.flattenedDevDependencies.length) {
      throw new VersionInvalid(`${message}, it has devDependencies but its flattenedDevDependencies is empty`);
    }
    const validateFlattenedDependencies = (dependencies: string[]) => {
      validateType(message, dependencies, 'dependencies', 'array');
      dependencies.forEach((dependency) => {
        if (!(dependency instanceof BitId)) {
          throw new VersionInvalid(`${message}, a flattenedDependency expected to be BitId, got ${typeof dependency}`);
        }
        if (!dependency.hasVersion()) {
          throw new VersionInvalid(
            `${message}, the flattenedDependency ${dependency.toString()} does not have a version`
          );
        }
      });
    };
    validateFlattenedDependencies(this.flattenedDependencies);
    validateFlattenedDependencies(this.flattenedDevDependencies);
    if (!this.log) throw new VersionInvalid(`${message}, the log object is missing`);
    validateType(message, this.log, 'log', 'object');
    if (this.bindingPrefix) {
      validateType(message, this.bindingPrefix, 'bindingPrefix', 'string');
    }
  }
}

const parseEnv = (env) => {
  if (typeof env === 'string') {
    return env;
  }
  // Store the env as string in case there is no config and files (for backward compatibility)
  if (envNameOnly(env)) {
    return env.name;
  }
  return {
    name: env.name,
    config: env.config,
    files: env.files ? env.files.map(ExtensionFile.fromObjectToModelObject) : []
  };
};

const envNameOnly = (env) => {
  if ((!env.config || R.isEmpty(env.config)) && (!env.files || R.isEmpty(env.files))) {
    return true;
  }
  return false;
};
