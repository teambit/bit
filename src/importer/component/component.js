// @flow
import path from 'path';
import fs from 'fs-extra';
import R from 'ramda';
import { ComponentObject, Source, Doclet, Log, SpecsResults, Ci } from './component-types';
import {
  NO_PLUGIN_TYPE,
  VERSION_DELIMITER,
  DEFAULT_LICENSE_FILENAME,
} from '../../constants';
import BitJson from '../../bit-json';
import Dist from '../sources/dist';

export const writeSource = (componentDir: string, fileName: string, fileContent: string) =>
  new Promise((resolve, reject) => {
    if (fileName && fileContent) {
      fs.outputFile(path.join(componentDir, fileName), fileContent, (err) => {
        if (err) return reject(err);
        return resolve();
      });
    }

    resolve();
  });

export default class Component {
  name: string;
  box: string;
  scope: string;
  version: string;
  ci: Ci;
  compiler: string;
  tester: string;
  dependencies: string[];
  flattenDependencies: string[];
  packageDependencies: {[string]: string};
  dist: ?Dist;
  impl: Source;
  specs: Source;
  specsResults: SpecsResults;
  docs: Doclet[];
  log: Log;
  license: Source;

  constructor(componentObject: ComponentObject) {
    this.name = componentObject.name;
    this.box = componentObject.box;
    this.scope = componentObject.scope;
    this.version = componentObject.version;
    this.ci = componentObject.ci;
    this.compiler = componentObject.compiler;
    this.tester = componentObject.tester;
    this.dependencies = componentObject.dependencies;
    this.flattenDependencies = componentObject.flattenDependencies;
    this.packageDependencies = componentObject.packageDependencies;
    this.dist = componentObject.dist ? Dist.fromString(componentObject.dist.file) : null;
    this.impl = componentObject.impl || {};
    this.specs = componentObject.specs || {};
    this.specsResults = componentObject.specsResults;
    this.docs = componentObject.docs;
    this.log = componentObject.log;
    this.license = componentObject.license || {};
  }

  get dependenciesObject(): {[string]: string} {
    return R.mergeAll(
      this.dependencies.map((dep) => {
        const [id, version] = dep.split(VERSION_DELIMITER);
        return { [id]: version };
      }),
    );
  }

  write(moduleDir: string): Promise<any[]> {
    const componentDir = this.buildComponentPath(moduleDir);
    return Promise.all(
      [
        this.writeBitJson(componentDir),
        writeSource(componentDir, this.impl.name, this.impl.file),
        writeSource(componentDir, this.specs.name, this.specs.file),
        this.dist ? this.dist.write(componentDir, this.impl.name) : null,
        writeSource(componentDir, DEFAULT_LICENSE_FILENAME, this.license.file),
      ]);
  }

  writeBitJson(dir: string): Promise<void> {
    return new BitJson({
      sources: {
        impl: this.impl.name,
        spec: this.specs.name,
      },
      env: {
        compiler: this.compiler ? this.compiler : NO_PLUGIN_TYPE,
        tester: this.tester ? this.tester : NO_PLUGIN_TYPE,
      },
      dependencies: this.dependenciesObject,
      packageDependencies: this.packageDependencies,
    }).write(dir);
  }

  buildComponentPath(targetModuleDir: string): string {
    const { name, box, scope, version } = this;
    return path.join(targetModuleDir, box, name, scope, version);
  }

  static fromObject(componentObject) {
    return new Component(componentObject);
  }
}
