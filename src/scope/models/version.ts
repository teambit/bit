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
import { SchemaFeature, isSchemaSupport, SchemaName } from '../../consumer/component/component-schema';

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

export type ArtifactFileModel = {
  relativePath: PathLinux;
  file: Ref;
};

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
  flattenedDependencies?: BitIds;
  flattenedDevDependencies?: BitIds;
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
  schema?: string;
  customResolvedPaths?: CustomResolvedPath[];
  overrides: ComponentOverridesData;
  packageJsonChangedProps?: Record<string, any>;
  extensions?: ExtensionDataList;
};

/**
 * Represent a version model in the scope
 */
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
  flattenedDependencies: BitIds;
  flattenedDevDependencies: BitIds;
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
  schema: string | undefined;
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
    this.docs = props.docs;
    this.ci = props.ci || {};
    this.specsResults = props.specsResults;
    this.flattenedDependencies = props.flattenedDependencies || new BitIds();
    this.flattenedDevDependencies = props.flattenedDevDependencies || new BitIds();
    this.packageDependencies = props.packageDependencies || {};
    this.devPackageDependencies = props.devPackageDependencies || {};
    this.peerPackageDependencies = props.peerPackageDependencies || {};
    this.compilerPackageDependencies = props.compilerPackageDependencies || {};
    this.testerPackageDependencies = props.testerPackageDependencies || {};
    this.bindingPrefix = props.bindingPrefix;
    this.schema = props.schema;
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
    return BitIds.fromArray([...this.flattenedDependencies, ...this.flattenedDevDependencies]);
  }

  getAllDependencies(): Dependency[] {
    return [
      ...this.dependencies.dependencies,
      ...this.devDependencies.dependencies,
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
    const dependencies = [...this.dependencies.getClone(), ...this.devDependencies.getClone()];
    return new Dependencies(dependencies);
  }

  getAllDependenciesIds(): BitIds {
    const allDependencies = R.flatten(Object.values(this.depsIdsGroupedByType));
    return BitIds.fromArray(allDependencies);
  }

  getDependenciesIdsExcludeExtensions(): BitIds {
    return BitIds.fromArray([...this.dependencies.getAllIds(), ...this.devDependencies.getAllIds()]);
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
  }

  refs(): Ref[] {
    const extractRefsFromFiles = files => {
      const refs = files ? files.map(file => file.file) : [];
      return refs;
    };
    const files = extractRefsFromFiles(this.files);
    const dists = extractRefsFromFiles(this.dists);
    const artifacts = extractRefsFromFiles(R.flatten(this.extensions.map(e => e.artifacts)));
    return [...dists, ...files, ...artifacts].filter(ref => ref);
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
        schema: this.schema,
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
        flattenedDependencies: this.flattenedDependencies.map(dep => dep.serialize()),
        flattenedDevDependencies: this.flattenedDevDependencies.map(dep => dep.serialize()),
        extensions: this.extensions.map(ext => {
          const extensionClone = ext.clone();
          if (extensionClone.extensionId) {
            // TODO: fix the types of extensions. after this it should be an object not an object id
            // @ts-ignore
            extensionClone.extensionId = ext.extensionId.serialize();
          }
          extensionClone.artifacts = extensionClone.artifacts.map(file => ({
            file: file.file.toString(),
            relativePath: file.relativePath
          }));
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
      schema,
      tester,
      log,
      docs,
      ci,
      specsResults,
      dependencies,
      devDependencies,
      flattenedDependencies,
      flattenedDevDependencies,
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
          const artifacts = (extension.artifacts || []).map(a => ({
            file: Ref.from(a.file),
            relativePath: a.relativePath
          }));
          const entry = new ExtensionDataEntry(
            extension.id,
            undefined,
            extension.name,
            extension.config,
            extension.data,
            artifacts
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
      schema: schema || undefined,
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
      flattenedDependencies: _getFlattenedDependencies(flattenedDependencies),
      flattenedDevDependencies: _getFlattenedDependencies(flattenedDevDependencies),
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
    message,
    specsResults,
    extensions,
    username,
    email
  }: {
    component: ConsumerComponent;
    files: Array<SourceFileModel>;
    flattenedDependencies: BitIds;
    flattenedDevDependencies: BitIds;
    message: string;
    dists: Array<DistFileModel> | undefined;
    mainDistFile: PathLinuxRelative;
    specsResults: Results | undefined;
    extensions: ExtensionDataList;
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

    const parseComponentExtensions = () => {
      const extensionsCloned = extensions;
      extensionsCloned.forEach(extensionDataEntry => {
        extensionDataEntry.artifacts = extensionDataEntry.artifacts.map(artifact => {
          return {
            file: artifact.file.hash(),
            relativePath: artifact.relativePath
          };
        });
      });
      return extensionsCloned;
    };

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
      schema: component.schema,
      customResolvedPaths: component.customResolvedPaths,
      overrides: component.overrides.componentOverridesData,
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      packageJsonChangedProps: component.packageJsonChangedProps,
      extensions: parseComponentExtensions()
    });
  }

  get ignoreSharedDir(): boolean {
    return !isSchemaSupport(SchemaFeature.sharedDir, this.schema);
  }

  get isLegacy(): boolean {
    return !this.schema || this.schema === SchemaName.Legacy;
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
