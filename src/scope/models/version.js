/** @flow */
import { Ref, BitObject } from '../objects';
import Scope from '../scope';
import Source from './source';
import { filterObject } from '../../utils';
import ConsumerComponent from '../../consumer/component';
import { BitIds, BitId } from '../../bit-id';
import ComponentVersion from '../component-version';
import type { Doclet } from '../../jsdoc/parser';
import { DEFAULT_BUNDLE_FILENAME } from '../../constants';
import type { Results } from '../../specs-runner/specs-runner';
import bufferFrom from 'bit/buffer/from';

type CiProps = {
  error: Object,
  startTime: string,
  endTime: string,
};

export type Log = {
  message: string,
  date: string,
  username: ?string,
  email: ?string,
};

export type VersionProps = {
  impl?: ?{
    name: string,
    file: Ref
  };
  specs?: ?{
    name: string,
    file: Ref
  };
  files?: ?Array<{
    name: string,
    file: Ref
  }>;
  dist?: ?{
    name: string,
    file: Ref
  };
  compiler?: ?BitId;
  tester?: ?BitId;
  log: Log;
  ci?: CiProps;
  specsResults?: ?Results;
  docs?: Doclet[],
  dependencies?: BitIds;
  flattenedDependencies?: BitIds;
  packageDependencies?: {[string]: string};
}

export default class Version extends BitObject {
  /** @deprecated **/
  impl: ?{
    name: string,
    file: Ref
  };
  /** @deprecated **/
  specs: ?{
    name: string,
    file: Ref
  };
  mainFileName: string;
  testsFileNames: string[];
  files: ?Array<{
    name: string,
    file: Ref
  }>;
  dist: ?{
    name: string,
    file: Ref
  };
  compiler: ?BitId;
  tester: ?BitId;
  log: Log;
  ci: CiProps|{};
  specsResults: ?Results;
  docs: ?Doclet[];
  dependencies: BitIds;
  flattenedDependencies: BitIds;
  packageDependencies: {[string]: string};

  constructor({
    impl,
    specs,
    mainFileName,
    testsFileNames,
    files,
    dist,
    compiler,
    tester,
    log,
    dependencies,
    docs,
    ci,
    specsResults,
    flattenedDependencies,
    packageDependencies
  }: VersionProps) {
    super();
    this.impl = impl;
    this.specs = specs;
    this.mainFileName = mainFileName;
    this.testsFileNames = testsFileNames;
    this.files = files;
    this.dist = dist;
    this.compiler = compiler;
    this.tester = tester;
    this.log = log;
    this.dependencies = dependencies || new BitIds();
    this.docs = docs;
    this.ci = ci || {};
    this.specsResults = specsResults;
    this.flattenedDependencies = flattenedDependencies || new BitIds();
    this.packageDependencies = packageDependencies || {};
  }

  id() {
    const obj = this.toObject();

    return JSON.stringify(filterObject({
      impl: obj.impl,
      specs: obj.specs,
      mainFileName: obj.mainFileName,
      testsFileNames: obj.testsFileNames,
      files: obj.files,
      compiler: this.compiler ? this.compiler.toString(): null,
      tester: this.tester ? this.tester.toString(): null,
      log: obj.log,
      dependencies: this.dependencies.map(dep => dep.toString()),
      packageDependencies: this.packageDependencies
    }, val => !!val));
  }

  collectDependencies(scope: Scope, withDevDependencies?: bool): Promise<ComponentVersion[]> {
    const devDependencies = [ this.compiler, this.tester ];
    const allDependencies = withDevDependencies ?
    this.flattenedDependencies.concat(devDependencies) : this.flattenedDependencies;
    return scope.importManyOnes(allDependencies, true);
  }

  refs(): Ref[] {
    const files = this.files ? this.files.map(file => file.file) : [];
    return [
      this.impl ? this.impl.file : null,
      // $FlowFixMe
      this.specs ? this.specs.file : null,
      // $FlowFixMe (after filtering the nulls there is no problem)
      this.dist ? this.dist.file : null,
      ...files,
    ].filter(ref => ref);
  }

