import path from 'path';
import fs from 'fs';
import R from 'ramda';
import { mkdirp, isString } from '../../utils';
import BitJson from '../bit-json';
import { Impl, Specs, Dist, License, Files } from '../component/sources';
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
import IsolatedEnvironment from '../../environment';
import type { Log } from '../../scope/models/version';
import { ResolutionException } from '../../scope/exceptions';
import BitMap from '../bit-map';
import type { ComponentMap } from '../bit-map/bit-map';

import {
  DEFAULT_BOX_NAME,
  DEFAULT_IMPL_NAME,
  DEFAULT_SPECS_NAME,
  DEFAULT_INDEX_NAME,
  DEFAULT_BIT_VERSION,
  NO_PLUGIN_TYPE,
  DEFAULT_LANGUAGE
} from '../../constants';

export type ComponentProps = {
  name: string,
  box: string,
  version?: ?number,
  scope?: ?string,
  lang?: string,
  implFile?: ?string,
  specsFile?: ?string,
  filesNames?: ?string[],
  compilerId?: ?BitId,
  testerId?: ?BitId,
  dependencies?: ?BitIds,
  packageDependencies?: ?Object,
  impl?: ?Impl|string,
  specs?: ?Specs|string,
  files?: ?Files|[],
  docs?: ?Doclet[],
  dist?: Dist,
  specDist?: Dist,
  specsResults?: ?SpecsResults,
  license?: ?License,
  log?: ?Log,
}

export default class Component {
  name: string;
  box: string;
  version: ?number;
  scope: ?string;
  lang: string;
  /** @deprecated **/
  implFile: ?string;
  /** @deprecated **/
  specsFile: ?string;
  mainFileName: string;
  testsFileNames: string[];
  filesNames: string[];
  compilerId: ?BitId;
  testerId: ?BitId;
  dependencies: BitIds;
  packageDependencies: Object;
  _impl: ?Impl|string;
  _specs: ?Specs|string;
  _docs: ?Doclet[];
  _files: ?Files|{};
  dist: ?Dist;
  specDist: ?Dist;
  specsResults: ?SpecsResults;
  license: ?License;
  log: ?Log;

  set impl(val: Impl) { this._impl = val; }

