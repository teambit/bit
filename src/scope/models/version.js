/** @flow */
import R from 'ramda';
import { Ref, BitObject } from '../objects';
import Scope from '../scope';
import Source from './source';
import { filterObject, first, bufferFrom, getStringifyArgs } from '../../utils';
import ConsumerComponent from '../../consumer/component';
import { BitIds, BitId } from '../../bit-id';
import ComponentVersion from '../component-version';
import type { Doclet } from '../../jsdoc/parser';
import { DEFAULT_BUNDLE_FILENAME, DEFAULT_BINDINGS_PREFIX } from '../../constants';
import type { Results } from '../../specs-runner/specs-runner';
import { Dependencies } from '../../consumer/component/dependencies';
import type { PathLinux } from '../../utils/path';

type CiProps = {
  error: Object,
  startTime: string,
  endTime: string
};

type SourceFile = {
  name: string,
  relativePath: PathLinux,
  test: boolean,
  file: Ref
};

type DistFile = SourceFile;

export type Log = {
  message: string,
  date: string,
  username: ?string,
  email: ?string
};

export type VersionProps = {
  files?: ?Array<SourceFile>,
  dists?: ?Array<DistFile>,
  compiler?: ?BitId,
  tester?: ?BitId,
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
  bindingPrefix?: string
};

export default class Version extends BitObject {
  mainFile: PathLinux;
  files: Array<SourceFile>;
  dists: ?Array<DistFile>;
  compiler: ?BitId;
  tester: ?BitId;
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
  bindingPrefix: string;

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
    bindingPrefix
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
    this.bindingPrefix = bindingPrefix;
    this.validateVersion();
  }

  validateVersion() {
    const nonEmptyFields = ['mainFile', 'files'];
    nonEmptyFields.forEach((field) => {
      if (!this[field]) throw new Error(`failed creating a version object, the field "${field}" can't be empty`);
    });
  }

  id() {
    const obj = this.toObject();

    // remove importSpecifiers from the ID, it's not needed for the ID calculation.
    // @todo: remove the entire dependencies.relativePaths from the ID (it's going to be a breaking change)

    const getDependencies = (deps) => {
      const dependencies = R.clone(deps);
      if (dependencies && dependencies.length) {
        dependencies.forEach((dependency) => {
          if (dependency.relativePaths && dependency.relativePaths.length) {
            dependency.relativePaths.forEach((relativePath) => {
              if (relativePath.importSpecifiers) delete relativePath.importSpecifiers;
            });
          }
        });
      }
      return dependencies;
    };

    const filterFunction = (val, key) => {
      if (key === 'devDependencies' || key === 'devPackageDependencies' || key === 'peerPackageDependencies') {
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
    return scope.importManyOnes(allDependencies, true);
  }

  refs(): Ref[] {
    const files = this.files ? this.files.map(file => file.file) : [];
    const dists = this.dists ? this.dists.map(dist => dist.file) : [];
    return [...dists, ...files].filter(ref => ref);
  }

  toObject() {
    return filterObject(
      {
        files: this.files
          ? this.files.map((file) => {
            return {
              file: file.file.toString(),
              relativePath: file.relativePath,
              name: file.name,
              test: file.test
            };
          })
          : null,
        mainFile: this.mainFile,
        dists: this.dists
          ? this.dists.map((dist) => {
            return {
              file: dist.file.toString(),
              relativePath: dist.relativePath,
              name: dist.name,
              test: dist.test
            };
          })
          : null,
        compiler: this.compiler ? this.compiler.toString() : null,
        bindingPrefix: this.bindingPrefix || DEFAULT_BINDINGS_PREFIX,
        tester: this.tester ? this.tester.toString() : null,
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
        peerPackageDependencies: this.peerPackageDependencies
      },
      val => !!val
    );
  }

  toBuffer(pretty: boolean): Buffer {
    const obj = this.toObject();
    const args = getStringifyArgs(pretty);
    const str = JSON.stringify(obj, ...args);
    return bufferFrom(str);
  }

  static parse(contents) {
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
      packageDependencies
    } = JSON.parse(contents);
    const getDependencies = (deps = []) => {
      if (deps.length && R.is(String, first(deps))) {
        // backward compatibility
        return deps.map(dependency => ({ id: BitId.parse(dependency) }));
      }

      return deps.map(dependency => ({
        id: BitId.parse(dependency.id),
        relativePaths: dependency.relativePaths
      }));
    };

    return new Version({
      mainFile,
      files: files
        ? files.map((file) => {
          return { file: Ref.from(file.file), relativePath: file.relativePath, name: file.name, test: file.test };
        })
        : null,
      dists: dists
        ? dists.map((dist) => {
          return { file: Ref.from(dist.file), relativePath: dist.relativePath, name: dist.name, test: dist.test };
        })
        : null,
      compiler: compiler ? BitId.parse(compiler) : null,
      bindingPrefix: bindingPrefix || null,
      tester: tester ? BitId.parse(tester) : null,
      log: {
        message: log.message,
        date: log.date,
        username: log.username,
        email: log.email
      },
      ci,
      specsResults,
      docs,
      dependencies: getDependencies(dependencies),
      flattenedDependencies: BitIds.deserialize(flattenedDependencies),
      devDependencies: getDependencies(devDependencies),
      flattenedDevDependencies: BitIds.deserialize(flattenedDevDependencies),
      devPackageDependencies,
      peerPackageDependencies,
      packageDependencies
    });
  }

  static from(versionProps: VersionProps): Version {
    return new Version(versionProps);
  }

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
    files: ?Array<SourceFile>,
    flattenedDependencies: BitId[],
    flattenedDevDependencies: BitId[],
    message: string,
    dists: ?Array<DistFile>,
    specsResults: ?Results,
    username: ?string,
    email: ?string
  }) {
    return new Version({
      mainFile: component.mainFile,
      files: files
        ? files.map((file) => {
          return { file: file.file.hash(), relativePath: file.relativePath, name: file.name, test: file.test };
        })
        : null,
      dists: dists
        ? dists.map((dist) => {
          return { file: dist.file.hash(), relativePath: dist.relativePath, name: dist.name, test: dist.test };
        })
        : null,
      compiler: component.compilerId,
      bindingPrefix: component.bindingPrefix,
      tester: component.testerId,
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
      flattenedDependencies,
      flattenedDevDependencies,
      dependencies: component.dependencies.get(),
      devDependencies: component.devDependencies.get()
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
}
