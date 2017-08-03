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
  LATEST_BIT_VERSION,
  NO_PLUGIN_TYPE,
  DEFAULT_LANGUAGE,
  COMPONENT_ORIGINS,
  DEFAULT_DIST_DIRNAME
} from '../../constants';

export type ComponentProps = {
  name: string,
  box: string,
  version?: ?number,
  scope?: ?string,
  lang?: string,
  compilerId?: ?BitId,
  testerId?: ?BitId,
  dependencies?: ?BitIds,
  flattenedDependencies?: ?BitIds,
  packageDependencies?: ?Object,
  files?: ?SourceFile[]|[],
  docs?: ?Doclet[],
  dists?: ?Dist[],
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
  mainFile: string;
  compilerId: ?BitId;
  testerId: ?BitId;
  dependencies: Array<Object>;
  flattenedDependencies: BitIds;
  packageDependencies: Object;
  _docs: ?Doclet[];
  _files: ?SourceFile[]|[];
  dists: ?Dist[];
  specsResults: ?SpecsResults[];
  license: ?License;
  log: ?Log;
  writtenPath: ?string; // needed for generate links

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

  constructor({
                name,
                box,
                version,
                scope,
                lang,
                mainFile,
                compilerId,
                testerId,
                dependencies,
                flattenedDependencies,
                packageDependencies,
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
    this.mainFile = mainFile;
    this.compilerId = compilerId;
    this.testerId = testerId;
    this.dependencies = dependencies || [];
    this.flattenedDependencies = flattenedDependencies || new BitIds();
    this.packageDependencies = packageDependencies || {};
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
      lang: this.lang,
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
        entry: this.mainFile,
        files: this.files,
        root: componentRoot,
        packageDependencies: this.packageDependencies,
        dependencies: this.dependencies
      };

      if (compiler.build) {
        return compiler.build(metaData); // returns a promise
      }

      // the compiler have one of the following (build/compile)
      let rootDistFolder = path.join(componentRoot, DEFAULT_DIST_DIRNAME);
      if (componentMap) {
        if (componentMap.rootDir) rootDistFolder = path.join(consumer.getPath(), componentMap.rootDir, DEFAULT_DIST_DIRNAME);
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
     // const componentRoot = path.join(consumer.projectPath, this.box, this.name);
      return runBuild(consumer.getPath());
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
    if (this.files) await this.files.forEach(file => file.write(undefined, force));
    if (this.dists) await this.dists.forEach(dist => dist.write(undefined, force));
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

      this.files.forEach(file => file.updatePaths({ newBase: calculatedBitDir }));
      this.files.forEach(file => file.write(undefined, force));

      // todo: while refactoring the dist for the new changes, make sure it writes to the proper
      // directory. Also, write the dist paths into bit.map.
      // if (this.dist) await this.dist.write(bitDir, this.distImplFileName, force);
      // if (withBitJson) await this.writeBitJson(bitDir, force); // todo: is it needed?
      // if (this.license && this.license.src) await this.license.write(bitDir, force); // todo: is it needed?
      return this;
    }

    await this._writeToComponentDir(calculatedBitDir, withBitJson, force);

    if (!this.files) throw new Error('Invalid component. There are no files to write');

    const filesForBitMap = this.files.map((file) => { return { name: file.basename, relativePath: file.relative, test: file.test }; });

    bitMap.addComponent({
      componentId: this.id,
      files: filesForBitMap,
      mainFile: this.mainFile,
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

    const testFiles = this.files.filter(file => file.test);
    if (!this.testerId || !testFiles || R.isEmpty(testFiles)) return null;

    let testerFilePath;
    try {
      testerFilePath = await scope.loadEnvironment(this.testerId, { pathOnly: true });
    } catch (err) {
      if (err instanceof ResolutionException) {
        environment = true;
        // todo: once we agree about this approach, get rid of the environment variable
      } else throw err;
    }

    await installEnvironmentsIfNeeded();
    try {
      if (!testerFilePath) {
        testerFilePath = await scope.loadEnvironment(this.testerId, { pathOnly: true });
      }

      const run = async (mainFile: string, distTestFiles: Dist[]) => {
        try {
          const specsResultsP = distTestFiles.map(async (testFile) => {
            return specsRunner.run({
              scope,
              testerFilePath,
              testerId: this.testerId,
              mainFile,
              testFilePath: testFile.path,
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
        const saveDists = this.dists ?
          this.dists.map(dist => dist.write()) : Promise.resolve();

        await Promise.all(saveDists);

        const testDists = this.dists.filter(dist => dist.test);
        return run(this.mainFile, testDists);
      }

      const isolatedEnvironment = new IsolatedEnvironment(scope);

      return isolatedEnvironment.create()
        .then(() => {
          return isolatedEnvironment.importE2E(this.id.toString());
        })
        .then((component) => {
          return component.build({ scope, environment, verbose }).then(() => {
            const specDistWrite = component.dists ?
              component.dists.map(file => file.write()) : Promise.resolve();
            return Promise.all(specDistWrite).then(() => {
              const testFilesList = component.dists.filter(file => file.test);
              return run(component.mainFile, testFilesList).then((results) => {
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
    return new Promise(async (resolve, reject) => {
      if (!this.compilerId) return resolve(null);

      // verify whether the environment is installed
      let compiler;
      const componentMap = bitMap && bitMap.getComponent(this.id.toString());

      try {
        compiler = await scope.loadEnvironment(this.compilerId);
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
        .then(async () => {
          if (!compiler) {
            compiler = await scope.loadEnvironment(this.compilerId);
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
      mainFile: this.mainFile,
      scope: this.scope,
      lang: this.lang,
      compilerId: this.compilerId ? this.compilerId.toString() : null,
      testerId: this.testerId ? this.testerId.toString() : null,
      dependencies: this.dependencies.map(dep => Object.assign({}, dep, { id: dep.id.toString() })), //this._dependenciesAsWritableObject(),
      packageDependencies: this.packageDependencies,
      files: this.files,
      docs: this.docs,
      dists: this.dists,
      specsResults: this.specsResults ? this.specsResults.map(res => res.serialize()) : null,
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
      compilerId,
      testerId,
      dependencies,
      packageDependencies,
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
      compilerId: compilerId ? BitId.parse(compilerId) : null,
      testerId: testerId ? BitId.parse(testerId) : null,
      dependencies: dependencies.map(dep => Object.assign({}, dep, { id: BitId.parse(dep.id) })), //this._dependenciesFromWritableObject(dependencies),
      packageDependencies,
      files,
      docs,
      dists,
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
      }
    }

    const vinylFiles = files.map((file) => {
      const filePath = path.join(bitDirFullPath, file.relativePath);
      return SourceFile.load(filePath, consumerBitJson.distTarget, bitDirFullPath, consumerPath, {test: file.test});
    });

    return new Component({
      name: id.name,
      box: id.box,
      scope: id.scope,
      version: id.version,
      lang: bitJson.lang,
      compilerId: BitId.parse(bitJson.compilerId),
      testerId: BitId.parse(bitJson.testerId),
      mainFile: componentMap.mainFile,
      files: vinylFiles || [],
      dependencies,
      packageDependencies,
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
    implVinylFile.test = false;

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
