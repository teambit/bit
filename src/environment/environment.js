/** @flow */
import v4 from 'uuid';
import fs from 'fs-extra';
import path from 'path';
import R from 'ramda';
import { Scope, ComponentWithDependencies } from '../scope';
import { BitId } from '../bit-id';
import { ISOLATED_ENV_ROOT } from '../constants';
import { mkdirp } from '../utils';
import logger from '../logger/logger';
import { Consumer } from '../consumer';

export default class Environment {
  path: string;
  scope: Scope;
  consumer: Consumer;

  constructor(scope: Scope, ciDir: string) {
    this.scope = scope;
    this.path = ciDir || path.join(scope.getPath(), ISOLATED_ENV_ROOT, v4());
    logger.debug(`creating a new isolated environment at ${this.path}`);
  }

  async create(): Promise<> {
    await mkdirp(this.path);
    this.consumer = await Consumer.createWithExistingScope(this.path, this.scope);
  }

  /**
   * import a component end to end. Including importing the dependencies and installing the npm
   * packages.
   *
   * @param rawId
   * @return {Promise.<Component>}
   */
  async importE2E(
    rawId: string,
    verbose: boolean,
    installDependencies: boolean = true,
    writeBitDependencies?: boolean = false,
    createNpmLinkFiles?: boolean = false
  ): Promise<ComponentWithDependencies> {
    const bitId = BitId.parse(rawId);
    const componentDependenciesArr = await this.scope.getMany([bitId]);
    await this.consumer.writeToComponentsDir({
      componentsWithDependencies: componentDependenciesArr,
      writeBitDependencies,
      createNpmLinkFiles,
      saveDependenciesAsComponents: true,
      installNpmPackages: installDependencies,
      verbose
    });
    return R.head(componentDependenciesArr);
  }

  getPath(): string {
    return this.path;
  }

  destroy(): Promise<*> {
    return new Promise((resolve, reject) => {
      fs.remove(this.path, (err) => {
        if (err) return reject(err);
        logger.debug(`destroying the isolated environment at ${this.path}`);
        return resolve();
      });
    });
  }
}
