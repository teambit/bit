/** @flow */
import { Ref, BitObject } from '../objects';
import Scope from '../scope';
import Source from './source';
import ConsumerComponent from '../../consumer/component';
import Component from './component';
import { Remotes } from '../../remotes';
import { BitIds, BitId } from '../../bit-id';
import ComponentVersion from '../component-version';
import type { ParsedDocs } from '../../jsdoc/parser';
import { DEFAULT_BUNDLE_FILENAME } from '../../constants';

export type VersionProps = {
  impl: {
    name: string,
    file: Ref
  };
  specs?: ?{
    name: string,
    file: Ref
  };
  dist?: ?{
    name: string,
    file: Ref
  };
  compiler?: ?BitId;
  tester?: ?BitId;
  log: {
    message: string,
    date: string
  };
  docs?: ParsedDocs[],
  dependencies?: BitIds;
  flattenedDependencies?: BitIds;
  packageDependencies?: {[string]: string};
}

export default class Version extends BitObject {
  impl: {
    name: string,
    file: Ref
  };
  specs: ?{
    name: string,
    file: Ref
  };
  dist: ?{
    name: string,
    file: Ref
  };
  compiler: ?BitId;
  tester: ?BitId;
  log: {
    message: string,
    date: string
  };
  docs: ?ParsedDocs[];
  dependencies: BitIds;
  flattenedDependencies: BitIds;
  packageDependencies: {[string]: string};

  constructor(props: VersionProps) {
    super();
    this.impl = props.impl;
    this.specs = props.specs;
    this.dist = props.dist;
    this.compiler = props.compiler;
    this.tester = props.tester;
    this.log = props.log;
    this.dependencies = props.dependencies || new BitIds();
    this.docs = props.docs;
    this.flattenedDependencies = props.flattenedDependencies || new BitIds();
    this.packageDependencies = props.packageDependencies || {};
  }

  id() {
    return JSON.stringify(this.toObject());
  }

  collectDependencies(scope: Scope): Promise<ComponentVersion[]> {
    return scope.importManyOnes(this.flattenedDependencies);
  }

  refs(): Ref[] {
    return [
      this.impl.file,
      // $FlowFixMe
      this.specs ? this.specs.file : null,
      // $FlowFixMe (after filtering the nulls there is no problem)
      this.dist ? this.dist.file : null,
    ].filter(ref => ref);
  }

  toObject() {
    return {
      impl: {
        file: this.impl.file.toString(),
        name: this.impl.name
      },
      specs: this.specs ? {
        file: this.specs.file.toString(),
        // $FlowFixMe
        name: this.specs.name        
      }: null,
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
      },
      docs: this.docs,
      dependencies: this.dependencies.map(dep => dep.toString()),
      flattenedDependencies: this.flattenedDependencies.map(dep => dep.toString()),
      packageDependencies: this.packageDependencies
    };
  }

  toBuffer(): Buffer {
    const obj = this.toObject();
    return Buffer.from(JSON.stringify(obj));
  }

  static parse(contents) {
    const {
      impl,
      specs,
      dist,
      compiler,
      tester,
      log,
      docs,
      dependencies,
      flattenedDependencies,
      packageDependencies
    } = JSON.parse(contents);

    return new Version({
      impl: {
        file: Ref.from(impl.file),
        name: impl.name
      },
      specs: specs ? {
        file: Ref.from(specs.file),
        name: specs.name        
      } : null,
      dist: dist ? {
        file: Ref.from(dist.file),
        name: dist.name        
      } : null,
      compiler: compiler ? BitId.parse(compiler) : null,
      tester: tester ? BitId.parse(tester) : null,
      log: {
        message: log.message,
        date: log.date,
      },
      docs,
      dependencies: BitIds.deserialize(dependencies),
      flattenedDependencies: BitIds.deserialize(flattenedDependencies),
      packageDependencies,
    });
  }

  static fromComponent({ component, impl, specs, dist, flattenedDeps, message }: {
    component: ConsumerComponent,
    impl: Source,
    specs: Source,
    flattenedDeps: BitId[],
    message: string,
    dist: Source
  }) {
    return new Version({
      impl: {
        file: impl.hash(),
        name: component.implFile
      },
      specs: specs ? {
        file: specs.hash(),
        name: component.specsFile
      }: null,
      dist: dist ? {
        file: dist.hash(),
        name: DEFAULT_BUNDLE_FILENAME,
      }: null,
      compiler: component.compilerId,
      tester: component.testerId,
      log: {
        message,
        date: Date.now().toString(),
      },
      docs: component.docs,
      packageDependencies: component.packageDependencies,
      flattenedDependencies: flattenedDeps,
      dependencies: component.dependencies
    });    
  }
}