  toObject() {
    return filterObject({
      impl: this.impl ? {
        file: this.impl.file.toString(),
        name: this.impl.name
      } : null,
      specs: this.specs ? {
        file: this.specs.file.toString(),
        // $FlowFixMe
        name: this.specs.name
      }: null,
      files: this.files ? this.files.map((file) => {
        return {
          file: file.file.toString(),
          name: file.name
        };
      }) : null,
      mainFileName: this.mainFileName,
      testsFileNames: this.testsFileNames,
      dist: this.dist ? {
        file: this.dist.file.toString(),
        // $FlowFixMe
        name: this.dist.name
      }: null,
      compiler: this.compiler ? this.compiler.toString(): null,
      tester: this.tester ? this.tester.toString(): null,
      log: {
        message: this.log.message,
        date: this.log.date,
        username: this.log.username,
        email: this.log.email,
      },
      ci: this.ci,
      specsResults: this.specsResults,
      docs: this.docs,
      dependencies: this.dependencies.map(dep => dep.toString()),
      flattenedDependencies: this.flattenedDependencies.map(dep => dep.toString()),
      packageDependencies: this.packageDependencies
    }, val => !!val);
  }

  toBuffer(): Buffer {
    const obj = this.toObject();
    const str = JSON.stringify(obj);
    return bufferFrom(str);
  }

  static parse(contents) {
    const {
      impl,
      specs,
      mainFileName,
      testsFileNames,
      dist,
      files,
      compiler,
      tester,
      log,
      docs,
      ci,
      specsResults,
      dependencies,
      flattenedDependencies,
      packageDependencies
    } = JSON.parse(contents);

    return new Version({
      impl: impl ? {
        file: Ref.from(impl.file),
        name: impl.name
      } : null,
      specs: specs ? {
        file: Ref.from(specs.file),
        name: specs.name
      } : null,
      mainFileName,
      testsFileNames,
      files: files ? files.map((file) => {
        return { file: Ref.from(file.file), name: file.name };
      }) : null,
      dist: dist ? {
        file: Ref.from(dist.file),
        name: dist.name
      } : null,
      compiler: compiler ? BitId.parse(compiler) : null,
      tester: tester ? BitId.parse(tester) : null,
      log: {
        message: log.message,
        date: log.date,
        username: log.username,
        email: log.email,
      },
      ci,
      specsResults,
      docs,
      dependencies: BitIds.deserialize(dependencies),
      flattenedDependencies: BitIds.deserialize(flattenedDependencies),
      packageDependencies,
    });
  }

  static fromComponent({
    component,
    impl,
    specs,
    files,
    dist,
    flattenedDeps,
    message,
    specsResults,
    username,
    email,
  }: {
    component: ConsumerComponent,
    impl: ?Source,
    specs: ?Source,
    files: ?Array<{name: string, file: Source}>,
    flattenedDeps: BitId[],
    message: string,
    dist: ?Source,
    specsResults: ?Results,
    username: ?string,
    email: ?string,
  }) {
    return new Version({
      impl: impl ? {
        file: impl.hash(),
        name: component.implFile
      }: null,
      specs: specs ? {
        file: specs.hash(),
        name: component.specsFile
      }: null,
      mainFileName: component.mainFileName,
      testsFileNames: component.testsFileNames,
      files: files ? files.map((file) => {
        return { file: file.file.hash(), name: file.name };
      }): null,
      dist: dist ? {
        file: dist.hash(),
        name: DEFAULT_BUNDLE_FILENAME,
      }: null,
      compiler: component.compilerId,
      tester: component.testerId,
      log: {
        message,
        username,
        email,
        date: Date.now().toString(),
      },
      specsResults,
      docs: component.docs,
      packageDependencies: component.packageDependencies,
      flattenedDependencies: flattenedDeps,
      dependencies: component.dependencies
    });
  }

  setSpecsResults(specsResults: ?Results) {
    this.specsResults = specsResults;
  }

  setDist(dist: ?Source) {
    this.dist = dist ? {
      file: dist.hash(),
      name: DEFAULT_BUNDLE_FILENAME,
    }: null;
  }

  setCIProps(ci: CiProps) {
    this.ci = ci;
  }
}
