import R from 'ramda';
import { isHash } from '@teambit/component-version';
import { BitId, BitIds } from '../../bit-id';
import { BuildStatus, DEFAULT_BINDINGS_PREFIX, DEFAULT_BUNDLE_FILENAME, DEPENDENCIES_FIELDS } from '../../constants';
import ConsumerComponent from '../../consumer/component';
import { isSchemaSupport, SchemaFeature, SchemaName } from '../../consumer/component/component-schema';
import { CustomResolvedPath } from '../../consumer/component/consumer-component';
import { Dependencies, Dependency } from '../../consumer/component/dependencies';
import { SourceFile } from '../../consumer/component/sources';
import { getRefsFromExtensions } from '../../consumer/component/sources/artifact-files';
import { ComponentOverridesData } from '../../consumer/config/component-overrides';
import { ExtensionDataEntry, ExtensionDataList } from '../../consumer/config/extension-data';
import { Results } from '../../consumer/specs-results/specs-results';
import { Doclet } from '../../jsdoc/types';
import { CompilerExtensionModel } from '../../legacy-extensions/compiler-extension';
import { EnvPackages } from '../../legacy-extensions/env-extension';
import { TesterExtensionModel } from '../../legacy-extensions/tester-extension';
import logger from '../../logger/logger';
import { filterObject, first, getStringifyArgs } from '../../utils';
import { PathLinux, PathLinuxRelative } from '../../utils/path';
import VersionInvalid from '../exceptions/version-invalid';
import { BitObject, Ref } from '../objects';
import { ObjectItem } from '../objects/object-list';
import Repository from '../objects/repository';
import validateVersionInstance from '../version-validator';
import Source from './source';

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
  mainDistFile?: PathLinux | undefined;
  compiler?: CompilerExtensionModel | undefined;
  tester?: TesterExtensionModel | undefined;
  log: Log;
  ci?: CiProps;
  specsResults?: Results | undefined;
  docs?: Doclet[];
  dependencies?: Dependency[];
  devDependencies?: Dependency[];
  flattenedDependencies?: BitIds;
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  packageDependencies?: { [key: string]: string };
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  devPackageDependencies?: { [key: string]: string };
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  peerPackageDependencies?: { [key: string]: string };
  compilerPackageDependencies?: EnvPackages;
  testerPackageDependencies?: EnvPackages;
  bindingPrefix?: string;
  schema?: string;
  customResolvedPaths?: CustomResolvedPath[];
  overrides: ComponentOverridesData;
  packageJsonChangedProps?: Record<string, any>;
  hash?: string;
  parents?: Ref[];
  extensions?: ExtensionDataList;
  buildStatus?: BuildStatus;
  componentId?: BitId;
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
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  packageDependencies: { [key: string]: string };
  devPackageDependencies: { [key: string]: string };
  peerPackageDependencies: { [key: string]: string };
  compilerPackageDependencies: EnvPackages;
  testerPackageDependencies: EnvPackages;
  bindingPrefix: string | undefined;
  schema: string | undefined;
  customResolvedPaths: CustomResolvedPath[] | undefined;
  overrides: ComponentOverridesData;
  packageJsonChangedProps: Record<string, any>;
  _hash: string; // reason for the underscore prefix is that we already have hash as a method
  parents: Ref[];
  extensions: ExtensionDataList;
  buildStatus?: BuildStatus;
  componentId?: BitId; // can help debugging errors when validating Version object

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
    // @ts-ignore yes, props.hash can be undefined here, but it gets populated as soon as Version is created
    this._hash = props.hash;
    this.parents = props.parents || [];
    this.extensions = props.extensions || ExtensionDataList.fromArray([]);
    this.buildStatus = props.buildStatus;
    this.componentId = props.componentId;
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
    const getDependencies = (deps: Dependencies) => {
      const clonedDependencies = deps.cloneAsString();
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      return clonedDependencies.map((dependency: Dependency) => {
        return {
          id: dependency.id,
          relativePaths: dependency.relativePaths.map((relativePath) => {
            return {
              sourceRelativePath: relativePath.sourceRelativePath,
              destinationRelativePath: relativePath.destinationRelativePath,
            };
          }),
        };
      });
    };

    const getExtensions = (extensions: ExtensionDataList) => {
      const sortedConfigOnly = extensions.sortById().toConfigArray();
      return sortedConfigOnly;
    };

    const filterFunction = (val, key) => {
      if (
        key === 'devDependencies' ||
        key === 'devPackageDependencies' ||
        key === 'peerPackageDependencies' ||
        key === 'overrides' ||
        key === 'extensions'
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
          overrides: obj.overrides,
          extensions: getExtensions(this.extensions),
        },
        filterFunction
      )
    );
  }

  calculateHash(): Ref {
    return new Ref(BitObject.makeHash(this.id()));
  }

  hash(): Ref {
    if (!this._hash) {
      throw new Error('hash is missing from a Version object');
    }
    return new Ref(this._hash);
  }

  get extensionDependencies() {
    return new Dependencies(this.extensions.extensionsBitIds.map((id) => new Dependency(id, [])));
  }

  getAllFlattenedDependencies(): BitIds {
    return BitIds.fromArray([...this.flattenedDependencies]);
  }

  getAllDependencies(): Dependency[] {
    return [
      ...this.dependencies.dependencies,
      ...this.devDependencies.dependencies,
      ...this.extensionDependencies.dependencies,
    ];
  }

  get depsIdsGroupedByType(): { dependencies: BitIds; devDependencies: BitIds; extensionDependencies: BitIds } {
    return {
      dependencies: this.dependencies.getAllIds(),
      devDependencies: this.devDependencies.getAllIds(),
      extensionDependencies: this.extensions.extensionsBitIds,
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
      const updatedIds = flattenedDependencies.map((depId) => {
        if (depId.isEqual(currentId)) return newId;
        return depId;
      });
      return BitIds.fromArray(updatedIds);
    };
    this.flattenedDependencies = getUpdated(this.flattenedDependencies);
  }

  refs(): Ref[] {
    return this.refsWithOptions();
  }

  refsWithOptions(includeParents = true, includeArtifacts = true): Ref[] {
    const allRefs: Ref[] = [];
    const extractRefsFromFiles = (files) => {
      const refs = files ? files.map((file) => file.file) : [];
      return refs;
    };
    const files = extractRefsFromFiles(this.files);
    const dists = extractRefsFromFiles(this.dists);
    allRefs.push(...files);
    allRefs.push(...dists);
    if (includeParents) {
      allRefs.push(...this.parents);
    }
    if (includeArtifacts) {
      const artifacts = getRefsFromExtensions(this.extensions);
      allRefs.push(...artifacts);
    }
    return allRefs;
  }

  refsWithoutParents(): Ref[] {
    const extractRefsFromFiles = (files) => {
      const refs = files ? files.map((file) => file.file) : [];
      return refs;
    };
    const files = extractRefsFromFiles(this.files);
    const dists = extractRefsFromFiles(this.dists);
    const artifacts = getRefsFromExtensions(this.extensions);
    return [...dists, ...files, ...artifacts].filter((ref) => ref);
  }

  async collectManyObjects(repo: Repository, refs: Ref[]): Promise<ObjectItem[]> {
    return repo.loadManyRaw(refs);
  }

  toObject() {
    const _convertFileToObject = (file) => {
      return {
        file: file.file.toString(),
        relativePath: file.relativePath,
        name: file.name,
        test: file.test,
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
        files: [],
      };
      return result;
    };

    const _removeEmptyPackagesEnvs = (pkgEnv) => {
      DEPENDENCIES_FIELDS.forEach((dependencyType) => {
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
          email: this.log.email,
        },
        ci: this.ci,
        specsResults: this.specsResults,
        docs: this.docs,
        dependencies: this.dependencies.cloneAsObject(),
        devDependencies: this.devDependencies.cloneAsObject(),
        flattenedDependencies: this.flattenedDependencies.map((dep) => dep.serialize()),
        extensions: this.extensions.toModelObjects(),
        packageDependencies: this.packageDependencies,
        devPackageDependencies: this.devPackageDependencies,
        peerPackageDependencies: this.peerPackageDependencies,
        compilerPackageDependencies: _removeEmptyPackagesEnvs(this.compilerPackageDependencies),
        testerPackageDependencies: _removeEmptyPackagesEnvs(this.testerPackageDependencies),
        customResolvedPaths: this.customResolvedPaths,
        overrides: this.overrides,
        buildStatus: this.buildStatus,
        packageJsonChangedProps: this.packageJsonChangedProps,
        parents: this.parents.map((p) => p.toString()),
      },
      (val) => !!val
    );
  }

  validateBeforePersisting(versionStr: string): void {
    logger.trace(`validating version object, hash: ${this.hash().hash}`);
    const version = Version.parse(versionStr, this._hash);
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
  static parse(contents: string, hash: string): Version {
    const contentParsed = JSON.parse(contents);
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
      extensions,
      buildStatus,
      parents,
    } = contentParsed;

    const _getDependencies = (deps = []): Dependency[] => {
      if (deps.length && R.is(String, first(deps))) {
        // backward compatibility
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        return deps.map((dependency) => ({ id: BitId.parseObsolete(dependency) }));
      }

      const getRelativePath = (relativePath) => {
        if (relativePath.importSpecifiers) {
          // backward compatibility. Before the massive validation was added, an item of
          // relativePath.importSpecifiers array could be missing the mainFile property, which is
          // an invalid ImportSpecifier. (instead the mainFile it had another importSpecifiers object).
          relativePath.importSpecifiers = relativePath.importSpecifiers.filter(
            (importSpecifier) => importSpecifier.mainFile
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
            : dependency.relativePaths,
        };
      });
    };

    const _getFlattenedDependencies = (deps = []): BitId[] => {
      return deps.map((dep) => BitId.parseBackwardCompatible(dep));
    };

    const _groupFlattenedDependencies = () => {
      // support backward compatibility. until v15, there was both flattenedDependencies and
      // flattenedDevDependencies. since then, these both were grouped to one flattenedDependencies
      const flattenedDeps = _getFlattenedDependencies(flattenedDependencies);
      const flattenedDevDeps = _getFlattenedDependencies(flattenedDevDependencies);
      return BitIds.fromArray([...flattenedDeps, ...flattenedDevDeps]);
    };

    const parseFile = (file) => {
      return {
        file: Ref.from(file.file),
        relativePath: file.relativePath,
        name: file.name,
        test: file.test,
      };
    };
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
        return ExtensionDataList.fromModelObject(newExts);
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
        email: log.email,
      },
      ci,
      specsResults,
      docs,
      dependencies: _getDependencies(dependencies),
      devDependencies: _getDependencies(devDependencies),
      flattenedDependencies: _groupFlattenedDependencies(),
      devPackageDependencies,
      peerPackageDependencies,
      compilerPackageDependencies,
      testerPackageDependencies,
      packageDependencies,
      customResolvedPaths,
      overrides,
      packageJsonChangedProps,
      hash,
      parents: parents ? parents.map((p) => Ref.from(p)) : [],
      extensions: _getExtensions(extensions),
      buildStatus,
    });
  }

  /**
   * used by raw-object.toRealObject()
   */
  static from(versionProps: VersionProps, hash: string): Version {
    return Version.parse(JSON.stringify(versionProps), hash);
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
  }: {
    component: ConsumerComponent;
    files: Array<SourceFileModel>;
    dists?: Array<DistFileModel> | undefined;
    mainDistFile?: PathLinuxRelative;
  }) {
    const parseFile = (file) => {
      return {
        file: file.file.hash(),
        relativePath: file.relativePath,
        name: file.name,
        test: file.test,
      };
    };

    const compiler = component.compiler ? component.compiler.toModelObject() : undefined;
    const tester = component.tester ? component.tester.toModelObject() : undefined;

    const compilerDynamicPakageDependencies = component.compiler
      ? component.compiler.dynamicPackageDependencies
      : undefined;
    const testerDynamicPakageDependencies = component.tester ? component.tester.dynamicPackageDependencies : undefined;
    if (!component.log) throw new Error('Version.fromComponent - component.log is missing');
    const version = new Version({
      mainFile: component.mainFile,
      files: files.map(parseFile),
      dists: dists ? dists.map(parseFile) : undefined,
      mainDistFile,
      compiler,
      bindingPrefix: component.bindingPrefix,
      tester,
      log: component.log as Log,
      specsResults: (component.specsResults as any) as Results,
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
      flattenedDependencies: component.flattenedDependencies,
      schema: component.schema,
      customResolvedPaths: component.customResolvedPaths,
      overrides: component.overrides.componentOverridesData,
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      packageJsonChangedProps: component.packageJsonChangedProps,
      extensions: component.extensions,
      buildStatus: component.buildStatus,
      componentId: component.id,
    });
    if (isHash(component.version)) {
      version._hash = component.version as string;
    } else {
      version.setNewHash();
    }

    return version;
  }

  setNewHash() {
    // @todo: after v15 is deployed, this can be changed to generate a random uuid
    this._hash = this.calculateHash().toString();
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
          name: DEFAULT_BUNDLE_FILENAME,
        }
      : null;
  }

  setCIProps(ci: CiProps) {
    this.ci = ci;
  }

  hasParent(ref: Ref) {
    return this.parents.find((p) => p.toString() === ref.toString());
  }

  addParent(ref: Ref) {
    if (this.isLegacy) return;
    if (this.hasParent(ref)) {
      return; // make sure to not add twice
    }
    this.parents.push(ref);
  }

  addAsOnlyParent(ref: Ref) {
    if (this.isLegacy) return;
    this.parents = [ref];
  }

  removeParent(ref: Ref) {
    this.parents = this.parents.filter((p) => p.toString() !== ref.toString());
  }

  modelFilesToSourceFiles(repository: Repository): Promise<SourceFile[]> {
    return Promise.all(this.files.map((file) => SourceFile.loadFromSourceFileModel(file, repository)));
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
    config: env.config,
  };
}

function envNameOnly(env) {
  if ((!env.config || R.isEmpty(env.config)) && (!env.files || R.isEmpty(env.files))) {
    return true;
  }
  return false;
}
