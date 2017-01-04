/** @flow */
import * as path from 'path';
import fs from 'fs';
import R from 'ramda';
import Repository from '../repository';
import AbstractBitJson from '../../bit-json/abstract-bit-json';
import { BitId } from '../../bit-id';
import Bit from '../../bit';
import { BIT_ENVIRONMENT_DIRNAME } from '../../constants';
import npmInstall from '../../npm';
import resolveBit from '../../bit-node-resolver';

const installPackageDependencies = (bit) => {
  const deps = bit.bitJson.getPackageDependencies();
  return Promise.all(
    R.values(
      R.mapObjIndexed(
        (value, key) => npmInstall({ name: key, version: value, dir: bit.getPath() })
      , deps)
    )
  ).then(() => bit);
};

export default class Cache extends Repository {
  getPath(): string {
    return path.join(super.getPath(), BIT_ENVIRONMENT_DIRNAME);
  }

  composePath(bitId: BitId) {
    return path.join(this.getPath(), bitId.box, bitId.name, bitId.getScopeName(), bitId.version);
  }

  store(bit: Bit) {
    return bit
      .cd(this.composePath(bit.getId()))
      .write(true)
      .then(installPackageDependencies);
  }

  get(bitId: BitId) {
    return resolveBit(this.composePath(bitId));
  }

  hasSync(bitId: BitId) {
    const box = bitId.box;
    const name = bitId.name;
    const scope = bitId.getScopeName();
    // @TODO - add the version
    // @TODO - maybe check for node_modules
    const bitPath = path.join(this.getPath(), box, name, scope);
    return fs.existsSync(bitPath);
  }

  ensureEnvironment(bitJson: AbstractBitJson): Promise<any> {
    const testerId = bitJson.hasTester() ? BitId.parse(bitJson.getTesterName()) : undefined;
    const compilerId = bitJson.hasCompiler() ? BitId.parse(bitJson.getCompilerName()) : undefined;
    
    const rejectNils = R.reject(R.isNil);
    const envs = rejectNils([ testerId, compilerId ]);
    
    const ensureEnv = (env: BitId): Promise<any> => {
      if (this.hasSync(env)) return Promise.resolve();

      return this.scope.get(env) // @HACKALERT - replace with getOne
        .then(bitDependencies => this.store(bitDependencies.bit)); 
    };

    return Promise.all(R.map(ensureEnv, envs));
  }

  // writeToEnvBitsDir(bitDependencies: BitDependencies[]): Promise<Bit[]> {
  //   const bits = flattenDependencies(bitDependencies);
  //   return Promise.all(
  //     bits.map(bit => 
  //       this.cdAndWrite(bit, this.getPath())
  //       .then(installPackageDependencies)
  //     )
  //   );
  // }
}
