/** @flow */
import path from 'path';
import fs from 'fs';
import Dependencies from '../dependencies';
import { BitJsonAlreadyExists, BitJsonNotFound } from './exceptions';
import { Remotes } from '../remotes';
import { 
  BIT_JSON,
  DEFAULT_TRANSPILER,
  DEFAULT_TESTER,
  DEFAULT_BIT_VERSION,
  DEFAULT_BOX_NAME,
  IMPL_FILE_NAME,
  SPEC_FILE_NAME,
  DEFAULT_BIT_NAME,
} from '../constants';

function composePath(bitPath: string) {
  return path.join(bitPath, BIT_JSON);
}

function hasExisting(bitPath: string): boolean {
  return fs.existsSync(composePath(bitPath));
}

export type BitJsonProps = {
  name?: string;
  box?: string;
  impl?: string;
  spec?: string;
  transpiler?: string;
  tester?: string;
  version?: number;
  remotes?: Object;
  dependencies?: Object;
};

export default class BitJson {
  /**
   * dependencies in bit json
   **/
  name: string;
  box: string;
  version: number;
  impl: string;
  spec: string;
  dependencies: Dependencies;
  remotes: Remotes;
  transpiler: string;
  tester: string;

  getPath(bitPath: string) {
    return composePath(bitPath);
  }

  constructor(
    { name, box, version, impl, spec, dependencies, remotes, transpiler, tester }: BitJsonProps
    ) {
    this.name = name || DEFAULT_BIT_NAME;
    this.box = box || DEFAULT_BOX_NAME;
    this.impl = impl || IMPL_FILE_NAME;
    this.spec = spec || SPEC_FILE_NAME;
    this.transpiler = transpiler || DEFAULT_TRANSPILER;
    this.tester = tester || DEFAULT_TESTER;
    this.version = version || DEFAULT_BIT_VERSION;
    this.remotes = remotes || Remotes.load(remotes);
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
      impl: this.impl,
      spec: this.spec,
      version: this.version,
      transpiler: this.transpiler,
      tester: this.tester,
      remotes: this.remotes.toPlainObject(),
      dependencies: this.dependencies
    };
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
  write({ bitDir, override = false }: { bitDir: string, override?: boolean }): Promise<boolean> {
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
      // typeof this.version === 'number'
      // typeof this.transpiler === 'string' &&
      // this.remotes.validate() &&
      // typeof this.dependencies === 'object'
    );
  }
  
  // getRemote(name: string) {
    // return this.remotes.get(name);
  // }

  static loadFromRaw(json: Object) {
    json.dependencies = json.dependencies ? Dependencies.load(json.dependencies) : undefined;
    json.remotes = json.remotes ? Remotes.load(json.remotes) : undefined; 
    return new BitJson(json);
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
        const { remotes, dependencies } = file;
        if (remotes) file.remotes = Remotes.load(remotes);  
        if (dependencies) file.dependencies = Dependencies.load(dependencies, remotes);
        return resolve(new BitJson(file));
      });
    });
  }
}
