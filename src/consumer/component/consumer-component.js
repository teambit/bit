/** @flow */
import path from 'path';
import fs from 'fs-extra';
import { mkdirp, isString } from '../../utils';
import BitJson from '../bit-json';
import Impl from '../component/sources/impl';
import Specs from '../component/sources/specs';
import ConsumerBitJson from '../bit-json/consumer-bit-json';
import BitId from '../../bit-id/bit-id';
import Scope from '../../scope/scope';
import BitIds from '../../bit-id/bit-ids';
import Environment from '../../scope/repositories/environment';
import docsParser, { Doclet } from '../../jsdoc/parser';
import specsRunner from '../../specs-runner';
import type { Results } from '../../specs-runner/specs-runner';

import { 
  DEFAULT_BOX_NAME,
  DEFAULT_IMPL_NAME,
  DEFAULT_SPECS_NAME,
  DEFAULT_BIT_VERSION,
  NO_PLUGIN_TYPE,
  DEFAULT_DIST_DIRNAME,
  DEFAULT_BUNDLE_FILENAME
} from '../../constants';

export type ComponentProps = {
  name: string,
  box: string,
  version?: ?number,
  scope?: ?string,
  implFile?: ?string,
  specsFile?: ?string,
  compilerId?: ?BitId,
  testerId?: ?BitId,
  dependencies?: ?BitIds,
  packageDependencies?: ?Object,
  impl?: ?Impl|string,
  specs?: ?Specs|string,
  docs?: ?Doclet[],
  dist?: ?string,
}

export default class Component {
  name: string;
  box: string;
  version: ?number;
  scope: ?string;
  implFile: string;
  specsFile: string; 
  compilerId: ?BitId;
  testerId: ?BitId;
  dependencies: BitIds;
  packageDependencies: Object;
  _impl: ?Impl|string;
  _specs: ?Specs|string;
  _docs: ?Doclet[];
  _dist: ?string;

  set impl(val: Impl) { this._impl = val; }

  get impl(): Impl {
    if (isString(this._impl)) {
      // $FlowFixMe
      this._impl = Impl.load(this._impl);
    }
    // $FlowFixMe
    return this._impl;
  }
  
  set specs(val: Specs) { this._specs = val; }

  get specs(): ?Specs {
    if (!this._specs) return null;
    
    if (isString(this._specs)) {
      // $FlowFixMe
      this._specs = Specs.load(this._specs);
    }
    // $FlowFixMe
    return this._specs;
  }
  
  get id(): BitId {
    if (!this.scope || !this.version) {
      console.error(this);
      throw new Error('cant produce id because scope or version are missing');
    }

    return new BitId({
      scope: this.scope,
      box: this.box,
      name: this.name,
      version: this.version.toString(),
    });
  }

  get docs(): ?Doclet[] {
    if (!this._docs) this._docs = docsParser(this.impl.src);
    return this._docs;
  }

  get dist(): ?string {
    if (!this._dist) return null;
    return this._dist;
  }

  constructor({ 
    name,
    box,
    version,
    scope,
    implFile,
    specsFile,
    compilerId,
    testerId,
    dependencies,
    packageDependencies,
    impl,
    specs,
    docs,
    dist,
  }: ComponentProps) {
    this.name = name;
    this.box = box || DEFAULT_BOX_NAME;
    this.version = version;
    this.scope = scope;
    this.implFile = implFile || DEFAULT_IMPL_NAME;
    this.specsFile = specsFile || DEFAULT_SPECS_NAME;
    this.compilerId = compilerId;
    this.testerId = testerId;
    this.dependencies = dependencies || new BitIds();
    this.packageDependencies = packageDependencies || {}; 
    this._specs = specs;
    this._impl = impl;
    this._docs = docs;
    this._dist = dist;
  }

  writeBitJson(bitDir: string): Promise<Component> {
    return new BitJson({
      name: this.name,
      box: this.box,
      version: this.version,
      scope: this.scope,
      impl: this.implFile,
      spec: this.specsFile,
      compiler: this.compilerId ? this.compilerId.toString() : NO_PLUGIN_TYPE,
      tester: this.testerId ? this.testerId.toString() : NO_PLUGIN_TYPE,
      dependencies: this.dependencies.toObject(),
      packageDependencies: this.packageDependencies
    }).write({ bitDir });
  }

  dependencies(): BitIds {
    return BitIds.fromObject(this.dependencies);
  }

