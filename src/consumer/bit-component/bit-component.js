/** @flow */
import { mkdirp } from '../../utils';
import BitJson from '../bit-json';
import Impl from '../bit-component/sources/impl';
import Specs from '../bit-component/sources/specs';
import ConsumerBitJson from '../bit-json/consumer-bit-json';
import BitId from '../../bit-id';

import { 
  DEFAULT_BOX_NAME,
  DEFAULT_IMPL_NAME,
  DEFAULT_SPECS_NAME,
  DEFAULT_COMPILER_ID,
  DEFAULT_TESTER_ID,
  DEFAULT_BIT_VERSION,
} from '../../constants';

export type ComponentProps = {
  name: string,
  box: string,
  version: ?string,
  scope: ?string,
  implFile: ?string,
  specsFile: ?string,
  compilerId: ?string,
  testerId: ?string,
  dependencies?: ?Object,
  packageDependencies?: ?Object,
  impl: ?Impl,
  specs: ?Specs,
}

export default class Component {
  name: string;
  box: string;
  version: ?string;
  scope: ?string;
  implFile: string;
  specsFile: string; 
  compilerId: string;
  testerId: string;
  dependencies: Object;
  packageDependencies: Object;
  _impl: ?Impl;
  _specs: ?Specs;

  set impl(val: Impl) { this._impl = val; }

  get impl(): Impl {
    if (!this._impl) { this._impl = Impl.load(this.name, this.compilerId); }
    return this._impl;
  }
  
  set specs(val: Specs) { this._specs = val; }

  get specs(): Specs {
    if (!this._specs) { this._specs = Specs.load(this.name, this.testerId); }
    return this._specs;
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
    this.compilerId = compilerId || DEFAULT_COMPILER_ID;
    this.testerId = testerId || DEFAULT_TESTER_ID;
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
      compiler: this.compilerId,
      tester: this.testerId,
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
    .then(() => { return this._specs ? this.specs.write(bitDir, this.specsFile) : undefined; })
    .then(() => { return withBitJson ? this.writeBitJson(bitDir): undefined; })
    .then(() => this);
  }

  build(scope: Scope): Promise<{code: string, map: Object}> { // @TODO - write SourceMapType
    return new Promise((resolve, reject) => {
      if (!this.hasCompiler()) { return resolve(this); }
      try {
        const compilerName = this.bitJson.getCompilerName();
        return scope.loadEnvironment(BitId.parse(compilerName))
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
        compilerId: bitJson.getCompilerName(),
        testerId: bitJson.getTesterName(),  
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
    const compilerId = consumerBitJson.getCompilerName();
    const testerId = consumerBitJson.getTesterName();

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
