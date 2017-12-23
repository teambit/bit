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

export type IsolateOptions = {
  writeToPath: ?string, // Path to write the component to (default to the isolatedEnv path)
  writeBitDependencies: ?boolean, // Write bit dependencies as package dependencies in package.json
  links: ?boolean, // Fix the links to dependencies to be links to the package
  installPackages: ?boolean, // Install the package dependencies
  noPackageJson: ?boolean, // Don't write the package.json
  override: ?boolean, // Override existing files in the folder
  dist: ?boolean, // Write dist files
  conf: ?boolean, // Write bit.json file
  verbose: boolean // Print more logs
};

export default class Environment {
  path: string;
  scope: Scope;
  consumer: Consumer;

  constructor(scope: Scope, dir: ?string) {
    this.scope = scope;
    this.path = dir || path.join(scope.getPath(), ISOLATED_ENV_ROOT, v4());
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
   * @param {string | BitId} rawId - the component id to isolate
   * @param {IsolateOptions} opts
   * @return {Promise.<Component>}
   */
  async isolateComponent(rawId: string | BitId, opts: IsolateOptions): Promise<ComponentWithDependencies> {
    const bitId = typeof rawId === 'string' ? BitId.parse(rawId) : rawId;
    const componentsWithDependencies = await this.scope.getMany([bitId]);
    const concreteOpts = {
      componentsWithDependencies,
      writeToPath: opts.writeToPath || this.path,
      force: opts.override,
      withPackageJson: !opts.noPackageJson,
      withBitJson: opts.conf,
      writeBitDependencies: opts.writeBitDependencies,
      createNpmLinkFiles: opts.createNpmLinkFiles,
      saveDependenciesAsComponents: true,
      dist: opts.dist
    };
    await this.consumer.writeToComponentsDir(concreteOpts);
    const componentWithDependencies: ComponentWithDependencies = R.head(componentsWithDependencies);
    if (opts.installPackages) await this.consumer.installNpmPackages([componentWithDependencies], opts.verbose);
    return componentWithDependencies;
  }

  getPath(): string {
    return this.path;
  }

  destroy(): Promise<*> {
    logger.debug(`destroying the isolated environment at ${this.path}`);
    return fs.remove(this.path);
  }
}
