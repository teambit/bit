import path from 'path';
import fs from 'fs';
import { mkdirp, isString } from '../../utils';
import BitJson from '../bit-json';
import Impl from '../component/sources/impl';
import Specs from '../component/sources/specs';
import Dist from '../component/sources/dist';
import ConsumerBitJson from '../bit-json/consumer-bit-json';
import Consumer from '../consumer';
import BitId from '../../bit-id/bit-id';
import Scope from '../../scope/scope';
import BitIds from '../../bit-id/bit-ids';
import docsParser, { Doclet } from '../../jsdoc/parser';
import specsRunner from '../../specs-runner';
import SpecsResults from '../specs-results';
import type { Results } from '../../specs-runner/specs-runner';
import ComponentSpecsFailed from '../exceptions/component-specs-failed';
import ComponentNotFoundInline from './exceptions/component-not-found-inline';

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
  docs?: ?Doclet[],
  dist?: ?Dist,
  specsResults?: ?SpecsResults,
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
  dist: ?Dist;
  specsResults: ?SpecsResults;

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
    specsResults
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
    this.dist = dist;
    this.specsResults = specsResults;
  }

  writeBitJson(bitDir: string): Promise<Component> {
    return new BitJson({
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

  write(bitDir: string, withBitJson: boolean): Promise<Component> {
    return mkdirp(bitDir)
    .then(() => this.impl.write(bitDir, this.implFile))
    .then(() => { return this.specs ? this.specs.write(bitDir, this.specsFile) : undefined; })
    .then(() => { return this.dist ? this.dist.write(bitDir, this.implFile) : undefined; })
    .then(() => { return withBitJson ? this.writeBitJson(bitDir): undefined; })
    .then(() => this);
  }

  runSpecs({ scope, rejectOnFailure, consumer, environment, save, verbose }: {
    scope: Scope,
    rejectOnFailure?: bool,
    consumer?: Consumer,
    environment?: ?bool,
    save?: ?bool,
    verbose?: ?bool
  }): Promise<?Results> {
    function compileIfNeeded(
      condition: bool,
      compiler: ?{ compile?: (string) => { code: string } },
      src: string): ?string {
      if (!condition || !compiler || !compiler.compile) return src;
      return compiler.compile(src).code;
    }

    const installEnvironmentsIfNeeded = (): Promise<any> => {
      if (environment) {
        return scope.installEnvironment({
          ids: [this.compilerId, this.testerId],
          consumer,
          verbose
        });
      }
      return Promise.resolve();
    };

    if (!this.testerId || !this.specs || !this.specs.src) return Promise.resolve(null);

    return installEnvironmentsIfNeeded()
    .then(() => {
      try {
        const testerFilePath = scope.loadEnvironment(
          this.testerId, { pathOnly: true, bareScope: !consumer });
        const compiler = this.compilerId ? scope.loadEnvironment(
          this.compilerId, { bareScope: !consumer }) : null;
        const implSrc = compileIfNeeded(!!this.compilerId, compiler, this.impl.src);
        // $FlowFixMe
        const specsSrc = compileIfNeeded(!!this.compilerId, compiler, this.specs.src);
        return specsRunner.run({ scope, testerFilePath, implSrc, specsSrc, testerId: this.testerId })
        .then((specsResults) => {
          this.specsResults = SpecsResults.createFromRaw(specsResults);
          if (rejectOnFailure && !this.specsResults.pass) {
            return Promise.reject(new ComponentSpecsFailed());
          }

          if (save) {
            return scope.sources.modifySpecsResults({
              source: this,
              specsResults: this.specsResults
            })
            .then(() => Promise.resolve(this.specsResults));
          }

          return Promise.resolve(this.specsResults);
        });
      } catch (e) { return Promise.reject(e); }
    });
  }

  build({ scope, environment, save, consumer, verbose }:
  { scope: Scope, environment?: ?bool, save?: ?bool, consumer?: Consumer, verbose?: ?bool }):
  Promise<{code: string, map: Object}|null> { // @TODO - write SourceMap Type
    return new Promise((resolve, reject) => {
      if (!this.compilerId) return resolve(null);
      const installEnvironmentIfNeeded = (): Promise<any> => {
        if (environment) {
          return scope.installEnvironment({
            ids: [this.compilerId],
            consumer,
            verbose,
          });
        }
        return Promise.resolve();
      };

      return installEnvironmentIfNeeded()
      .then(() => {
        const opts = { bareScope: !consumer };
        const compiler = scope.loadEnvironment(this.compilerId, opts);
        const src = this.impl.src;
        if (!compiler.compile) {
          return reject(`"${this.compilerId.toString()}" does not have a valid compiler interface`);
        }
        const { code, mappings } = compiler.compile(src); // eslint-disable-line
        this.dist = new Dist(code, mappings);

        if (save) {
          return scope.sources.updateDist({ source: this })
          .then(() => resolve(code));
        }

        return resolve(code);
      }).catch(reject);
    });
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
      packageDependencies: this.packageDependencies,
      specs: this.specs ? this.specs.serialize() : null,
      impl: this.impl.serialize(),
      docs: this.docs,
      dist: this.dist ? this.dist.serialize() : null,
      specsResults: this.specsResults ? this.specsResults.serialize() : null
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
      specsResults
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
      packageDependencies,
      impl: Impl.deserialize(impl),
      specs: specs ? Specs.deserialize(specs) : null,
      docs,
      dist: dist ? Dist.deserialize(dist) : null,
      specsResults: specsResults ? SpecsResults.deserialize(specsResults) : null
    });
  }

  static fromString(str: string): Component {
    const object = JSON.parse(str);
    return this.fromObject(object);
  }

  static loadFromInline(bitDir, consumerBitJson): Promise<Component> {
    if (!fs.existsSync(bitDir)) return Promise.reject(new ComponentNotFoundInline(bitDir));
    return BitJson.load(bitDir, consumerBitJson)
    .then((bitJson) => {
      return new Component({
        name: path.basename(bitDir),
        box: path.basename(path.dirname(bitDir)),
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

  static create({ scopeName, name, box, withSpecs, consumerBitJson }:{
    consumerBitJson: ConsumerBitJson,
    name: string,
    box: string,
    scopeName?: ?string,
    withSpecs?: ?boolean,
  }, scope: Scope) {
    const implFile = consumerBitJson.getImplBasename();
    const specsFile = consumerBitJson.getSpecBasename();
    const compilerId = BitId.parse(consumerBitJson.compilerId);
    const testerId = BitId.parse(consumerBitJson.testerId);

    return new Component({
      name,
      box,
      version: DEFAULT_BIT_VERSION,
      scope: scopeName,
      implFile,
      specsFile,
      compilerId,
      testerId,
      impl: Impl.create(name, compilerId, scope),
      specs: withSpecs ? Specs.create(name, testerId, scope) : undefined,
    });
  }
}
