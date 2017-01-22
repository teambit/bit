/** @flow */
import path from 'path';
import { mkdirp, isString } from '../../utils';
import BitJson from '../bit-json';
import Impl from '../component/sources/impl';
import Specs from '../component/sources/specs';
import ConsumerBitJson from '../bit-json/consumer-bit-json';
import BitId from '../../bit-id/bit-id';
import Scope from '../../scope/scope';
import BitIds from '../../bit-id/bit-ids';
import Environment from '../../scope/repositories/environment';

import { 
  DEFAULT_BOX_NAME,
  DEFAULT_IMPL_NAME,
  DEFAULT_SPECS_NAME,
  DEFAULT_BIT_VERSION,
  NO_PLUGIN_TYPE,
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
    if (!this._specs) { return null; }
    
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
      dependencies: this.dependencies,
      packageDependencies: this.packageDependencies
    }).write({ bitDir });
  }

  dependencies(): BitIds {
    return BitIds.loadDependencies(this.dependencies);
  }

  write(bitDir: string, withBitJson: boolean): Promise<Component> {
    return mkdirp(bitDir)
    .then(() => this.impl.write(bitDir, this.implFile))
    .then(() => { return this.specs ? this.specs.write(bitDir, this.specsFile) : undefined; })
    .then(() => { return withBitJson ? this.writeBitJson(bitDir): undefined; })
    .then(() => this);
  }

  test(scope: Scope): Promise<any|null> { // TODO - create TestResults Type
    function compileIfNeeded(src) {
      return new Promise((resolve, reject) => {
        if (this.compilerId) { 
          return scope.loadEnvironment(this.compilerId)
          .then(({ compile }) => {
            try {
              const { code } = compile(src);
              return resolve(code);
            } catch (e) { return reject(e); }
          }).catch(reject);
        }

        return resolve(src);
      });
    }

    return new Promise((resolve, reject) => {
      if (!this.specs) { return resolve(null); }
      try {
        return scope.loadEnvironment(this.testerId)
        .then((tester) => {
          tester = {
            test: (p) => {
              console.log(p);
              return { t: 'is-awesome' };
            }
          };

          // $FlowFixMe
          return compileIfNeeded(this.specs.src)
          .then(specsSrc => scope.tmp.save(specsSrc))
          .then((specsPath) => {
            const results = tester.test(specsPath);
            return scope.tmp.remove(specsPath)
            .then(() => resolve(results));
          });
        });
      } catch (e) { return reject(e); }
    });
  }

  build(scope: Scope): Promise<{code: string, map: Object}|null> { // @TODO - write SourceMap Type
    return new Promise((resolve, reject) => {
      if (!this.compilerId) { return resolve(null); }
      try {
        return scope.loadEnvironment(this.compilerId)
        .then(({ compile }) => {
          const src = this.impl.src;
          const { code, map } = compile(src); // eslint-disable-line
          // const outputFile = path.join(this.bitDir, DEFAULT_DIST_DIRNAME, DEFAULT_BUNDLE_FILENAME);
          // fs.outputFileSync(outputFile, code);
          return resolve({ code, map });
        });
      } catch (e) { return reject(e); }
    });
  }
  
  toObject(): object {
    return {
      name: this.name,
      box: this.box,
      version: this.version ? this.version.toString() : null,
      scope: this.scope,
      implFile: this.implFile,
      specsFile: this.specsFile,
      compilerId: this.compilerId ? this.compilerId.toString() : null,
      testerId: this.testerId ? this.testerId.toString() : null,
      dependencies: this.dependencies.serialize(),
      packageDependencies: JSON.stringify(this.packageDependencies),
      specs: this.specs ? this.specs.serialize() : null,
      impl: this.impl.serialize(),
    };
  }

  toString(): string {
    return JSON.stringify(this.toObject());
  }

  static fromObject(object: object): Component {
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
      specs
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
      dependencies: BitIds.deserialize(dependencies),
      packageDependencies: JSON.parse(packageDependencies),
      impl: Impl.deserialize(impl),
      specs: specs ? Specs.deserialize(specs) : null,
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
        dependencies: BitIds.loadDependencies(bitJson.dependencies),
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
