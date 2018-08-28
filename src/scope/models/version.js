/** @flow */
import R from 'ramda';
import semver from 'semver';
import packageNameValidate from 'validate-npm-package-name';
import { Ref, BitObject } from '../objects';
import Scope from '../scope';
import Source from './source';
import { filterObject, first, bufferFrom, getStringifyArgs, isValidPath, sha1, sortObject } from '../../utils';
import ConsumerComponent from '../../consumer/component';
import type { customResolvedPath } from '../../consumer/component';
import { BitIds, BitId } from '../../bit-id';
import ComponentVersion from '../component-version';
import type { Doclet } from '../../jsdoc/parser';
import { DEFAULT_BUNDLE_FILENAME, DEFAULT_BINDINGS_PREFIX, COMPONENT_ORIGINS } from '../../constants';
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
  detachedCompiler?: ?boolean,
  detachedTester?: ?boolean,
  log: Log,
  ci?: CiProps,
  specsResults?: ?Results,
  docs?: Doclet[],
  dependencies?: Dependency[],
  devDependencies?: Dependency[],
  compilerDependencies?: Dependency[],
  testerDependencies?: Dependency[],
  flattenedDependencies?: BitIds,
  flattenedDevDependencies?: BitIds,
  flattenedCompilerDependencies?: BitIds,
  flattenedTesterDependencies?: BitIds,
  packageDependencies?: { [string]: string },
  devPackageDependencies?: { [string]: string },
  peerPackageDependencies?: { [string]: string },
  compilerPackageDependencies?: { [string]: string },
  testerPackageDependencies?: { [string]: string },
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
  detachedCompiler: ?boolean;
  detachedTester: ?boolean;
  log: Log;
  ci: CiProps | {};
  specsResults: ?Results;
  docs: ?(Doclet[]);
  dependencies: Dependencies;
  devDependencies: Dependencies;
  compilerDependencies: Dependencies;
  testerDependencies: Dependencies;
  flattenedDependencies: BitIds;
  flattenedDevDependencies: BitIds;
  flattenedCompilerDependencies: BitIds;
  flattenedTesterDependencies: BitIds;
  packageDependencies: { [string]: string };
  devPackageDependencies: { [string]: string };
  peerPackageDependencies: { [string]: string };
  compilerPackageDependencies: { [string]: string };
  testerPackageDependencies: { [string]: string };
  bindingPrefix: ?string;
  customResolvedPaths: ?(customResolvedPath[]);

  constructor(props: VersionProps) {
    super();
    this.mainFile = props.mainFile;
    this.files = props.files;
    this.dists = props.dists;
    this.compiler = props.compiler;
    this.tester = props.tester;
    this.log = props.log;
    this.dependencies = new Dependencies(props.dependencies);
    this.devDependencies = new Dependencies(props.devDependencies);
    this.compilerDependencies = new Dependencies(props.compilerDependencies);
    this.testerDependencies = new Dependencies(props.testerDependencies);
    this.docs = props.docs;
    this.ci = props.ci || {};
    this.specsResults = props.specsResults;
    this.flattenedDependencies = props.flattenedDependencies || new BitIds();
    this.flattenedDevDependencies = props.flattenedDevDependencies || new BitIds();
    this.flattenedCompilerDependencies = props.flattenedCompilerDependencies || new BitIds();
    this.flattenedTesterDependencies = props.flattenedTesterDependencies || new BitIds();
    this.packageDependencies = props.packageDependencies || {};
    this.devPackageDependencies = props.devPackageDependencies || {};
    this.peerPackageDependencies = props.peerPackageDependencies || {};
    this.compilerPackageDependencies = props.compilerPackageDependencies || {};
    this.testerPackageDependencies = props.testerPackageDependencies || {};
    this.bindingPrefix = props.bindingPrefix;
    this.customResolvedPaths = props.customResolvedPaths;
    this.detachedCompiler = props.detachedCompiler;
    this.detachedTester = props.detachedTester;
    this.validateVersion();
  }

  validateVersion() {
    const nonEmptyFields = ['mainFile', 'files'];
    nonEmptyFields.forEach((field) => {
      // $FlowFixMe
      if (!this[field]) {
        throw new VersionInvalid(`failed creating a version object, the field "${field}" can't be empty`);
      }
    });
  }

  id() {
    const obj = this.toObject();

    // @todo: remove the entire dependencies.relativePaths from the ID (it's going to be a breaking change)
    const getDependencies = (deps: Dependencies) => {
      const clonedDependencies = deps.cloneAsString();
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
        key === 'compilerDependencies' ||
        key === 'testerDependencies' ||
        key === 'devPackageDependencies' ||
        key === 'peerPackageDependencies' ||
        key === 'compilerPackageDependencies' ||
        key === 'testerPackageDependencies'
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
          dependencies: getDependencies(this.dependencies),
          devDependencies: getDependencies(this.devDependencies),
          compilerDependencies: getDependencies(this.compilerDependencies),
          testerDependencies: getDependencies(this.testerDependencies),
          packageDependencies: obj.packageDependencies,
          devPackageDependencies: obj.devPackageDependencies,
          peerPackageDependencies: obj.peerPackageDependencies,
          compilerPackageDependencies: obj.compilerPackageDependencies,
          testerPackageDependencies: obj.testerPackageDependencies,
          bindingPrefix: obj.bindingPrefix
        },
        filterFunction
      )
    );
  }

  getAllFlattenedDependencies(): BitIds {
    return BitIds.fromArray([
      ...this.flattenedDependencies,
      ...this.flattenedDevDependencies,
      ...this.flattenedCompilerDependencies,
      ...this.flattenedTesterDependencies
    ]);
  }

  getAllDependencies(): Dependency[] {
    return [
      ...this.dependencies.dependencies,
      ...this.devDependencies.dependencies,
      ...this.compilerDependencies.dependencies,
      ...this.testerDependencies.dependencies
    ];
  }

  getAllDependenciesCloned(): Dependencies {
    const dependencies = [
      ...this.dependencies.getClone(),
      ...this.devDependencies.getClone(),
      ...this.compilerDependencies.getClone(),
      ...this.testerDependencies.getClone()
    ];
    return new Dependencies(dependencies);
  }

  updateFlattenedDependency(currentId: BitId, newId: BitId) {
    const getUpdated = (flattenedDependencies: BitIds): BitIds => {
      const updatedIds = flattenedDependencies.map((depId) => {
        if (depId.isEqual(currentId)) return newId;
        return depId;
      });
      return BitIds.fromArray(updatedIds);
    };
    this.flattenedDependencies = getUpdated(this.flattenedDependencies);
    this.flattenedDevDependencies = getUpdated(this.flattenedDevDependencies);
    this.flattenedCompilerDependencies = getUpdated(this.flattenedCompilerDependencies);
    this.flattenedTesterDependencies = getUpdated(this.flattenedTesterDependencies);
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
        detachedCompiler: this.detachedCompiler,
        detachedTester: this.detachedTester,
        log: {
          message: this.log.message,
          date: this.log.date,
          username: this.log.username,
          email: this.log.email
        },
        ci: this.ci,
        specsResults: this.specsResults,
        docs: this.docs,
        dependencies: this.dependencies.cloneAsObject(),
        devDependencies: this.devDependencies.cloneAsObject(),
        compilerDependencies: this.compilerDependencies.cloneAsObject(),
        testerDependencies: this.testerDependencies.cloneAsObject(),
        flattenedDependencies: this.flattenedDependencies.map(dep => dep.serialize()),
        flattenedDevDependencies: this.flattenedDevDependencies.map(dep => dep.serialize()),
        flattenedCompilerDependencies: this.flattenedCompilerDependencies.map(dep => dep.serialize()),
        flattenedTesterDependencies: this.flattenedTesterDependencies.map(dep => dep.serialize()),
        packageDependencies: this.packageDependencies,
        devPackageDependencies: this.devPackageDependencies,
        peerPackageDependencies: this.peerPackageDependencies,
        compilerPackageDependencies: this.compilerPackageDependencies,
        testerPackageDependencies: this.testerPackageDependencies,
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
      detachedCompiler,
      detachedTester,
      log,
      docs,
      ci,
      specsResults,
      dependencies,
      devDependencies,
      compilerDependencies,
      testerDependencies,
      flattenedDependencies,
      flattenedDevDependencies,
      flattenedCompilerDependencies,
      flattenedTesterDependencies,
      devPackageDependencies,
      peerPackageDependencies,
      compilerPackageDependencies,
      testerPackageDependencies,
      packageDependencies,
      customResolvedPaths
    } = JSON.parse(contents);
    const _getDependencies = (deps = []): Dependency[] => {
      if (deps.length && R.is(String, first(deps))) {
        // backward compatibility
        return deps.map(dependency => ({ id: BitId.parseObsolete(dependency) }));
      }

      const getRelativePath = (relativePath) => {
        if (relativePath.importSpecifiers) {
          // backward compatibility. Before the massive validation was added, an item of
          // relativePath.importSpecifiers array could be missing the mainFile property, which is
          // an invalid ImportSpecifier. (instead the mainFile it had another importSpecifiers object).
          relativePath.importSpecifiers = relativePath.importSpecifiers.filter(
            importSpecifier => importSpecifier.mainFile
          );
          if (!relativePath.importSpecifiers.length) delete relativePath.importSpecifiers;
        }

        return relativePath;
      };

      return deps.map((dependency) => {
        return {
          id: BitId.parseBackwardCompatible(dependency.id),
          relativePaths: Array.isArray(dependency.relativePaths)
            ? dependency.relativePaths.map(getRelativePath)
            : dependency.relativePaths
        };
      });
    };

    const _getFlattenedDependencies = (deps = []): BitIds => {
      return BitIds.fromArray(deps.map(dep => BitId.parseBackwardCompatible(dep)));
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
      detachedCompiler,
      detachedTester,
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
      devDependencies: _getDependencies(devDependencies),
      compilerDependencies: _getDependencies(compilerDependencies),
      testerDependencies: _getDependencies(testerDependencies),
      flattenedDependencies: _getFlattenedDependencies(flattenedDependencies),
      flattenedDevDependencies: _getFlattenedDependencies(flattenedDevDependencies),
      flattenedCompilerDependencies: _getFlattenedDependencies(flattenedCompilerDependencies),
      flattenedTesterDependencies: _getFlattenedDependencies(flattenedTesterDependencies),
      devPackageDependencies,
      peerPackageDependencies,
      compilerPackageDependencies,
      testerPackageDependencies,
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
    versionFromModel,
    files,
    dists,
    flattenedDependencies,
    flattenedDevDependencies,
    flattenedCompilerDependencies,
    flattenedTesterDependencies,
    message,
    specsResults,
    username,
    email
  }: {
    component: ConsumerComponent,
    versionFromModel: Version,
    files: Array<SourceFileModel>,
    flattenedDependencies: BitIds,
    flattenedDevDependencies: BitIds,
    flattenedCompilerDependencies: BitIds,
    flattenedTesterDependencies: BitIds,
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

    /**
     * Get to envs models and check if they are different
     * @param {*} envModelFromFs
     * @param {*} envModelFromModel
     */
    const areEnvsDifferent = (envModelFromFs, envModelFromModel) => {
      const sortEnv = (env) => {
        env.files = R.sortBy(R.prop('name'), env.files);
        env.config = sortObject(env.config);
        const result = sortObject(env);
        return result;
      };
      const stringifyEnv = (env) => {
        if (!env) {
          return '';
        }
        if (typeof env === 'string') {
          return env;
        }
        return JSON.stringify(sortEnv(env));
      };
      const envModelFromFsString = stringifyEnv(envModelFromFs);
      const envModelFromModelString = stringifyEnv(envModelFromModel);
      return sha1(envModelFromFsString) !== sha1(envModelFromModelString);
    };

    /**
     * Calculate the detach status based on the component origin, the component detach status from bitmap and comparison
     * between the env in fs and the env in models
     * @param {*} origin
     * @param {*} detachFromFs
     * @param {*} envModelFromFs
     * @param {*} envModelFromModel
     */
    const calculateDetach = (origin: ComponentOrigin, detachFromFs: ?boolean, envModelFromFs, envModelFromModel) => {
      // In case it's already detached keep the state as is
      if (detachFromFs) return detachFromFs;
      // In case i'm the author and it's not already detached it can't be changed here
      if (origin === COMPONENT_ORIGINS.AUTHORED) return undefined;
      return areEnvsDifferent(envModelFromFs, envModelFromModel);
    };

    const compiler = component.compiler ? component.compiler.toModelObject() : undefined;
    const tester = component.tester ? component.tester.toModelObject() : undefined;

    const compilerDynamicPakageDependencies = component.compiler
      ? component.compiler.dynamicPackageDependencies
      : undefined;
    const testerDynamicPakageDependencies = component.tester ? component.tester.dynamicPackageDependencies : undefined;
    let detachedCompiler;
    let detachedTester;
    const compilerFromModel = R.path(['compiler'], versionFromModel);
    const testerFromModel = R.path(['tester'], versionFromModel);
    if (compiler) {
      detachedCompiler = calculateDetach(
        component.origin,
        component.detachedCompiler,
        getEnvModelOrName(compiler),
        compilerFromModel
      );
      if (detachedCompiler) {
        // Save it on the component for future use
        component.detachedCompiler = detachedCompiler;
      }
    }
    if (tester) {
      detachedTester = calculateDetach(
        component.origin,
        component.detachedTester,
        getEnvModelOrName(tester),
        testerFromModel
      );
      if (detachedTester) {
        // Save it on the component for future use
        component.detachedTester = detachedTester;
      }
    }

    return new Version({
      mainFile: component.mainFile,
      files: files.map(parseFile),
      dists: dists ? dists.map(parseFile) : null,
      compiler,
      bindingPrefix: component.bindingPrefix,
      tester,
      detachedCompiler,
      detachedTester,
      log: {
        message,
        username,
        email,
        date: Date.now().toString()
      },
      specsResults,
      docs: component.docs,
      dependencies: component.dependencies.get(),
      devDependencies: component.devDependencies.get(),
      compilerDependencies: component.compilerDependencies.get(),
      testerDependencies: component.testerDependencies.get(),
      packageDependencies: component.packageDependencies,
      devPackageDependencies: component.devPackageDependencies,
      peerPackageDependencies: component.peerPackageDependencies,
      compilerPackageDependencies: {
        ...component.compilerPackageDependencies,
        ...compilerDynamicPakageDependencies
      },
      testerPackageDependencies: {
        ...component.testerPackageDependencies,
        ...testerDynamicPakageDependencies
      },
      flattenedDependencies,
      flattenedDevDependencies,
      flattenedCompilerDependencies,
      flattenedTesterDependencies,
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
    const validateBitIdStr = (bitIdStr: string, field: string, validateVersion: boolean = true) => {
      validateType(message, bitIdStr, field, 'string');
      let bitId;
      try {
        bitId = BitId.parse(bitIdStr, true);
      } catch (err) {
        throw new VersionInvalid(`${message}, the ${field} has an invalid Bit id`);
      }
      if (validateVersion && !bitId.hasVersion()) {
        throw new VersionInvalid(`${message}, the ${field} ${bitIdStr} does not have a version`);
      }
      if (!bitId.scope) throw new VersionInvalid(`${message}, the ${field} ${bitIdStr} does not have a scope`);
    };
    const _validateEnv = (env) => {
      if (!env) return;
      if (typeof env === 'string') {
        // Do not validate version - for backward compatibility
        validateBitIdStr(env, 'environment-id', false);
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
      const packageNameValidateResult = packageNameValidate(packageName);
      if (!packageNameValidateResult.validForNewPackages && !packageNameValidateResult.validForOldPackages) {
        const errors = packageNameValidateResult.errors || [];
        throw new VersionInvalid(`${packageName} is invalid package name, errors:  ${errors.join()}`);
      }
      // don't use semver.valid and semver.validRange to validate the package version because it
      // can be also a URL, Git URL or Github URL. see here: https://docs.npmjs.com/files/package.json#dependencies
      validateType(message, packageVersion, `version of "${packageName}"`, 'string');
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
    if (this.detachedCompiler !== undefined) {
      validateType(message, this.detachedCompiler, 'detachedCompiler', 'boolean');
    }
    if (this.detachedTester !== undefined) {
      validateType(message, this.detachedTester, 'detachedCompiler', 'boolean');
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
    _validatePackageDependencies(this.compilerPackageDependencies);
    _validatePackageDependencies(this.testerPackageDependencies);
    if (this.dists && this.dists.length) {
      validateType(message, this.dists, 'dist', 'array');
      // $FlowFixMe
      this.dists.forEach((file) => {
        validateFile(file, true);
      });
    }
    const dependenciesInstances = ['dependencies', 'devDependencies', 'compilerDependencies', 'testerDependencies'];
    dependenciesInstances.forEach((dependenciesType) => {
      // $FlowFixMe
      if (!(this[dependenciesType] instanceof Dependencies)) {
        throw new VersionInvalid(
          `${message}, ${dependenciesType} must be an instance of Dependencies, got ${typeof this[dependenciesType]}`
        );
      }
    });
    this.dependencies.validate();
    this.devDependencies.validate();
    this.compilerDependencies.validate();
    this.testerDependencies.validate();
    if (!this.dependencies.isEmpty() && !this.flattenedDependencies.length) {
      throw new VersionInvalid(`${message}, it has dependencies but its flattenedDependencies is empty`);
    }
    if (!this.devDependencies.isEmpty() && !this.flattenedDevDependencies.length) {
      throw new VersionInvalid(`${message}, it has devDependencies but its flattenedDevDependencies is empty`);
    }
    if (!this.compilerDependencies.isEmpty() && !this.flattenedCompilerDependencies.length) {
      throw new VersionInvalid(
        `${message}, it has compilerDependencies but its flattenedCompilerDependencies is empty`
      );
    }
    if (!this.testerDependencies.isEmpty() && !this.flattenedTesterDependencies.length) {
      throw new VersionInvalid(`${message}, it has testerDependencies but its flattenedTesterDependencies is empty`);
    }
    const validateFlattenedDependencies = (dependencies: BitIds) => {
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
    validateFlattenedDependencies(this.flattenedCompilerDependencies);
    validateFlattenedDependencies(this.flattenedTesterDependencies);
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

const getEnvModelOrName = (env) => {
  if (typeof env === 'string') {
    return env;
  }
  // Store the env as string in case there is no config and files (for backward compatibility)
  if (envNameOnly(env)) {
    return env.name;
  }
  return env;
};
