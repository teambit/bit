/** @flow */
import { Ref, BitObject } from '../objects';
import Source from './source';
import ConsumerComponent from '../../consumer/bit-component';
import Component from './component';
import BitId from '../../bit-id/bit-id';

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
  dependencies?: BitId[];
  flattenedDepepdencies?: Ref[];
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
  dependencies: BitId[];
  flattenedDepepdencies: Ref[];
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
    this.dependencies = props.dependencies || [];
    this.dist = props.dist;
    this.flattenedDepepdencies = props.flattenedDepepdencies || [];
    this.packageDependencies = props.packageDependencies || {};
    this.buildStatus = props.buildStatus;
    this.testStatus = props.testStatus;
  }

  id() {
    return JSON.stringify(this.toObject());
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
      dependencies: this.dependencies.map(dep => dep.toString()),
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
      dependencies: props.dependencies.map(dep => dep.toString()),
      packageDependencies: props.packageDependencies,
      buildStatus: props.buildStatus,
      testStatus: props.testStatus
    });
  }

  static fromComponent(component: ConsumerComponent, impl: Source, specs: Source) {
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
      packageDependencies: component.packageDependencies,
      dependencies: []
    });    
  }
}
