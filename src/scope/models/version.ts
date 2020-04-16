import R from 'ramda';
import { Ref, BitObject } from '../objects';
import Source from './source';
import { filterObject, first, getStringifyArgs } from '../../utils';
import { CustomResolvedPath } from '../../consumer/component/consumer-component';
import ConsumerComponent from '../../consumer/component';
import { BitIds, BitId } from '../../bit-id';
import { Doclet } from '../../jsdoc/types';
import { DEFAULT_BUNDLE_FILENAME, DEFAULT_BINDINGS_PREFIX, DEPENDENCIES_FIELDS } from '../../constants';
import { Results } from '../../consumer/specs-results/specs-results';
import { Dependencies, Dependency } from '../../consumer/component/dependencies';
import { PathLinux, PathLinuxRelative } from '../../utils/path';
import { CompilerExtensionModel } from '../../legacy-extensions/compiler-extension';
import { TesterExtensionModel } from '../../legacy-extensions/tester-extension';
import { SourceFile } from '../../consumer/component/sources';
import Repository from '../objects/repository';
import VersionInvalid from '../exceptions/version-invalid';
import logger from '../../logger/logger';
import validateVersionInstance from '../version-validator';
import { ComponentOverridesData } from '../../consumer/config/component-overrides';
import { EnvPackages } from '../../legacy-extensions/env-extension';
import { ExtensionDataList, ExtensionDataEntry } from '../../consumer/config/extension-data';

type CiProps = {
  error: Record<string, any>;
  startTime: string;
  endTime: string;
};

export type SourceFileModel = {
  name: string;
  relativePath: PathLinux;
  test: boolean;
  file: Ref;
};

export type DistFileModel = SourceFileModel;

export type Log = {
  message: string;
  date: string;
  username: string | undefined;
  email: string | undefined;
};

export type VersionProps = {
  mainFile: PathLinux;
  files: Array<SourceFileModel>;
  dists?: Array<DistFileModel> | undefined;
  mainDistFile: PathLinux | undefined;
  compiler?: CompilerExtensionModel | undefined;
  tester?: TesterExtensionModel | undefined;
  log: Log;
  ci?: CiProps;
  specsResults?: Results | undefined;
  docs?: Doclet[];
  dependencies?: Dependency[];
  devDependencies?: Dependency[];
  compilerDependencies?: Dependency[];
  testerDependencies?: Dependency[];
  flattenedDependencies?: BitIds;
  flattenedDevDependencies?: BitIds;
  flattenedCompilerDependencies?: BitIds;
  flattenedTesterDependencies?: BitIds;
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  packageDependencies?: { [key: string]: string };
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  devPackageDependencies?: { [key: string]: string };
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  peerPackageDependencies?: { [key: string]: string };
  compilerPackageDependencies?: EnvPackages;
  testerPackageDependencies?: EnvPackages;
  bindingPrefix?: string;
  ignoreSharedDir?: boolean;
  customResolvedPaths?: CustomResolvedPath[];
  overrides: ComponentOverridesData;
  packageJsonChangedProps?: Record<string, any>;
  extensions?: ExtensionDataList;
};

/**
 * Represent a version model in the scope
 */
// @ts-ignore
export default class Version extends BitObject {
  mainFile: PathLinux;
  files: Array<SourceFileModel>;
  dists: Array<DistFileModel> | undefined;
  mainDistFile: PathLinuxRelative | undefined;
  compiler: CompilerExtensionModel | undefined;
  tester: TesterExtensionModel | undefined;
  log: Log;
  ci: CiProps | {};
  specsResults: Results | undefined;
  docs: Doclet[] | undefined;
  dependencies: Dependencies;
  devDependencies: Dependencies;
  compilerDependencies: Dependencies;
  testerDependencies: Dependencies;
  flattenedDependencies: BitIds;
  flattenedDevDependencies: BitIds;
  flattenedCompilerDependencies: BitIds;
  flattenedTesterDependencies: BitIds;
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  packageDependencies: { [key: string]: string };
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  devPackageDependencies: { [key: string]: string };
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  peerPackageDependencies: { [key: string]: string };
  compilerPackageDependencies: EnvPackages;
  testerPackageDependencies: EnvPackages;
  bindingPrefix: string | undefined;
  ignoreSharedDir: boolean | undefined;
  customResolvedPaths: CustomResolvedPath[] | undefined;
  overrides: ComponentOverridesData;
  packageJsonChangedProps: Record<string, any>;
  extensions: ExtensionDataList;

