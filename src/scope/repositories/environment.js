/** @flow */
import * as path from 'path';
import fs from 'fs';
import R from 'ramda';
import glob from 'glob';
import Repository from '../repository';
import { BitId } from '../../bit-id';
import Component from '../../consumer/component';
import { BIT_ENVIRONMENT_DIRNAME, LATEST } from '../../constants';
import npmInstall from '../../utils/npm';
import resolveBit from '../../consumer/bit-node-resolver';

const installPackageDependencies = (component: Component, dir: string) => {
  const deps = component.packageDependencies;
  return Promise.all(
    R.values(
      R.mapObjIndexed(
        (value, key) => npmInstall({ name: key, version: value, dir })
      , deps)
    )
  ).then(() => component);
};

export default class Cache extends Repository {
  getPath(): string {
    return path.join(super.getPath(), BIT_ENVIRONMENT_DIRNAME);
  }

  composePath(bitId: BitId) {
    return path.join(this.getPath(), bitId.box, bitId.name, bitId.getCleanName(), bitId.version);
  }

  store(component: Component) {
    const componentPath = this.composePath(component.id);
    return component
      .write(componentPath, true)
      .then(() => installPackageDependencies(component, componentPath));
  }
  
  findLatestVersion(bitId: BitId): string {
    const dirToLookIn = path.join(this.getPath(), bitId.box, bitId.name, bitId.getCleanName());
    const files = glob.sync(path.join(dirToLookIn, '*'));
    const versions = files.map((file: string): number => {
      return parseInt(path.basename(file));
    });

    return Math.max(...versions).toString();
  }

  get(bitId: BitId) {
    if (bitId.version === LATEST) {
      bitId.version = this.findLatestVersion(bitId);
    }
    
    return resolveBit(this.composePath(bitId));
  }

  hasSync(bitId: BitId) {
    const box = bitId.box;
    const name = bitId.name;
    const scope = bitId.getCleanName();
    // @TODO - add the version
    // @TODO - maybe check for node_modules
    const bitPath = path.join(this.getPath(), box, name, scope);
    return fs.existsSync(bitPath);
  }

  ensureEnvironment({ testerId, compilerId }: any): Promise<any> {
    const parsedTesterId = testerId ? BitId.parse(testerId) : undefined;
    const parsedCompilerId = compilerId ? BitId.parse(compilerId) : undefined;
    
    const rejectNils = R.reject(R.isNil);
    const envs = rejectNils([ parsedTesterId, parsedCompilerId ]);
    
    const ensureEnv = (env: BitId): Promise<any> => {
      if (this.hasSync(env)) return Promise.resolve();

      return this.scope.get(env) // @HACKALERT - replace with getOne
        .then(bitDependencies => this.store(bitDependencies.component)); 
    };

    return Promise.all(R.map(ensureEnv, envs));
  }

  // writeToEnvBitsDir(bitDependencies: ComponentDependencies[]): Promise<Bit[]> {
  //   const bits = flattenDependencies(bitDependencies);
  //   return Promise.all(
  //     bits.map(bit => 
  //       this.cdAndWrite(bit, this.getPath())
  //       .then(installPackageDependencies)
  //     )
  //   );
  // }
}
