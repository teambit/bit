import path from 'path';
import fs from 'fs';
import R from 'ramda';
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
  LATEST_BIT_VERSION,
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
  flattenedDependencies?: ?BitIds,
  packageDependencies?: ?Object,
  impl?: ?Impl|string,
  specs?: ?Specs|string,
  files?: ?SourceFile[]|[],
  docs?: ?Doclet[],
  dists?: ?Dist[],
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
  dependencies: Array<Object>;
  flattenedDependencies: BitIds;
  packageDependencies: Object;
  /** @deprecated **/
  _impl: ?Impl|string;
  /** @deprecated **/
  _specs: ?Specs|string;
  _docs: ?Doclet[];
  _files: ?SourceFile[]|[];
  dists: ?Dist[];
  specDist: ?Dist;
  specsResults: ?SpecsResults[];
  license: ?License;
  log: ?Log;
  writtenPath: ?string; // needed for generate links

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
                flattenedDependencies,
                packageDependencies,
                impl,
                specs,
                files,
                docs,
                dists,
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
    this.dependencies = dependencies || [];
    this.flattenedDependencies = flattenedDependencies || new BitIds();
    this.packageDependencies = packageDependencies || {};
    this._specs = specs;
    this._impl = impl;
    this._files = files;
    this._docs = docs;
    this.dists = dists;
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

  _dependenciesAsWritableObject() {
    return R.mergeAll(this.dependencies.map(dependency => dependency.id.toObject()));
  }

  static _dependenciesFromWritableObject(dependencies) {
    return BitIds.fromObject(dependencies).map(dependency => ({ id: dependency }));
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
      dependencies: this._dependenciesAsWritableObject(),
      packageDependencies: this.packageDependencies
    }).write({ bitDir, override: force });
  }

  dependencies(): BitIds {
    return BitIds.fromObject(this.dependencies);
  }

  flattenedDependencies(): BitIds {
    return BitIds.fromObject(this.flattenedDependencies);
  }

  buildIfNeeded({ condition, files, compiler, consumer, componentMap, scope }: {
    condition?: ?bool,
    files:File[],
    compiler: any,
    consumer?: Consumer,
    componentMap?: ComponentMap,
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
      let rootDistFolder = componentRoot;
      if (componentMap){
        if (componentMap.rootDir) rootDistFolder = componentMap.rootDir;
        if (componentMap.origin === COMPONENT_ORIGINS.AUTHORED) {
          rootDistFolder = path.join(consumer.getPath(), consumer.bitJson.distTarget);
        }
      }

      return Promise.resolve(compiler.compile(files, rootDistFolder));
    };

    if (!compiler.build && !compiler.compile) {
      return Promise.reject(`"${this.compilerId.toString()}" does not have a valid compiler interface, it has to expose a build method`);
    }

    if (consumer) {
      const componentRoot = path.join(consumer.projectPath, this.box, this.name);
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

  async _writeToComponentDir(bitDir: string, withBitJson: boolean, force?: boolean = true) {
    await mkdirp(bitDir);
    if (this.impl) await this.impl.write(bitDir, this.implFile, force);
    if (this.specs) await this.specs.write(bitDir, this.specsFile, force);
    if (this.files) await this.files.forEach(file => file.write(undefined, force));
    if (this.dists) await this.dists.forEach(dist => dist.write(undefined, force));
    if (this.specsFile && this.specDist) await this.specDist.write(bitDir, this.distSpecFileName, force);
    if (withBitJson) await this.writeBitJson(bitDir, force);
    if (this.license && this.license.src) await this.license.write(bitDir, force);
    return this;
  }

  /**
   * When using this function please check if you really need to pass the bitDir or not
   * It's better to init the files with the correct base, cwd and path than pass it here
   * It's mainly here for cases when we write from the model so this is the first point we actually have the dir
   */
  async write(bitDir?: string, withBitJson: boolean, force?: boolean = true, bitMap?: BitMap,
              origin?: string, parent?: BitId, consumerPath?: string): Promise<Component> {

    // Take the bitdir from the files (it will be the same for all the files of course)
    let calculatedBitDir = bitDir || this.files[0].base;

    // Update files base dir according to bitDir
    if (this.files && bitDir) this.files.forEach(file => file.updatePaths({newBase: bitDir}));
    if (this.dists && bitDir) this.dists.forEach(dist => dist.updatePaths({newBase: bitDir}));

    // if bitMap parameter is empty, for instance, when it came from the scope, ignore bitMap altogether.
    // otherwise, check whether this component is in bitMap:
    // if it's there, write the files according to the paths in bit.map.
    // Otherwise, write to bitDir and update bitMap with the new paths.
    if (!bitMap) return this._writeToComponentDir(calculatedBitDir, withBitJson, force);

    const idWithoutVersion = this.id.toString(false, true);
    const componentMap = bitMap.getComponent(idWithoutVersion, false);
    if (componentMap) {
      if (!this.files) throw new Error(`Component ${this.id.toString()} is invalid as it has no files`);

      calculatedBitDir = componentMap.rootDir ? path.join(consumerPath, componentMap.rootDir) : consumerPath;

      this.files.forEach(file => file.updatePaths({newBase: calculatedBitDir, newRelative: componentMap.files[file.basename]} ));
      this.files.forEach(file => file.write(undefined, force));

      // todo: while refactoring the dist for the new changes, make sure it writes to the proper
      // directory. Also, write the dist paths into bit.map.
      // if (this.dist) await this.dist.write(bitDir, this.distImplFileName, force);
      // if (withBitJson) await this.writeBitJson(bitDir, force); // todo: is it needed?
      // if (this.license && this.license.src) await this.license.write(bitDir, force); // todo: is it needed?
      return this;
    }

    await this._writeToComponentDir(calculatedBitDir, withBitJson, force);

    if (!this.files) {
      if (!this.impl) throw new Error('Invalid component. There are no files nor impl.js file to write');

      // for backward compatibility add impl.js to files.
      const implVinylFile = new SourceFile({
        base: calculatedBitDir,
        path: path.join(calculatedBitDir, this.implFile),
        contents: new Buffer(this.impl.src)
      });
      this.files = [implVinylFile];
    }

    const filesToAdd = {};
    this.files.forEach((file) => {
      filesToAdd[file.basename] = file.relative;
    });
    bitMap.addComponent({
      componentId: this.id,
      componentPaths: filesToAdd,
      mainFile: this.mainFileName,
      testsFiles: this.testsFileNames,
      rootDir: calculatedBitDir,
      origin,
      parent
    });
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
          if (rejectOnFailure && !this.specsResults.every(element => (element.pass))) {
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
        const saveImplDist = this.dists ?
          this.dists.map(dist => dist.write()) : Promise.resolve();

        await Promise.all(saveImplDist);

        const testDists = this.dists.filter(dist => dist.isTest);
        return run(this.mainFileName, testDists);
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

  async build({ scope, environment, save, consumer, bitMap, verbose }:
          { scope: Scope, environment?: bool, save?: bool, consumer?: Consumer, bitMap?: BitMap, verbose?: bool }):
  Promise<string> { // @TODO - write SourceMap Type
    return new Promise((resolve, reject) => {
      if (!this.compilerId) return resolve(null);

      // verify whether the environment is installed
      let compiler;
      const idWithoutScope = this.id.changeScope(null);
      const componentMap = bitMap && bitMap.getComponent(idWithoutScope.toString());

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
            componentMap,
            scope
          });

          return buildFilesP.then((buildedFiles) => {
            buildedFiles.forEach((file) => {
              if (file && (!file.contents || !isString(file.contents.toString()))) {
                throw new Error('builder interface has to return object with a code attribute that contains string');
              }
            });

            this.dists = buildedFiles.map(file => new Dist(file));

            if (save) {
              return scope.sources.updateDist({ source: this })
                .then(() => resolve(this.dists));
            }

            return resolve(this.dists);
          });
        }).catch(reject);
    });
  }

  toObject(): Object {
    return {
      name: this.name,
      box: this.box,
      version: this.version ? this.version.toString() : null,
      mainFile: this.mainFileName,
      scope: this.scope,
      lang: this.lang,
      implFile: this.implFile,
      specsFile: this.specsFile,
      filesNames: this.filesNames,
      compilerId: this.compilerId ? this.compilerId.toString() : null,
      testerId: this.testerId ? this.testerId.toString() : null,
      dependencies: this._dependenciesAsWritableObject(),
      packageDependencies: this.packageDependencies,
      specs: this.specs ? this.specs.serialize() : null,
      impl: this.impl ? this.impl.serialize() : null,
      files: this.files,
      docs: this.docs,
      dists: this.dists,
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
      dists,
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
      dependencies: this._dependenciesFromWritableObject(dependencies),
      packageDependencies,
      impl: Impl ? Impl.deserialize(impl) : null,
      specs: specs ? Specs.deserialize(specs) : null,
      files: files,
      docs,
      dists: dists,
      specsResults: specsResults ? SpecsResults.deserialize(specsResults) : null,
      license: license ? License.deserialize(license) : null
    });
  }

  static fromString(str: string): Component {
    const object = JSON.parse(str);
    return this.fromObject(object);
  }

  static loadFromFileSystem(bitDir: string,
                            consumerBitJson: ConsumerBitJson,
                            componentMap: ComponentMap,
                            id: BitId,
                            consumerPath: string): Component {
    let dependencies = [];
    let packageDependencies;
    let implFile;
    let specsFile;
    let impl;
    let specs;
    let bitJson = consumerBitJson;
    let bitDirFullPath = bitDir || consumerPath;
    if (bitDir && !fs.existsSync(bitDir)) return Promise.reject(new ComponentNotFoundInPath(bitDir));
    if (!bitDir && componentMap && componentMap.rootDir) {
      bitDir = componentMap.rootDir;
      bitDirFullPath = path.join(consumerPath, bitDir);
    }
    const files = componentMap.files;
    // Load the base entry from the root dir in map file in case it was imported using -path
    // Or created using bit create so we don't want all the path but only the relative one
    // Check that bitDir isn't the same as consumer path to make sure we are not loading global stuff into component
    // (like dependencies)
    if (bitDir && bitDir !== consumerPath) {
      bitJson = BitJson.loadSync(bitDir, consumerBitJson);
      if (bitJson) {
        dependencies = this._dependenciesFromWritableObject(bitJson.dependencies);
        packageDependencies = bitJson.packageDependencies;

        // We only create those attribute in case of imported component because
        // Adding new component shouldn't generate those anymore
        // It's mainly for backward compatibility
        if (!files) {
          implFile = bitJson.getImplBasename();
          specsFile = bitJson.getSpecBasename();
          impl = path.join(bitDir, bitJson.getImplBasename());
          specs = path.join(bitDir, bitJson.getSpecBasename());
        }
      }
    }

    const vinylFiles = Object.keys(files).map((file) => {
      const filePath = path.join(bitDirFullPath, files[file]);
      return SourceFile.load(filePath, consumerBitJson.distTarget, bitDirFullPath, consumerPath);
    });

    // TODO: Decide about the model representation
    componentMap.testsFiles.forEach((testFile) => {
      const filePath = path.join(bitDirFullPath, testFile);
      vinylFiles.push(SourceFile.load(filePath, consumerBitJson.distTarget, bitDirFullPath, consumerPath, { isTest: true }));
    });

    return new Component({
      name: id.name,
      box: id.box,
      scope: id.scope,
      version: id.version,
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

  static create({ scopeName, name, box, withSpecs, files, consumerBitJson, bitPath, consumerPath }:{
    consumerBitJson: ConsumerBitJson,
    name: string,
    box: string,
    scopeName?: ?string,
    withSpecs?: ?boolean,
  }, scope: Scope): Component {
    const specsFile = consumerBitJson.getSpecBasename();
    const compilerId = BitId.parse(consumerBitJson.compilerId);
    const testerId = BitId.parse(consumerBitJson.testerId);
    const lang = consumerBitJson.lang;
    const implVinylFile = new SourceFile({
      cwd: consumerPath,
      base: path.join(consumerPath, bitPath),
      path: path.join(consumerPath, bitPath, files['impl.js']),
      contents: new Buffer(Impl.create(name, compilerId, scope).src)
    });

    return new Component({
      name,
      box,
      lang,
      version: LATEST_BIT_VERSION,
      scope: scopeName,
      specsFile,
      files: [implVinylFile],
      compilerId,
      testerId,
      specs: withSpecs ? Specs.create(name, testerId, scope) : undefined,
    });
  }
}
