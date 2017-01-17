/** @flow */
import { Ref, BitObject } from '../objects';
import Scope from '../scope';
import Source from './source';
import ConsumerComponent from '../../consumer/component';
import Component from './component';
import { Remotes } from '../../remotes';
import { BitIds, BitId } from '../../bit-id';
import ComponentVersion from '../component-version';

export type VersionProps = {
  impl: {
    name: string,
    file: Ref
  };
  specs?: ?{
    name: string,
    file: Ref
  };
  dist: ?Ref;
  compiler?: ?Ref;
  tester?: ?Ref;
  log: {
    message: string,
    date: string
  };
  dependencies?: BitIds;
  flattenedDependencies?: BitIds;
  packageDependencies?: {[string]: string}; 
  buildStatus?: boolean;
  testStatus?: boolean;
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
  compiler: ?Ref;
  tester: ?Ref;
  log: {
    message: string,
    date: string
  };
  dependencies: BitIds;
  flattenedDependencies: BitIds;
  packageDependencies: {[string]: string};
  buildStatus: ?boolean;
  dist: ?Ref;
  testStatus: ?boolean;

  constructor(props: VersionProps) {
    super();
    this.impl = props.impl;
    this.specs = props.specs;
    this.compiler = props.compiler;
    this.tester = props.tester;
    this.log = props.log;
    this.dependencies = props.dependencies || new BitIds();
    this.dist = props.dist;
    this.flattenedDependencies = props.flattenedDependencies || new BitIds();
    this.packageDependencies = props.packageDependencies || {};
    this.buildStatus = props.buildStatus;
    this.testStatus = props.testStatus;
  }

  flattenDependencies(scope: Scope, remotes: Remotes) {
    this.dependencies.fetch(scope, remotes);
  }

  id() {
    return JSON.stringify(this.toObject());
  }

  collectDependencies(scope: Scope): Promise<ComponentVersion[]> {
    return scope.manyOnes(this.flattenedDependencies);
  }

  refs(): Ref[] {
    return [
      this.impl.file,
      this.specs ? this.specs.file : null,
      this.dist,
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
      compiler: this.compiler ? this.compiler.toString(): null,
      tester: this.tester ? this.tester.toString(): null,
      log: {
        message: this.log.message,
        date: this.log.date,
      },
      dependencies: this.dependencies.map(dep => dep.toString()),
      flattenedDependencies: this.flattenedDependencies.map(dep => dep.toString()),
      packageDependencies: this.packageDependencies,
      buildStatus: this.buildStatus,
      testStatus: this.testStatus
    };
  }

  toBuffer(): Buffer {
    const obj = this.toObject();
    return Buffer.from(JSON.stringify(obj));
  }

  static parse(contents) {
    const props = JSON.parse(contents);
    return new Version({
      impl: {
        file: Ref.from(props.impl.file),
        name: props.impl.name
      },
      specs: props.specs ? {
        file: Ref.from(props.specs.file),
        name: props.specs.name        
      } : null,
      dist: props.dist ? Ref.from(props.dist): null,
      compiler: props.compiler ? Ref.from(props.compiler): null,
      tester: props.tester ? Ref.from(props.tester): null,
      log: {
        message: props.log.message,
        date: props.log.date,
      },
      dependencies: BitIds.deserialize(props.dependencies),
      flattenedDependencies: BitIds.deserialize(props.flattenedDependencies),
      packageDependencies: props.packageDependencies,
      buildStatus: props.buildStatus,
      testStatus: props.testStatus
    });
  }

  static fromComponent(
    component: ConsumerComponent,
    impl: Source,
    specs: Source,
    flattenedDeps: BitId[],
    message: string
  ) {
    return new Version({
      impl: {
        file: impl.hash(),
        name: component.implFile
      },
      specs: specs ? {
        file: specs.hash(),
        name: component.specsFile
      }: null,
      dist: component.build().code,
      compiler: component.compilerId ? Component.fromBitId(component.compilerId).hash() : null,
      tester: component.testerId ? Component.fromBitId(component.testerId).hash() : null,
      log: {
        message,
        date: Date.now().toString(),
      },
      packageDependencies: component.packageDependencies,
      flattenedDependencies: flattenedDeps,
      dependencies: component.dependencies
    });    
  }
}