  get impl(): ?Impl {
    if (!this._impl) return null;

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

  set files(val: Files) { this._files = val; }

  get files(): ?Files {
    if (!this._files) return null;
    if (this._files instanceof Files) return this._files;

    if (R.is(Object, this._files)) {
      // $FlowFixMe
      this._files = Files.load(this._files);
    }
    // $FlowFixMe
    return this._files;
  }

  get id(): BitId {
    // if (!this.scope || !this.version) {
    //   console.error(this);
    //   throw new Error('cant produce id because scope or version are missing');
    // }

    return new BitId({
      scope: this.scope,
      box: this.box,
      name: this.name,
      version: this.version ? this.version.toString() : null,
    });
  }

  get docs(): ?Doclet[] {
    if (!this._docs) this._docs = this.files ?
      R.flatten(this.files.src.map(file => docsParser(file.content.toString()))) : [];
    return this._docs;
  }

  get distImplFileName(): string {
    // todo: what files should be built?
    const baseImplName = path.parse(this.implFile).name;
    return `${baseImplName}.${this.getFileExtension()}`;
  }

  get distSpecFileName(): string {
    const baseSpecName = path.parse(this.specsFile).name;
    return `${baseSpecName}.${this.getFileExtension()}`;
  }

  constructor({
    name,
    box,
    version,
    scope,
    lang,
    implFile,
    specsFile,
    mainFileName,
    testsFileNames,
    filesNames,
    compilerId,
    testerId,
    dependencies,
    packageDependencies,
    impl,
    specs,
    files,
    docs,
    dist,
    specsResults,
    license,
    log
  }: ComponentProps) {
    this.name = name;
    this.box = box || DEFAULT_BOX_NAME;
    this.version = version;
    this.scope = scope;
    this.lang = lang || DEFAULT_LANGUAGE;
    this.implFile = implFile || DEFAULT_IMPL_NAME;
    this.specsFile = specsFile || DEFAULT_SPECS_NAME;
    this.mainFileName = mainFileName || DEFAULT_INDEX_NAME;
    this.testsFileNames = testsFileNames || [];
    this.filesNames = filesNames || [];
    this.compilerId = compilerId;
    this.testerId = testerId;
    this.dependencies = dependencies || new BitIds();
    this.packageDependencies = packageDependencies || {};
    this._specs = specs;
    this._impl = impl;
    this._files = files;
    this._docs = docs;
    this.dist = dist;
    this.specsResults = specsResults;
    this.license = license;
    this.log = log;
  }

  getFileExtension(): string {
    switch (this.lang) {
      case DEFAULT_LANGUAGE:
      default:
        return 'js';
    }
  }

  writeBitJson(bitDir: string, force?:boolean = true): Promise<Component> {
    return new BitJson({
      version: this.version,
      scope: this.scope,
      impl: this.implFile,
      spec: this.specsFile,
      lang: this.lang,
      filesNames: this.filesNames,
      compiler: this.compilerId ? this.compilerId.toString() : NO_PLUGIN_TYPE,
      tester: this.testerId ? this.testerId.toString() : NO_PLUGIN_TYPE,
      dependencies: this.dependencies.toObject(),
      packageDependencies: this.packageDependencies
    }).write({ bitDir, override: force });
  }

  dependencies(): BitIds {
    return BitIds.fromObject(this.dependencies);
  }

  buildIfNeeded({ condition, compiler, src, consumer, scope }: {
      condition?: ?bool,
      compiler: any,
      src: string,
      consumer?: Consumer,
      scope: Scope,
  }): Promise<?{ code: string, mappings?: string }> {
    if (!condition) { return Promise.resolve({ code: src }); }

    const runBuild = (componentRoot: string): Promise<any> => {
      const metaData = {
        src,
        entry: this.implFile,
        files: this.filesNames,
        root: componentRoot,
        packageDependencies: this.packageDependencies,
        dependencies: this.dependencies
      };

      if (compiler.build) {
        return compiler.build(metaData); // returns a promise
      }

      // the compiler have one of the following (build/compile)
      return Promise.resolve(compiler.compile(src));
    };

    if (!compiler.build && !compiler.compile) {
      return Promise.reject(`"${this.compilerId.toString()}" does not have a valid compiler interface, it has to expose a build method`);
    }

    if (consumer) {
      const componentRoot = path.join(consumer.getInlineBitsPath(), this.box, this.name);
      return runBuild(componentRoot);
    }

    const isolatedEnvironment = new IsolatedEnvironment(scope);

    return isolatedEnvironment.create()
    .then(() => {
      return isolatedEnvironment.importE2E(this.id.toString());
    })
    .then((component) => {
      const componentRoot = isolatedEnvironment.getComponentPath(component);
      return runBuild(componentRoot).then((result) => {
        return isolatedEnvironment.destroy().then(() => result);
      });
    }).catch(e => isolatedEnvironment.destroy().then(() => Promise.reject(e)));
  }

  async writeToComponentDir(bitDir: string, withBitJson: boolean, force?: boolean = true) {
    await mkdirp(bitDir);
    if (this.impl) await this.impl.write(bitDir, this.implFile, force);
    if (this.specs) await this.specs.write(bitDir, this.specsFile, force);
    if (this.files) await this.files.write(bitDir, force);
    if (this.dist) await this.dist.write(bitDir, this.distImplFileName, force);
    if (this.specsFile && this.specDist) await this.specDist.write(bitDir, this.distSpecFileName, force);
    if (withBitJson) await this.writeBitJson(bitDir, force);
    if (this.license && this.license.src) await this.license.write(bitDir, force);
    return this;
  }

  async write(bitDir: string, withBitJson: boolean, force?: boolean = true, bitMap?: BitMap): Promise<Component> {
    // if bitMap parameter is empty, for instance, when it came from the scope, ignore bitMap altogether.
    // otherwise, check whether this component is in bitMap:
    // if it's there, write the files according to the paths in bit.map.
    // Otherwise, write to bitDir and update bitMap with the new paths.
    if (!bitMap) return this.writeToComponentDir(bitDir, withBitJson, force);

    const idWithoutScope = this.id.changeScope(null);
    const componentMap = bitMap.getComponent(idWithoutScope.toString());
    if (componentMap) {
      if (!this.files) throw new Error(`Component ${this.id.toString()} is invalid as it has no files`);

      await this.files.writeUsingBitMap(bitMap.projectRoot, componentMap.files, force);
      // todo: while refactoring the dist for the new changes, make sure it writes to the proper
      // directory. Also, write the dist paths into bit.map.
      // if (this.dist) await this.dist.write(bitDir, this.distImplFileName, force);
      // if (withBitJson) await this.writeBitJson(bitDir, force); // todo: is it needed?
      // if (this.license && this.license.src) await this.license.write(bitDir, force); // todo: is it needed?
      return this;

    } else {
      // todo: make sure mainFileName and testsFileNames are available
      await this.writeToComponentDir(bitDir, withBitJson, force);
      if (!this.files) return this;
      const filesToAdd = {};
      this.files.src.forEach(file => {
        filesToAdd[file.name] = path.join(bitDir, file.name);
      });
      bitMap.addComponent(this.id, filesToAdd, this.mainFileName, this.testsFileNames);
      await bitMap.write();
    }
    return this;
  }

  async runSpecs({ scope, rejectOnFailure, consumer, environment, save, verbose, isolated }: {
    scope: Scope,
    rejectOnFailure?: bool,
    consumer?: Consumer,
    environment?: bool,
    save?: bool,
    verbose?: bool,
    isolated?: bool,
  }): Promise<?Results> {
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

    if (!this.testerId || !this.specs || !this.specs.src) return null;

    let testerFilePath;
    try {
      testerFilePath = scope.loadEnvironment(this.testerId, { pathOnly: true });
    } catch (err) {
      if (err instanceof ResolutionException) {
        environment = true;
        // todo: once we agree about this approach, get rid of the environment variable
      } else throw err;
    }

    await installEnvironmentsIfNeeded();
    try {
      if (!testerFilePath) {
        testerFilePath = scope.loadEnvironment(this.testerId, { pathOnly: true });
      }

      const run = async ({ implDistPath, specDistPath }) => {
        try {
          const specsResults = await specsRunner.run({
            scope,
            testerFilePath,
            testerId: this.testerId,
            implDistPath,
            specDistPath,
          });
          this.specsResults = SpecsResults.createFromRaw(specsResults);
          if (rejectOnFailure && !this.specsResults.pass) {
            return Promise.reject(new ComponentSpecsFailed());
          }

          if (save) {
            await scope.sources.modifySpecsResults({
              source: this,
              specsResults: this.specsResults
            });
            return this.specsResults;
          }

          return this.specsResults;
        } catch (err) {
          if (verbose) throw err;
          throw new ComponentSpecsFailed();
        }
      };

      if (!isolated && consumer) {
        const componentPath = consumer.composeBitPath(this.id);
        await this.build({ scope, environment, verbose, consumer });
        const saveImplDist = this.dist ?
        this.dist.write(componentPath, this.implFile) : Promise.resolve();

        const saveSpecDist = this.specDist ?
        this.specDist.write(componentPath, this.specsFile) : Promise.resolve();

        await Promise.all([saveImplDist, saveSpecDist]);
        const implDistPath = this.compilerId ?
        Dist.getFilePath(componentPath, this.implFile) :
        path.join(componentPath, this.implFile);

        const specDistPath = this.compilerId ?
        Dist.getFilePath(componentPath, this.specsFile) :
        path.join(componentPath, this.specsFile);

        return run({ implDistPath, specDistPath });
      }

      const isolatedEnvironment = new IsolatedEnvironment(scope);

      return isolatedEnvironment.create()
      .then(() => {
        return isolatedEnvironment.importE2E(this.id.toString());
      })
      .then((component) => {
        const componentPath = isolatedEnvironment.getComponentPath(component);
        return component.build({ scope, environment, verbose }).then(() => {
          const specDistWrite = component.specDist ?
            component.specDist.write(componentPath, this.specsFile) : Promise.resolve();
          return specDistWrite.then(() => {
            const implDistPath = this.compilerId ?
            Dist.getFilePath(componentPath, this.implFile) :
            path.join(componentPath, this.implFile);

            const specDistPath = this.compilerId ?
            Dist.getFilePath(componentPath, this.specsFile) :
            path.join(componentPath, this.specsFile);

            return run({ implDistPath, specDistPath }).then((results) => {
              return isolatedEnvironment.destroy().then(() => results);
            });
          });
        });
      }).catch(e => isolatedEnvironment.destroy().then(() => Promise.reject(e)));
    } catch (err) {
      return Promise.reject(err);
    }
  }

  build({ scope, environment, save, consumer, verbose }:
  { scope: Scope, environment?: bool, save?: bool, consumer?: Consumer, verbose?: bool }):
  Promise<string> { // @TODO - write SourceMap Type
    return new Promise((resolve, reject) => {
      if (!this.compilerId) return resolve(null);

      // verify whether the environment is installed
      let compiler;
      try {
        compiler = scope.loadEnvironment(this.compilerId);
      } catch (err) {
        if (err instanceof ResolutionException) {
          environment = true;
          // todo: once we agree about this approach, get rid of the environment variable
        } else {
          return reject(err);
        }
      }

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
        if (!compiler) {
          compiler = scope.loadEnvironment(this.compilerId);
        }
        // todo: what files should be built?
        const buildedImplP = this.buildIfNeeded({
          condition: !!this.compilerId,
          compiler,
          src: this.impl ? this.impl.src : '',
          consumer,
          scope
        });

        const buildedspecP = this.buildIfNeeded({
          condition: !!this.compilerId && this.specs,
          compiler,
          src: this.specs && this.specs.src,
          consumer,
          scope
        });

        return Promise.all([buildedImplP, buildedspecP]).then(([buildedImpl, buildedSpec]) => {
          if (buildedImpl && (!buildedImpl.code || !isString(buildedImpl.code))) {
            throw new Error('builder interface has to return object with a code attribute that contains string');
          }

          this.dist = new Dist(
            buildedImpl && buildedImpl.code,
            buildedImpl && buildedImpl.mappings
          );

          if (buildedSpec) {
            this.specDist = new Dist(
              buildedSpec && buildedSpec.code,
              buildedSpec && buildedSpec.mappings
            );
          }

          if (save) {
            return scope.sources.updateDist({ source: this })
            .then(() => resolve(this.dist.src));
          }

          return resolve(this.dist.src);
        });
      }).catch(reject);
    });
  }

  toObject(): Object {
    return {
      name: this.name,
      box: this.box,
      version: this.version ? this.version.toString() : null,
      scope: this.scope,
      lang: this.lang,
      implFile: this.implFile,
      specsFile: this.specsFile,
      filesNames: this.filesNames,
      compilerId: this.compilerId ? this.compilerId.toString() : null,
      testerId: this.testerId ? this.testerId.toString() : null,
      dependencies: this.dependencies.toObject(),
      packageDependencies: this.packageDependencies,
      specs: this.specs ? this.specs.serialize() : null,
      impl: this.impl.serialize(),
      files: this.files ? this.files.serialize() : null,
      docs: this.docs,
      dist: this.dist ? this.dist.serialize() : null,
      specsResults: this.specsResults ? this.specsResults.serialize() : null,
      license: this.license ? this.license.serialize() : null,
      log: this.log
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
      lang,
      implFile,
      specsFile,
      filesNames,
      compilerId,
      testerId,
      dependencies,
      packageDependencies,
      impl,
      specs,
      docs,
      dist,
      files,
      specsResults,
      license
    } = object;

    return new Component({
      name,
      box,
      version: parseInt(version),
      scope,
      lang,
      implFile,
      specsFile,
      filesNames,
      compilerId: compilerId ? BitId.parse(compilerId) : null,
      testerId: testerId ? BitId.parse(testerId) : null,
      dependencies: BitIds.fromObject(dependencies),
      packageDependencies,
      impl: Impl.deserialize(impl),
      specs: specs ? Specs.deserialize(specs) : null,
      files: files ? Files.deserialize(files) : null,
      docs,
      dist: dist ? Dist.deserialize(dist) : null,
      specsResults: specsResults ? SpecsResults.deserialize(specsResults) : null,
      license: license ? License.deserialize(license) : null
    });
  }

  static fromString(str: string): Component {
    const object = JSON.parse(str);
    return this.fromObject(object);
  }

  static async loadFromFileSystem(bitDir: string,
                                  consumerBitJson: BitJson,
                                  componentMap: ComponentMap,
                                  id: BitId,
                                  consumerPath: string): Promise<Component> {
    if (bitDir && !componentMap && !fs.existsSync(bitDir)) return Promise.reject(new ComponentNotFoundInline(bitDir));
    const bitJson = await BitJson.load(bitDir, consumerBitJson);

    if (!componentMap) { // todo: get rid of this part
      return new Component({
        name: path.basename(bitDir),
        box: path.basename(path.dirname(bitDir)),
        lang: bitJson.lang,
        implFile: bitJson.getImplBasename(),
        specsFile: bitJson.getSpecBasename(),
        compilerId: BitId.parse(bitJson.compilerId),
        testerId: BitId.parse(bitJson.testerId),
        dependencies: BitIds.fromObject(bitJson.dependencies),
        packageDependencies: bitJson.packageDependencies,
        impl: path.join(bitDir, bitJson.getImplBasename()),
        specs: path.join(bitDir, bitJson.getSpecBasename()),
      });
    } else { // use componentMap
      const files = componentMap.files;
      const absoluteFiles = {};
      Object.keys(files).forEach(file => {
        absoluteFiles[file] = path.join(consumerPath, files[file]);
      });
      return new Component({
        name: id.name,
        box: id.box,
        lang: bitJson.lang,
        // filesNames // todo: is it needed?
        compilerId: BitId.parse(bitJson.compilerId),
        testerId: BitId.parse(bitJson.testerId),
        dependencies: BitIds.fromObject(bitJson.dependencies),
        packageDependencies: bitJson.packageDependencies,
        mainFileName: componentMap.mainFile,
        testsFileNames: componentMap.testsFiles,
        files: absoluteFiles || {},
      });
    }
  }

  static create({ scopeName, name, box, withSpecs, files, consumerBitJson }:{
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
    const lang = consumerBitJson.lang;

    return new Component({
      name,
      box,
      lang,
      version: DEFAULT_BIT_VERSION,
      scope: scopeName,
      implFile,
      specsFile,
      files,
      compilerId,
      testerId,
      impl: Impl.create(name, compilerId, scope),
      specs: withSpecs ? Specs.create(name, testerId, scope) : undefined,
    });
  }
}
