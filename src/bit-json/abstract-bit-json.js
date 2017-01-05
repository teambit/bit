/** @flow */
import R from 'ramda';
import { BitIds } from '../bit-id';
import { 
  DEFAULT_COMPILER,
  DEFAULT_TESTER,
  DEFAULT_IMPL_NAME,
  DEFAULT_SPEC_NAME,
  DEFAULT_DEPENDENCIES,
  NO_PLUGIN_TYPE,
} from '../constants';

export type AbstractBitJsonProps = {
  impl?: string;
  spec?: string;  
  compiler?: string;
  tester?: string;
  dependencies?: Object;
};

export default class AbstractBitJson {
  impl: string;
  spec: string; 
  compiler: string;
  tester: string;
  dependencies: {[string]: string};
  
  constructor({ impl, spec, compiler, tester, dependencies }: AbstractBitJsonProps) {
    this.impl = impl || DEFAULT_IMPL_NAME;
    this.spec = spec || DEFAULT_SPEC_NAME; 
    this.compiler = compiler || DEFAULT_COMPILER;
    this.tester = tester || DEFAULT_TESTER;
    this.dependencies = dependencies || DEFAULT_DEPENDENCIES;
  }

  addDependency(name: string, version: string) {
    this.dependencies[name] = version;
  }

  removeDependency(name: string) {
    delete this.dependencies[name];
  } 

  hasDependency(name: string) {
    return !!this.dependencies[name];
  }

  getImplBasename(): string { 
    return this.impl;
  }

  setImplBasename(name: string) { 
    this.impl = name;
    return this;
  }

  getSpecBasename(): string { 
    return this.spec;
  }

  setSpecBasename(name: string) { 
    this.spec = name;
    return this;
  }

  getCompilerName(): string { 
    return this.compiler;
  }

  hasCompiler(): boolean {
    return !!this.compiler && this.compiler !== NO_PLUGIN_TYPE;
  }

  getTesterName(): string { 
    return this.tester;
  }

  hasTester(): boolean {
    return !!this.tester && this.tester !== NO_PLUGIN_TYPE;
  }

  getDependencies(): BitIds {
    return BitIds.loadDependencies(this.dependencies);
  }

  toPlainObject(): Object {
    return {
      sources: {
        impl: this.getImplBasename(),
        spec: this.getSpecBasename(),
      },
      env: {
        compiler: this.getCompilerName(),
        tester: this.getTesterName(),
      },
      dependencies: this.dependencies
    };
  }

  toJson(readable: boolean = true) {
    if (!readable) return JSON.stringify(this.toPlainObject());
    return JSON.stringify(this.toPlainObject(), null, 4);
  }
}
