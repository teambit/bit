/** @flow */
import R from 'ramda';
import { BitIds } from '../bit-id';
import { Remotes } from '../remotes';
import { 
  DEFAULT_COMPILER,
  DEFAULT_TESTER,
  DEFAULT_IMPL_NAME,
  DEFAULT_SPEC_NAME,
  DEFAULT_REMOTES,
  DEFAULT_DEPENDENCIES,
  NO_PLUGIN_TYPE,
} from '../constants';

export type AbstractBitJsonProps = {
  impl?: string;
  spec?: string;  
  compiler?: string;
  tester?: string;
  remotes?: Object;
  dependencies?: Object;
};

export default class AbstractBitJson {
  impl: string;
  spec: string; 
  compiler: string;
  tester: string;
  remotes: {[string]: string};
  dependencies: {[string]: string};
  
  constructor({ impl, spec, compiler, tester, dependencies, remotes }: AbstractBitJsonProps) {
    this.impl = impl || DEFAULT_IMPL_NAME;
    this.spec = spec || DEFAULT_SPEC_NAME; 
    this.compiler = compiler || DEFAULT_COMPILER;
    this.tester = tester || DEFAULT_TESTER;
    this.remotes = remotes || DEFAULT_REMOTES;
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

  getRemotes(): Remotes {
    return Remotes.load(this.remotes);
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
      remotes: this.getRemotes().toPlainObject(),
      dependencies: this.dependencies
    };
  }

  static fromPlainObject(object: Object) {
    const { sources, env, remotes, dependencies } = object;
    return new this({
      impl: R.prop('impl', sources),
      spec: R.prop('spec', sources),
      compiler: R.prop('compiler', env),
      tester: R.prop('tester', env),
      remotes,
      dependencies,
    });
  }

  toJson(readable: boolean = true) {
    if (!readable) return JSON.stringify(this.toPlainObject());
    return JSON.stringify(this.toPlainObject(), null, 4);
  }
}
