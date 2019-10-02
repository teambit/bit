/** @flow */
import v4 from 'uuid';
import fs from 'fs-extra';
import path from 'path';
import type { Scope, ComponentWithDependencies } from '../scope';
import { BitId, BitIds } from '../bit-id';
import { ISOLATED_ENV_ROOT } from '../constants';
import { mkdirp, outputFile } from '../utils';
import logger from '../logger/logger';
import { Consumer } from '../consumer';
import type { PathOsBased } from '../utils/path';
import ManyComponentsWriter from '../consumer/component-ops/many-components-writer';

export type IsolateOptions = {
  writeToPath: ?string, // Path to write the component to (default to the isolatedEnv path)
  writeBitDependencies: ?boolean, // Write bit dependencies as package dependencies in package.json
  npmLinks: ?boolean, // Fix the links to dependencies to be links to the package
  saveDependenciesAsComponents: ?boolean, // import the dependencies as bit components instead of as npm packages
  installPackages: ?boolean, // Install the package dependencies
  installPeerDependencies: ?boolean, // Install the peer package dependencies
  noPackageJson: ?boolean, // Don't write the package.json
  override: ?boolean, // Override existing files in the folder
  excludeRegistryPrefix: ?boolean, // exclude the registry prefix from the component's name in the package.json
  dist: ?boolean, // Write dist files
  conf: ?boolean, // Write bit.json file
  verbose: boolean, // Print more logs
  silentClientResult: ?boolean // Print environment install result
};

const ENV_IS_INSTALLED_FILENAME = '.bit_env_has_installed';

export default class Environment {
  path: PathOsBased;
  scope: Scope;
  consumer: Consumer;

  constructor(scope: Scope, dir: ?string) {
    this.scope = scope;
    this.path = dir || path.join(scope.getPath(), ISOLATED_ENV_ROOT, v4());
    logger.debug(`creating a new isolated environment at ${this.path}`);
  }

  async create(): Promise<void> {
    await mkdirp(this.path);
    this.consumer = await Consumer.createIsolatedWithExistingScope(this.path, this.scope);
  }

  /**
   * import a component end to end. Including importing the dependencies and installing the npm
   * packages.
   *
   * @param {BitId | string} bitId - the component id to isolate
   * @param {IsolateOptions} opts
   * @return {Promise.<Component>}
   */
  async isolateComponent(bitId: BitId | string, opts: IsolateOptions): Promise<ComponentWithDependencies> {
    // add this if statement due to extentions calling this api directly with bitId as string with version
    if (typeof bitId === 'string') {
      bitId = BitId.parse(bitId, true);
    }
    const saveDependenciesAsComponents =
      opts.saveDependenciesAsComponents === undefined ? true : opts.saveDependenciesAsComponents;
    const componentsWithDependencies = await this.consumer.importComponents(
      BitIds.fromArray([bitId]),
      false,
      saveDependenciesAsComponents
    );
    const componentWithDependencies = componentsWithDependencies[0];
    const writeToPath = opts.writeToPath || this.path;
    const concreteOpts = {
      consumer: this.consumer,
      componentsWithDependencies,
      writeToPath,
      override: opts.override,
      writePackageJson: !opts.noPackageJson,
      writeConfig: opts.conf,
      writeBitDependencies: opts.writeBitDependencies,
      createNpmLinkFiles: opts.createNpmLinkFiles,
      writeDists: opts.dist,
      installNpmPackages: !!opts.installPackages, // convert to boolean
      installPeerDependencies: !!opts.installPackages, // convert to boolean
      addToRootPackageJson: false,
      verbose: opts.verbose,
      excludeRegistryPrefix: !!opts.excludeRegistryPrefix,
      silentPackageManagerResult: opts.silentPackageManagerResult
    };
    const manyComponentsWriter = new ManyComponentsWriter(concreteOpts);
    await manyComponentsWriter.writeAll();
    await Environment.markEnvironmentAsInstalled(writeToPath);
    return componentWithDependencies;
  }

  /**
   * It helps to make sure an environment is installed. Otherwise, in case a user interrupts the environment
   * installation process, it won't be installed again.
   */
  static markEnvironmentAsInstalled(dir) {
    const filePath = path.join(dir, ENV_IS_INSTALLED_FILENAME);
    return outputFile({ filePath, content: '' });
  }

  static isEnvironmentInstalled(dir) {
    const filePath = path.join(dir, ENV_IS_INSTALLED_FILENAME);
    return fs.existsSync(filePath);
  }

  getPath(): string {
    return this.path;
  }

  destroy(): Promise<*> {
    logger.debug(`destroying the isolated environment at ${this.path}`);
    logger.info(`environment, deleting ${this.path}`);
    return fs.remove(this.path);
  }

  async destroyIfExist(): Promise<*> {
    const isExist = await fs.exists(this.path);
    if (isExist) {
      logger.debug(`destroying existing environment in path ${this.path}`);
      return this.destroy();
    }
    return false;
  }
}
