/** @flow */
import path from 'path';
import { mkdirp, isString } from '../../utils';
import BitJson from '../bit-json';
import Impl from '../bit-component/sources/impl';
import Specs from '../bit-component/sources/specs';
import ConsumerBitJson from '../bit-json/consumer-bit-json';
import BitId from '../../bit-id/bit-id';
import Scope from '../../scope/scope';
import BitIds from '../../bit-id/bit-ids';

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
  dependencies?: ?Object,
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
  dependencies: Object;
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

  get Dependencies(): BitIds {
    // TODO - memoize for cache
    return BitIds.loadDependencies(this.dependencies);
  }
  
  // get id(): BitId {
  //   return new BitId({
  //     scope,
  //     box,
  //     name,
  //     version,
  //   });
  // }

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
    this.dependencies = dependencies || {};
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

  build(scope: Scope): Promise<{code: string, map: Object}|null> { // @TODO - write SourceMapType
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
  
  static loadFromInline(bitDir, consumerBitJson): Promise<Component> {
    return BitJson.load(bitDir, consumerBitJson)
    .then((bitJson) => {
      return new Component({
        name: bitJson.name,
        box: bitJson.box,
        implFile: bitJson.getImplBasename(),
        specsFile: bitJson.getSpecBasename(), 
        compilerId: BitId.parse(bitJson.getCompilerName()),
        testerId: BitId.parse(bitJson.getTesterName()),
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
  }) {
    const implFile = consumerBitJson.getImplBasename();
    const specsFile = consumerBitJson.getSpecBasename();
    const compilerId = BitId.parse(consumerBitJson.getCompilerName());
    const testerId = BitId.parse(consumerBitJson.getTesterName());

    return new Component({
      name,
      box,
      version: DEFAULT_BIT_VERSION,
      scope,
      implFile,
      specsFile, 
      compilerId,
      testerId,
      impl: Impl.create(name, compilerId),
      specs: withSpecs ? Specs.create(name, testerId) : undefined,
    });
  }
}