  writeBuild(bitDir: string): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this._dist) return reject(new Error('dist file not exist, please use build first'));
      const distPath = path.join(bitDir, DEFAULT_DIST_DIRNAME, DEFAULT_BUNDLE_FILENAME);
      return fs.outputFile(distPath, this._dist, (err) => {
        if (err) return reject(err);
        return resolve(distPath);
      });
    });
  }

  write(bitDir: string, withBitJson: boolean): Promise<Component> {
    return mkdirp(bitDir)
    .then(() => this.impl.write(bitDir, this.implFile))
    .then(() => { return this.specs ? this.specs.write(bitDir, this.specsFile) : undefined; })
    .then(() => { return withBitJson ? this.writeBitJson(bitDir): undefined; })
    .then(() => this);
  }

  runSpecs(scope: Scope): Promise<?Results> {
    function compileIfNeeded(
      condition: bool,
      compiler: ?{ compile?: (string) => string },
      src: string): ?string {
      if (!condition || !compiler || !compiler.compile) return src;
      return compiler.compile(src).code;
    }

    if (!this.testerId || !this.specs || !this.specs.src) return Promise.resolve(null);
    try {
      const testerFilePath = scope.loadEnvironment(this.testerId, { pathOnly: true });
      const compiler = this.compilerId ? scope.loadEnvironment(this.compilerId) : null;
      const implSrc = compileIfNeeded(!!this.compilerId, compiler, this.impl.src);
      // $FlowFixMe
      const specsSrc = compileIfNeeded(!!this.compilerId, compiler, this.specs.src);
      return specsRunner.run({ scope, testerFilePath, implSrc, specsSrc });
    } catch (e) { return Promise.reject(e); }
  }

  build(scope: Scope): {code: string, map: Object}|null { // @TODO - write SourceMap Type
    if (!this.compilerId) return null;
    try {
      const compiler = scope.loadEnvironment(this.compilerId);
      const src = this.impl.src;
      const { code, map } = compiler.compile(src); // eslint-disable-line
      this._dist = code;
      return code;
    } catch (e) {
      throw e;
      // return null;
    }
  }
  
  toObject(): Object {
    return {
      name: this.name,
      box: this.box,
      version: this.version ? this.version.toString() : null,
      scope: this.scope,
      implFile: this.implFile,
      specsFile: this.specsFile,
      compilerId: this.compilerId ? this.compilerId.toString() : null,
      testerId: this.testerId ? this.testerId.toString() : null,
      dependencies: this.dependencies.toObject(),
      packageDependencies: JSON.stringify(this.packageDependencies),
      specs: this.specs ? this.specs.serialize() : null,
      impl: this.impl.serialize(),
      docs: this.docs,
      dist: this._dist,
    };
  }

  toString(): string {
    return JSON.stringify(this.toObject());
  }

  static fromObject(object: Object): Component {
    const { 
      name, 
      box, 
      version, 
      scope, 
      implFile,
      specsFile,
      compilerId,
      testerId,
      dependencies,
      packageDependencies,
      impl,
      specs,
      docs,
      dist,
    } = object;
    
    return new Component({
      name,
      box,
      version: parseInt(version),
      scope,
      implFile,
      specsFile,
      compilerId: compilerId ? BitId.parse(compilerId) : null,
      testerId: testerId ? BitId.parse(testerId) : null,
      dependencies: BitIds.fromObject(dependencies),
      packageDependencies: JSON.parse(packageDependencies),
      impl: Impl.deserialize(impl),
      specs: specs ? Specs.deserialize(specs) : null,
      docs,
      dist,
    });
  }

  static fromString(str: string): Component {
    const object = JSON.parse(str);
    return this.fromObject(object);
  }

  static loadFromInline(bitDir, consumerBitJson): Promise<Component> {
    return BitJson.load(bitDir, consumerBitJson)
    .then((bitJson) => {
      return new Component({
        name: bitJson.name,
        box: bitJson.box,
        implFile: bitJson.getImplBasename(),
        specsFile: bitJson.getSpecBasename(), 
        compilerId: BitId.parse(bitJson.compilerId),
        testerId: BitId.parse(bitJson.testerId),
        dependencies: BitIds.fromObject(bitJson.dependencies),
        packageDependencies: bitJson.packageDependencies,
        impl: path.join(bitDir, bitJson.getImplBasename()),
        specs: path.join(bitDir, bitJson.getSpecBasename()),
      });
    });
  }

  static create({ scope, name, box, withSpecs, consumerBitJson }:{ 
    consumerBitJson: ConsumerBitJson,
    name: string,
    box: string,
    scope?: ?string,
    withSpecs?: ?boolean,
  }, environment: Environment) {
    const implFile = consumerBitJson.getImplBasename();
    const specsFile = consumerBitJson.getSpecBasename();
    const compilerId = BitId.parse(consumerBitJson.compilerId);
    const testerId = BitId.parse(consumerBitJson.testerId);

    return new Component({
      name,
      box,
      version: DEFAULT_BIT_VERSION,
      scope,
      implFile,
      specsFile, 
      compilerId,
      testerId,
      impl: Impl.create(name, compilerId, environment),
      specs: withSpecs ? Specs.create(name, testerId, environment) : undefined,
    });
  }
}
