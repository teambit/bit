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
import type { ComponentMap, ComponentMapFile } from '../bit-map/bit-map';
import logger from '../../logger/logger';
import loader from '../../cli/loader';
import { BEFORE_IMPORT_ENVIRONMENT } from '../../cli/loader/loader-messages';
import FileSourceNotFound from './exceptions/file-source-not-found';
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
  isolatedEnvironment: IsolatedEnvironment;

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

  async buildIfNeeded({ condition, files, compiler, consumer, componentMap, scope }: {
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

    if (consumer) return runBuild(consumer.getPath());
    if (this.isolatedEnvironment) return runBuild(this.writtenPath);

    const isolatedEnvironment = new IsolatedEnvironment(scope);
    try {
      await isolatedEnvironment.create();
      const component = await isolatedEnvironment.importE2E(this.id.toString());
      const result = await runBuild(component.writtenPath);
      await isolatedEnvironment.destroy();
      return result;
    } catch (err) {
      await isolatedEnvironment.destroy();
      return Promise.reject(err);
    }
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
  async write({ bitDir, withBitJson = true, force = true, bitMap, origin, parent, consumerPath }: { bitDir?: string,
    withBitJson?: boolean, force?: boolean, bitMap?: BitMap, origin?: string, parent?: BitId, consumerPath?: string }):
  Promise<Component> {
    logger.debug(`consumer-component.write, id: ${this.id.toString()}`);
    // Take the bitdir from the files (it will be the same for all the files of course)
    const calculatedBitDir = bitDir || this.files[0].base;

    // Update files base dir according to bitDir
    if (this.files && bitDir) this.files.forEach(file => file.updatePaths({ newBase: bitDir }));
    if (this.dists && bitDir) this.dists.forEach(dist => dist.updatePaths({ newBase: bitDir }));

    // if bitMap parameter is empty, for instance, when it came from the scope, ignore bitMap altogether.
    // otherwise, check whether this component is in bitMap:
    // if it's there, write the files according to the paths in bit.map.
    // Otherwise, write to bitDir and update bitMap with the new paths.
    if (!bitMap) return this._writeToComponentDir(calculatedBitDir, withBitJson, force);

    const idWithoutVersion = this.id.toStringWithoutVersion();
    const componentMap = bitMap.getComponent(idWithoutVersion, false);
    if (!this.files) throw new Error(`Component ${this.id.toString()} is invalid as it has no files`);
    let rootDir;
    if (componentMap) {
      logger.debug('component is in bit.map, write the files according to bit.map');
      const newBase = componentMap.rootDir ? path.join(consumerPath, componentMap.rootDir) : consumerPath;

      this.files.forEach(file => file.updatePaths({ newBase }));
      this.files.forEach(file => file.write(undefined, force));

      // todo: while refactoring the dist for the new changes, make sure it writes to the proper
      // directory. Also, write the dist paths into bit.map.
      // if (this.dist) await this.dist.write(bitDir, this.distImplFileName, force);
      // if (withBitJson) await this.writeBitJson(bitDir, force); // todo: is it needed?
      // if (this.license && this.license.src) await this.license.write(bitDir, force); // todo: is it needed?
      rootDir = componentMap.rootDir;
    } else {
      await this._writeToComponentDir(calculatedBitDir, withBitJson, force);
      rootDir = calculatedBitDir;
    }

    const filesForBitMap = this.files.map((file) => {
      return { name: file.basename, relativePath: file.relative, test: file.test };
    });

    bitMap.addComponent({
      componentId: this.id,
      files: filesForBitMap,
      mainFile: this.mainFile,
      rootDir,
      origin,
      parent
    });
    logger.debug('component has been written successfully');
    return this;
  }

  async runSpecs({ scope, rejectOnFailure, consumer, environment, save, verbose, isolated }: {
    scope: Scope,
    rejectOnFailure?: boolean,
    consumer?: Consumer,
    environment?: boolean,
    save?: boolean,
    verbose?: boolean,
    isolated?: boolean,
  }): Promise<?Results> {
    // TODO: The same function exactly exists in this file under build function
    // Should merge them to one
    const installEnvironmentsIfNeeded = (): Promise<any> => {
      if (environment) {
        loader.start(BEFORE_IMPORT_ENVIRONMENT);
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
        logger.debug(`Unable to find tester ${this.testerId}, will try to import it`);
        environment = true;
        // todo: once we agree about this approach, get rid of the environment variable
      } else throw err;
    }

    await installEnvironmentsIfNeeded();
    logger.debug('Environment components are installed.');
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
        logger.debug('Building the component before running the tests');
        await this.build({ scope, environment, verbose, consumer });
        const saveDists = this.dists ?
          this.dists.map(dist => dist.write()) : [Promise.resolve()];

        await Promise.all(saveDists);

        const testDists = this.dists ? this.dists.filter(dist => dist.test) : this.files.filter(file => file.test);
        return run(this.mainFile, testDists);
      }

      const isolatedEnvironment = new IsolatedEnvironment(scope);
      try {
        await isolatedEnvironment.create();
        const component = await isolatedEnvironment.importE2E(this.id.toString());
        component.isolatedEnvironment = isolatedEnvironment;
        logger.debug(`the component ${this.id.toString()} has been imported successfully into an isolated environment`);

        await component.build({ scope, environment, verbose });
        if (component.dists) {
          const specDistWrite = component.dists.map(file => file.write());
          await Promise.all(specDistWrite);
        }
        const testFilesList = component.dists ? component.dists.filter(dist => dist.test)
          : component.files.filter(file => file.test);
        const results = await run(component.mainFile, testFilesList);
        await isolatedEnvironment.destroy();
        return results;
      } catch (e) {
        await isolatedEnvironment.destroy();
        return Promise.reject(e);
      }
    } catch (err) {
      return Promise.reject(err);
    }
  }

  async build({ scope, environment, save, consumer, bitMap, verbose }:
          { scope: Scope, environment?: bool, save?: bool, consumer?: Consumer, bitMap?: BitMap, verbose?: bool }):
  Promise<string> { // @TODO - write SourceMap Type
    if (!this.compilerId) return Promise.resolve(null);
    logger.debug('consumer-component.build, compilerId found, start building');

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
        return Promise.reject(err);
      }
    }

    const installEnvironmentIfNeeded = async (): Promise<any> => {
      if (environment) {
        loader.start(BEFORE_IMPORT_ENVIRONMENT);
        return scope.installEnvironment({
          ids: [this.compilerId],
          consumer,
          verbose,
        });
      }

      return Promise.resolve();
    };

    await installEnvironmentIfNeeded();

    if (!compiler) {
      compiler = await scope.loadEnvironment(this.compilerId);
    }
    const builtFiles = await this.buildIfNeeded({
      condition: !!this.compilerId,
      compiler,
      files: this.files,
      consumer,
      componentMap,
      scope
    });

    // return buildFilesP.then((buildedFiles) => {
    builtFiles.forEach((file) => {
      if (file && (!file.contents || !isString(file.contents.toString()))) {
        throw new Error('builder interface has to return object with a code attribute that contains string');
      }
    });

    this.dists = builtFiles.map(file => new Dist(file));

    if (save) {
      await scope.sources.updateDist({ source: this });
    }

    return (this.dists);
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
      mainFile,
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
      mainFile: path.normalize(mainFile),
      files,
      docs,
      dists,
      specsResults: specsResults ? SpecsResults.deserialize(specsResults) : null,
      license: license ? License.deserialize(license) : null
    });
  }

  static fromString(str: string): Component {
    const object = JSON.parse(str);
    object.files = SourceFile.loadFromParsedStringArray(object.files);
    object.dists = Dist.loadFromParsedStringArray(object.dists);
    return this.fromObject(object);
  }

  static loadFromFileSystem({ bitDir, consumerBitJson, componentMap, id, consumerPath, bitMap }: { bitDir: string,
    consumerBitJson: ConsumerBitJson, componentMap: ComponentMap, id: BitId, consumerPath: string, bitMap: BitMap }):
  Component {
    let packageDependencies;
    let bitJson = consumerBitJson;
    const getLoadedFiles = (files: ComponentMapFile[]): SourceFile[] => {
      const sourceFiles = [];
      const filesKeysToDelete = [];
      files.forEach((file, key) => {
        const filePath = path.join(bitDir, file.relativePath);
        try {
          const sourceFile = SourceFile
            .load(filePath, consumerBitJson.distTarget, bitDir, consumerPath, { test: file.test });
          sourceFiles.push(sourceFile);
        } catch (err) {
          if (!(err instanceof FileSourceNotFound)) throw err;
          logger.warn(`a file ${filePath} will be deleted from bit.map as it does not exist on the file system`);
          filesKeysToDelete.push(key);
        }
      });
      if (filesKeysToDelete.length && !sourceFiles.length) {
        throw new Error(`invalid component ${id}, all files were deleted, please remove the component using bit remove command`);
      }
      if (filesKeysToDelete.length) {
        filesKeysToDelete.forEach(key => files.splice(key, 1));
        bitMap.hasChanged = true;
      }

      return sourceFiles;
    };
    if (!fs.existsSync(bitDir)) return Promise.reject(new ComponentNotFoundInPath(bitDir));
    const files = componentMap.files;
    // Load the base entry from the root dir in map file in case it was imported using -path
    // Or created using bit create so we don't want all the path but only the relative one
    // Check that bitDir isn't the same as consumer path to make sure we are not loading global stuff into component
    // (like dependencies)
    if (bitDir !== consumerPath) {
      bitJson = BitJson.loadSync(bitDir, consumerBitJson);
      if (bitJson) {
        packageDependencies = bitJson.packageDependencies;
      }
    }

    return new Component({
      name: id.name,
      box: id.box,
      scope: id.scope,
      version: id.version,
      lang: bitJson.lang,
      compilerId: BitId.parse(bitJson.compilerId),
      testerId: BitId.parse(bitJson.testerId),
      mainFile: componentMap.mainFile,
      files: getLoadedFiles(files),
      packageDependencies
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
