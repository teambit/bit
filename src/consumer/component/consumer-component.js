import path from 'path';
import fs from 'fs';
import R from 'ramda';
import vinylFile from 'vinyl-file';
import { mkdirp, isString } from '../../utils';
import BitJson from '../bit-json';
import { Impl, Specs, Dist, License, SourceFile } from '../component/sources';
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
import ComponentNotFoundInPath from './exceptions/component-not-found-in-path';
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
  DEFAULT_LANGUAGE,
  COMPONENT_ORIGINS
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
  files?: ?SourceFile[]|[],
  docs?: ?Doclet[],
  dist?: Dist,
  specDist?: Dist,
  specsResults?: ?SpecsResults,
  license?: ?License,
  log?: ?Log,
  testsFiles:File[];

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
  _files: ?SourceFile[]|[];
  dist: ?Dist[];
  specDist: ?Dist;
  specsResults: ?SpecsResults[];
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

  set files(val: ?SourceFile[]) { this._files = val; }

  get files(): ?SourceFile[] {
    if (!this._files) return null;
    if (this._files instanceof Array) return this._files;

    if (R.is(Object, this._files)) {
      // $FlowFixMe
      this._files = SourceFile.load(this._files);
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
      R.flatten(this.files.map(file => docsParser(file.contents.toString(), file.relative))) : [];
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
                log,
              }: ComponentProps) {
    this.name = name;
    this.box = box || DEFAULT_BOX_NAME;
    this.version = version;
    this.scope = scope;
    this.lang = lang || DEFAULT_LANGUAGE;
    this.implFile = implFile || DEFAULT_IMPL_NAME;
    this.specsFile = specsFile || DEFAULT_SPECS_NAME;
    this.mainFileName = mainFileName;
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

  buildIfNeeded({ condition, files, compiler, consumer, scope }: {
    condition?: ?bool,
    files:File[],
    compiler: any,
    consumer?: Consumer,
    scope: Scope,
  }): Promise<?{ code: string, mappings?: string }> {
    if (!condition) { return Promise.resolve({ code: '' }); }

    const runBuild = (componentRoot: string): Promise<any> => {
      const metaData = {
        entry: this.implFile,
        files: this.files,
        root: componentRoot,
        packageDependencies: this.packageDependencies,
        dependencies: this.dependencies
      };

      if (compiler.build) {
        return compiler.build(metaData); // returns a promise
      }

      // the compiler have one of the following (build/compile)
      return Promise.resolve(compiler.compile(files));
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
    if (this.files) await this.files.forEach(file => file.write(bitDir, force));
    if (this.dist) await this.dist.write(bitDir, this.distImplFileName, force);
    if (this.specsFile && this.specDist) await this.specDist.write(bitDir, this.distSpecFileName, force);
    if (withBitJson) await this.writeBitJson(bitDir, force);
    if (this.license && this.license.src) await this.license.write(bitDir, force);
    return this;
  }

  async write(bitDir: string, withBitJson: boolean, force?: boolean = true, bitMap?: BitMap,
              origin?: string, parent?: BitId): Promise<Component> {
    // if bitMap parameter is empty, for instance, when it came from the scope, ignore bitMap altogether.
    // otherwise, check whether this component is in bitMap:
    // if it's there, write the files according to the paths in bit.map.
    // Otherwise, write to bitDir and update bitMap with the new paths.
    if (!bitMap) return this.writeToComponentDir(bitDir, withBitJson, force);

    const idWithoutScope = this.id.changeScope(null);
    const componentMap = bitMap.getComponent(idWithoutScope.toString());
    if (componentMap) {
      if (!this.files) throw new Error(`Component ${this.id.toString()} is invalid as it has no files`);

      await this.files.forEach(file => file.writeUsingBitMap(componentMap.files, force));
      // todo: while refactoring the dist for the new changes, make sure it writes to the proper
      // directory. Also, write the dist paths into bit.map.
      // if (this.dist) await this.dist.write(bitDir, this.distImplFileName, force);
      // if (withBitJson) await this.writeBitJson(bitDir, force); // todo: is it needed?
      // if (this.license && this.license.src) await this.license.write(bitDir, force); // todo: is it needed?
      return this;
    }
    // TODO: Make sure to add the component origin arg
    await this.writeToComponentDir(bitDir, withBitJson, force);

    if (!this.files) {
      if (!this.impl) throw new Error('Invalid component. There are no files nor impl.js file to write');

      // for backward compatibility add impl.js to files.
      const implVinylFile = new SourceFile({
        path: path.join(bitDir, this.implFile),
        contents: new Buffer(this.impl.src)
      });
      this.files = [implVinylFile];
    }

    const filesToAdd = {};
    this.files.forEach((file) => {
      filesToAdd[file.basename] = path.join(bitDir, file.basename);
    });
    bitMap.addComponent({
      componentId: this.id,
      componentPaths: filesToAdd,
      mainFile: this.mainFileName,
      testsFiles: this.testsFileNames,
      rootDir: bitDir,
      origin,
      parent
    });
    await bitMap.write();
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

    const testFiles = this.files.filter(file => file.isTest);
    if (!this.testerId || !testFiles) return null;

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

      const run = async (mainFile: string, distTestFiles: Dist[]) => {
        try {
          const specsResultsP = distTestFiles.map(async (testFile) => {
            return specsRunner.run({
              scope,
              testerFilePath,
              testerId: this.testerId,
              implDistPath: mainFile,
              specDistPath: testFile.distFilePath,
            });
          });
          const specsResults = await Promise.all(specsResultsP);
          this.specsResults = specsResults.map(specRes => SpecsResults.createFromRaw(specRes));
          if (rejectOnFailure && !this.specsResults.every((element) => (element.pass))) {
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
        await this.build({ scope, environment, verbose, consumer });
        const saveImplDist = this.dist ?
          this.dist.map(file => file.write()) : Promise.resolve();

        await Promise.all(saveImplDist);

        const testDist = this.dist.filter(file => file.isTest);
        return run(this.mainFileName, testDist);
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
          const buildFilesP = this.buildIfNeeded({
            condition: !!this.compilerId,
            compiler,
            files: this.files,
            consumer,
            scope
          });

          return buildFilesP.then((buildedFiles) => {
            buildedFiles.forEach((file) => {
              if (file && (!file.compiledContent || !isString(file.compiledContent.toString()))) {
                throw new Error('builder interface has to return object with a code attribute that contains string');
              }
            });
            this.dist = buildedFiles.map(file => new Dist(file));

            if (save) {
              return scope.sources.updateDist({ source: this })
                .then(() => resolve(this.dist));
            }

            return resolve(this.dist);
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
      files: files ? SourceFile.deserialize(files) : null,
      docs,
      dist: dist ? Dist.deserialize(dist) : null,
      specsResults: specsResults ? SpecsResults.deserialize(specsResults) : null,
      license: license ? License.deserialize(license) : null
    });
  }

  static calculteEntryData(distEntry: string):string {
    const enrtyPath = path.join(process.cwd(), distEntry);
    return fs.existsSync(enrtyPath) ? enrtyPath : process.cwd();
  }
  static fromString(str: string): Component {
    const object = JSON.parse(str);
    return this.fromObject(object);
  }

  static loadFromFileSystem(bitDir: string,
                            consumerBitJson: BitJson,
                            componentMap: ComponentMap,
                            id: BitId,
                            consumerPath: string): Component {
    let dependencies;
    let packageDependencies;
    let implFile;
    let specsFile;
    let impl;
    let specs;
    let bitJson = consumerBitJson;
    if (bitDir && !fs.existsSync(bitDir)) return Promise.reject(new ComponentNotFoundInPath(bitDir));
    if (!bitDir && componentMap && componentMap.rootDir) bitDir = componentMap.rootDir;
    if (bitDir) {
      bitJson = BitJson.loadSync(bitDir, consumerBitJson);
      if (bitJson) {
        // Load the dependencies from bit.json
        dependencies = BitIds.fromObject(bitJson.dependencies);
        packageDependencies = bitJson.packageDependencies;

        // We only create those attribute in case of imported component because
        // Adding new component shouldn't generate those anymore
        // It's mainly for backward compatibility
        // TODO: put this inside files / test files
        implFile = bitJson.getImplBasename();
        specsFile = bitJson.getSpecBasename();
        impl = path.join(bitDir, bitJson.getImplBasename());
        specs = path.join(bitDir, bitJson.getSpecBasename());
      }
    }

    const cwd = this.calculteEntryData(bitJson.distEntry);
    const files = componentMap.files;

    const vinylFiles = Object.keys(files).map((file) => {
      const filePath = path.join(consumerPath, files[file]);
      return SourceFile.load(filePath, bitJson.distTarget, cwd);
    });

    // TODO: Decide about the model represntation
    componentMap.testsFiles.forEach((testFile) => {
      const filePath = path.join(consumerPath, testFile);
      vinylFiles.push(SourceFile.load(filePath, bitJson.distTarget, cwd, { isTest: true }));
    });

    return new Component({
      name: id.name,
      box: id.box,
      lang: bitJson.lang,
      compilerId: BitId.parse(bitJson.compilerId),
      testerId: BitId.parse(bitJson.testerId),
      mainFileName: componentMap.mainFile,
      files: vinylFiles || [],
      dependencies,
      packageDependencies,
      implFile,
      specsFile,
      impl,
      specs
    });
  }

  static create({ scopeName, name, box, withSpecs, files, consumerBitJson }:{
    consumerBitJson: ConsumerBitJson,
    name: string,
    box: string,
    scopeName?: ?string,
    withSpecs?: ?boolean,
  }, scope: Scope): Component {
    const implFile = consumerBitJson.getImplBasename();
    const specsFile = consumerBitJson.getSpecBasename();
    const compilerId = BitId.parse(consumerBitJson.compilerId);
    const testerId = BitId.parse(consumerBitJson.testerId);
    const lang = consumerBitJson.lang;
    const implVinylFile = new SourceFile({
      path: files['impl.js'],
      contents: new Buffer(Impl.create(name, compilerId, scope).src)
    });

    return new Component({
      name,
      box,
      lang,
      version: DEFAULT_BIT_VERSION,
      scope: scopeName,
      implFile,
      specsFile,
      files: [implVinylFile],
      compilerId,
      testerId,
      impl: Impl.create(name, compilerId, scope),
      specs: withSpecs ? Specs.create(name, testerId, scope) : undefined,
    });
  }
}