  constructor(props: VersionProps) {
    super();
    this.mainFile = props.mainFile;
    this.files = props.files;
    this.dists = props.dists;
    this.mainDistFile = props.mainDistFile;
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
    this.ignoreSharedDir = props.ignoreSharedDir;
    this.customResolvedPaths = props.customResolvedPaths;
    this.overrides = props.overrides || {};
    this.packageJsonChangedProps = props.packageJsonChangedProps || {};
    this.extensions = props.extensions || ExtensionDataList.fromArray([]);
    this.validateVersion();
  }

  validateVersion() {
    const nonEmptyFields = ['mainFile', 'files'];
    nonEmptyFields.forEach(field => {
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
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      return clonedDependencies.map((dependency: Dependency) => {
        return {
          id: dependency.id,
          relativePaths: dependency.relativePaths.map(relativePath => {
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
        key === 'overrides'
      ) {
        return !R.isEmpty(val);
      }
      return !!val;
    };

    return JSON.stringify(
      filterObject(
        {
          // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
          mainFile: obj.mainFile,
          // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
          files: obj.files,
          // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
          compiler: obj.compiler,
          // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
          tester: obj.tester,
          // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
          log: obj.log,
          dependencies: getDependencies(this.dependencies),
          devDependencies: getDependencies(this.devDependencies),
          compilerDependencies: getDependencies(this.compilerDependencies),
          testerDependencies: getDependencies(this.testerDependencies),
          // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
          packageDependencies: obj.packageDependencies,
          // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
          devPackageDependencies: obj.devPackageDependencies,
          // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
          peerPackageDependencies: obj.peerPackageDependencies,
          // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
          bindingPrefix: obj.bindingPrefix,
          // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
          overrides: obj.overrides
        },
        filterFunction
      )
    );
  }

  get extensionDependencies() {
    return new Dependencies(this.extensions.extensionsBitIds.map(id => new Dependency(id, [])));
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
      ...this.testerDependencies.dependencies,
      ...this.extensionDependencies.dependencies
    ];
  }

  get depsIdsGroupedByType(): { dependencies: BitIds; devDependencies: BitIds; extensionDependencies: BitIds } {
    return {
      dependencies: this.dependencies.getAllIds(),
      devDependencies: this.devDependencies.getAllIds(),
      extensionDependencies: this.extensions.extensionsBitIds
    };
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

  getAllDependenciesIds(): BitIds {
    const allDependencies = R.flatten(Object.values(this.depsIdsGroupedByType));
    return BitIds.fromArray(allDependencies);
  }

  updateFlattenedDependency(currentId: BitId, newId: BitId) {
    const getUpdated = (flattenedDependencies: BitIds): BitIds => {
      const updatedIds = flattenedDependencies.map(depId => {
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
    const extractRefsFromFiles = files => {
      const refs = files ? files.map(file => file.file) : [];
      return refs;
    };
    const files = extractRefsFromFiles(this.files);
    const dists = extractRefsFromFiles(this.dists);
    return [...dists, ...files].filter(ref => ref);
  }

  toObject() {
    const _convertFileToObject = file => {
      return {
        file: file.file.toString(),
        relativePath: file.relativePath,
        name: file.name,
        test: file.test
      };
    };

    const _convertEnvToObject = env => {
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
      return result;
    };

    const _removeEmptyPackagesEnvs = pkgEnv => {
      DEPENDENCIES_FIELDS.forEach(dependencyType => {
        if (pkgEnv[dependencyType] && R.isEmpty(pkgEnv[dependencyType])) {
          delete pkgEnv[dependencyType];
        }
      });
      return pkgEnv;
    };

    return filterObject(
      {
        files: this.files ? this.files.map(_convertFileToObject) : null,
        mainFile: this.mainFile,
        dists: this.dists ? this.dists.map(_convertFileToObject) : null,
        mainDistFile: this.mainDistFile,
        compiler: this.compiler ? _convertEnvToObject(this.compiler) : null,
        bindingPrefix: this.bindingPrefix || DEFAULT_BINDINGS_PREFIX,
        ignoreSharedDir: this.ignoreSharedDir,
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
        dependencies: this.dependencies.cloneAsObject(),
        devDependencies: this.devDependencies.cloneAsObject(),
        compilerDependencies: this.compilerDependencies.cloneAsObject(),
        testerDependencies: this.testerDependencies.cloneAsObject(),
        flattenedDependencies: this.flattenedDependencies.map(dep => dep.serialize()),
        flattenedDevDependencies: this.flattenedDevDependencies.map(dep => dep.serialize()),
        flattenedCompilerDependencies: this.flattenedCompilerDependencies.map(dep => dep.serialize()),
        flattenedTesterDependencies: this.flattenedTesterDependencies.map(dep => dep.serialize()),
        extensions: this.extensions.map(ext => {
          const extensionClone = R.clone(ext);
          if (extensionClone.extensionId) {
            // TODO: fix the types of extensions. after this it should be an object not an object id
            // @ts-ignore
            extensionClone.extensionId = ext.extensionId.serialize();
          }
          return extensionClone;
        }),
        packageDependencies: this.packageDependencies,
        devPackageDependencies: this.devPackageDependencies,
        peerPackageDependencies: this.peerPackageDependencies,
        compilerPackageDependencies: _removeEmptyPackagesEnvs(this.compilerPackageDependencies),
        testerPackageDependencies: _removeEmptyPackagesEnvs(this.testerPackageDependencies),
        customResolvedPaths: this.customResolvedPaths,
        overrides: this.overrides,
        packageJsonChangedProps: this.packageJsonChangedProps
      },
      val => !!val
    );
  }

  validateBeforePersisting(versionStr: string): void {
    logger.silly(`validating version object, hash: ${this.hash().hash}`);
    const version = Version.parse(versionStr);
    version.validate();
  }

  toBuffer(pretty: boolean): Buffer {
    const obj = this.toObject();
    const args = getStringifyArgs(pretty);
    const str = JSON.stringify(obj, ...args);
    if (this.validateBeforePersist) this.validateBeforePersisting(str);
    return Buffer.from(str);
  }

  /**
   * used by the super class BitObject
   */
  static parse(contents: string): Version {
    const {
      mainFile,
      dists,
      mainDistFile,
      files,
      compiler,
      bindingPrefix,
      ignoreSharedDir,
      tester,
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
      customResolvedPaths,
      overrides,
      packageJsonChangedProps,
      extensions
    } = JSON.parse(contents);
    const _getDependencies = (deps = []): Dependency[] => {
      if (deps.length && R.is(String, first(deps))) {
        // backward compatibility
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        return deps.map(dependency => ({ id: BitId.parseObsolete(dependency) }));
      }

      const getRelativePath = relativePath => {
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

      return deps.map((dependency: any) => {
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

    const parseFile = file => {
      return {
        file: Ref.from(file.file),
        relativePath: file.relativePath,
        name: file.name,
        test: file.test
      };
    };
    // @ts-ignore
    const _getExtensions = (exts = []): ExtensionDataList => {
      if (exts.length) {
        const newExts = exts.map((extension: any) => {
          if (extension.extensionId) {
            const extensionId = new BitId(extension.extensionId);
            const entry = new ExtensionDataEntry(undefined, extensionId, undefined, extension.config, extension.data);
            return entry;
          }
          const entry = new ExtensionDataEntry(
            extension.id,
            undefined,
            extension.name,
            extension.config,
            extension.data
          );
          return entry;
        });
        return ExtensionDataList.fromArray(newExts);
      }
      return new ExtensionDataList();
    };

    return new Version({
      mainFile,
      files: files ? files.map(parseFile) : null,
      dists: dists ? dists.map(parseFile) : null,
      mainDistFile,
      compiler: compiler ? parseEnv(compiler) : null,
      bindingPrefix: bindingPrefix || null,
      ignoreSharedDir: ignoreSharedDir || undefined,
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
      customResolvedPaths,
      overrides,
      packageJsonChangedProps,
      extensions: _getExtensions(extensions)
    });
  }

  /**
   * used by raw-object.toRealObject()
   */
  static from(versionProps: VersionProps): Version {
    return Version.parse(JSON.stringify(versionProps));
  }

  /**
   * Create version model object from consumer component
   * @param {*} param0
   */
  static fromComponent({
    component,
    files,
    dists,
    mainDistFile,
    flattenedDependencies,
    flattenedDevDependencies,
    flattenedCompilerDependencies,
    flattenedTesterDependencies,
    message,
    specsResults,
    username,
    email
  }: {
    component: ConsumerComponent;
    files: Array<SourceFileModel>;
    flattenedDependencies: BitIds;
    flattenedDevDependencies: BitIds;
    flattenedCompilerDependencies: BitIds;
    flattenedTesterDependencies: BitIds;
    message: string;
    dists: Array<DistFileModel> | undefined;
    mainDistFile: PathLinuxRelative;
    specsResults: Results | undefined;
    username: string | undefined;
    email: string | undefined;
  }) {
    const parseFile = file => {
      return {
        file: file.file.hash(),
        relativePath: file.relativePath,
        name: file.name,
        test: file.test
      };
    };

    const compiler = component.compiler ? component.compiler.toModelObject() : undefined;
    const tester = component.tester ? component.tester.toModelObject() : undefined;

    const compilerDynamicPakageDependencies = component.compiler
      ? component.compiler.dynamicPackageDependencies
      : undefined;
    const testerDynamicPakageDependencies = component.tester ? component.tester.dynamicPackageDependencies : undefined;
    return new Version({
      mainFile: component.mainFile,
      files: files.map(parseFile),
      dists: dists ? dists.map(parseFile) : undefined,
      mainDistFile,
      compiler,
      bindingPrefix: component.bindingPrefix,
      tester,
      log: {
        message,
        username,
        email,
        date: Date.now().toString()
      },
      specsResults,
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      docs: component.docs,
      dependencies: component.dependencies.get(),
      devDependencies: component.devDependencies.get(),
      compilerDependencies: component.compilerDependencies.get(),
      testerDependencies: component.testerDependencies.get(),
      packageDependencies: component.packageDependencies,
      devPackageDependencies: component.devPackageDependencies,
      peerPackageDependencies: component.peerPackageDependencies,
      compilerPackageDependencies: R.mergeDeepRight(
        component.compilerPackageDependencies || {},
        compilerDynamicPakageDependencies || {}
      ),
      testerPackageDependencies: R.mergeDeepRight(
        component.testerPackageDependencies || {},
        testerDynamicPakageDependencies || {}
      ),
      flattenedDependencies,
      flattenedDevDependencies,
      flattenedCompilerDependencies,
      flattenedTesterDependencies,
      ignoreSharedDir: component.ignoreSharedDir,
      customResolvedPaths: component.customResolvedPaths,
      overrides: component.overrides.componentOverridesData,
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      packageJsonChangedProps: component.packageJsonChangedProps,
      extensions: component.extensions
    });
  }

  setSpecsResults(specsResults: Results | undefined) {
    this.specsResults = specsResults;
  }

  setDist(dist: Source | undefined) {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
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
    validateVersionInstance(this);
  }
}

function parseEnv(env) {
  if (typeof env === 'string') {
    return env;
  }
  // Store the env as string in case there is no config and files (for backward compatibility)
  if (envNameOnly(env)) {
    return env.name;
  }
  return {
    name: env.name,
    config: env.config
  };
}

function envNameOnly(env) {
  if ((!env.config || R.isEmpty(env.config)) && (!env.files || R.isEmpty(env.files))) {
    return true;
  }
  return false;
}
