/** @flow */
import path from 'path';
import fs from 'fs';
import R from 'ramda';
import { BitIds } from '../bit-id';
import { BitJsonAlreadyExists, BitJsonNotFound } from './exceptions';
import { Remotes } from '../remotes';
import { 
  BIT_JSON,
  DEFAULT_COMPILER,
  DEFAULT_TESTER,
  DEFAULT_BIT_VERSION,
  DEFAULT_BOX_NAME,
  DEFAULT_IMPL_NAME,
  DEFAULT_SPEC_NAME,
  DEFAULT_BIT_NAME,
  NO_PLUGIN_TYPE,
} from '../constants';

function composePath(bitPath: string) {
  return path.join(bitPath, BIT_JSON);
}

function hasExisting(bitPath: string): boolean {
  return fs.existsSync(composePath(bitPath));
}

export type BitJsonProps = {
  name: string;
  box: string;
  version: string;
  sources: {
    impl: string;
    spec: string;  
  };
  env?: {
    compiler?: string;
    tester?: string;
  };
  remotes?: Object;
  dependencies?: Object;
};

export default class BitJson {
  /**
   * dependencies in bit json
   **/
  name: string;
  box: string;
  version: string;
  dependencies: {[string]: string};
  remotes: {[string]: string};
  sources: {
    impl: string;
    spec: string;  
  };
  env: ?{
    compiler?: string;
    tester?: string;
  };

  getPath(bitPath: string) {
    return composePath(bitPath);
  }

  constructor(
    { name, box, version, sources, dependencies, remotes, env }: BitJsonProps
    ) {
    this.name = name;
    this.box = box;
    this.sources = sources;
    this.env = env;
    this.version = version;
    this.remotes = remotes || {};
    this.dependencies = dependencies || {};
  }

  /**
   * add dependency
   */
  addDependency(name: string, version: string) {
    this.dependencies[name] = version;
  }

  /**
   * remove dependency
   */
  removeDependency(name: string) {
    delete this.dependencies[name];
  } 

  /**
   * check whether dependency exists
   */
  hasDependency(name: string) {
    return !!this.dependencies[name];
  }

  /**
   * convert to plain object
   */
  toPlainObject() {
    return {
      name: this.name,
      box: this.box,
      version: this.version,
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
  
  getImplBasename(): string { 
    return this.sources.impl;
  }

  setImplBasename(name: string): BitJson { 
    this.sources = R.merge(this.sources, { impl: name });
    return this;
  }

  getSpecBasename(): string { 
    return this.sources.spec;
  }

  setSpecBasename(name: string): BitJson { 
    this.sources = R.merge(this.sources, { spec: name });
    return this;
  }

  getCompilerName(): string { 
    return this.env && this.env.compiler ? this.env.compiler : NO_PLUGIN_TYPE;
  }

  getTesterName(): string { 
    return this.env && this.env.tester ? this.env.tester : NO_PLUGIN_TYPE;
  }

  getRemotes(): Remotes {
    return Remotes.load(this.remotes);
  }

  getDependencies(): BitIds {
    return BitIds.loadDependencies(this.dependencies);
  }

  /**
   * convert to json
   */  
  toJson(readable: boolean = true) {
    if (!readable) return JSON.stringify(this.toPlainObject());
    return JSON.stringify(this.toPlainObject(), null, 4);
  }

  /**
   * write to file as json
   */
  write({ bitDir, override = true }: { bitDir: string, override?: boolean }): Promise<boolean> {
    return new Promise((resolve, reject) => {
      if (!override && hasExisting(bitDir)) {
        throw new BitJsonAlreadyExists();
      }

      const repspond = (err, res) => {
        if (err) return reject(err);
        return resolve(res);
      };

      fs.writeFile(
        composePath(bitDir),
        this.toJson(),
        repspond
      );
    });
  }

  validate(): boolean {
    return (true
      // typeof this.version === 'number' &&
      // typeof this.compiler === 'string' &&
      // this.remotes.validate() &&
      // typeof this.dependencies === 'object'
    );
  }
  
  // getRemote(name: string) {
    // return this.remotes.get(name);
  // }

  static loadFromRaw(json: Object) {
    return new BitJson(json);
  }

  static create(json = {}) {
    const { name, box } = json;

    const withDefaults = {
      name: name || DEFAULT_BIT_NAME,
      box: box || DEFAULT_BOX_NAME,
      sources: {
        impl: DEFAULT_IMPL_NAME,
        spec: DEFAULT_SPEC_NAME
      },
      env: {
        compiler: DEFAULT_COMPILER,
        tester: DEFAULT_TESTER
      },
      version: DEFAULT_BIT_VERSION,
      remotes: {},
      dependencies: {},
    };
    
    return new BitJson(withDefaults);
  }
  
  static loadWithPrototypeAndAutoDetect(dirPath: string, protoBJ: BitJson) {
    return new Promise((resolve, reject) => {
      let thisBitJson = {};

      try {
        thisBitJson = JSON.parse(fs.readFileSync(composePath(dirPath)).toString('utf8'));
      } catch (e) {} // eslint-disable-line
      if (!R.prop('name', thisBitJson)) thisBitJson.name = path.basename(dirPath);
      if (!R.prop('box', thisBitJson)) thisBitJson.box = path.basename(path.dirname(dirPath));
      if (!R.prop('version', thisBitJson)) thisBitJson.version = DEFAULT_BIT_VERSION;
      if (!R.prop('dependencies', thisBitJson)) thisBitJson.dependencies = {}; // @TODO getDependenciesFunc
      if (!R.path(['sources', 'impl'], thisBitJson)) {
        thisBitJson.sources = R.merge(
          thisBitJson.sources, { impl: protoBJ.getImplBasename() || DEFAULT_IMPL_NAME }
        );
      }
      if (!R.path(['sources', 'spec'], thisBitJson)) {
        thisBitJson.sources = R.merge(
          thisBitJson.sources, { spec: protoBJ.getSpecBasename() || DEFAULT_SPEC_NAME }
        );
      }
      if (!R.path(['env', 'compiler'], thisBitJson)) {
        thisBitJson.env = R.merge(
          thisBitJson.env, { compiler: protoBJ.getCompilerName() || DEFAULT_COMPILER }
        );
      }
      if (!R.path(['env', 'tester'], thisBitJson)) {
        thisBitJson.env = R.merge(
          thisBitJson.env, { tester: protoBJ.getTesterName() || DEFAULT_TESTER }
        );
      }
      
      return resolve(new BitJson(thisBitJson));
    });
  }

  /**
   * load existing json in root path
   */
  static load(dirPath: string): Promise<BitJson> {
    return new Promise((resolve, reject) => {
      if (!hasExisting(dirPath)) return reject(new BitJsonNotFound());
      return fs.readFile(composePath(dirPath), (err, data) => {
        if (err) return reject(err);
        const file = JSON.parse(data.toString('utf8'));
        return resolve(new BitJson(file));
      });
    });
  }
}
