/** @flow */
import { Ref, BitObject } from '../objects';

export type VersionProps = {
  version: number;
  impl: {
    name: string,
    file: Ref
  };
  specs?: {
    name: string,
    file: Ref
  };
  compiler?: ?Ref;
  tester?: ?Ref;
  dependencies?: Ref[];
  flattenedDepepdencies?: Ref[];
  packageDependencies?: {[string]: string}; 
  buildStatus?: boolean;
  testStatus?: boolean;
}

export default class Version extends BitObject {
  version: number;
  impl: Ref;
  specs: ?Ref;
  compiler: ?Ref;
  tester: ?Ref;
  dependencies: Ref[];
  flattenedDepepdencies: Ref[];
  packageDependencies: {[string]: string};
  buildStatus: ?boolean;
  testStatus: ?boolean;

  constructor(props: VersionProps) {
    super();
    this.version = props.version;
    this.impl = props.impl;
    this.specs = props.specs;
    this.compiler = props.compiler;
    this.tester = props.tester;
    this.dependencies = props.dependencies || [];
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
      version: this.version.toString(),
      impl: this.impl.toString(),
      specs: this.specs ? this.specs.toString(): '',
      compiler: this.compiler ? this.compiler.toString(): '',
      tester: this.tester ? this.tester.toString(): '',
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
    return new Version(JSON.parse(contents));
  }

  static fromComponent(component: Component) {
    
  }
}
