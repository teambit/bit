import fs from 'fs-extra';
import * as path from 'path';
import v4 from 'uuid';

import { BitId, BitIds } from '../bit-id';
import { ISOLATED_ENV_ROOT } from '../constants';
import { Consumer } from '../consumer';
import ManyComponentsWriter, { ManyComponentsWriterParams } from '../consumer/component-ops/many-components-writer';
import logger from '../logger/logger';
import { ComponentWithDependencies, Scope } from '../scope';
import { outputFile } from '../utils';
import { PathOsBased } from '../utils/path';
import { IsolateOptions } from './isolator';

const ENV_IS_INSTALLED_FILENAME = '.bit_env_has_installed';

export default class Environment {
  path: PathOsBased;
  scope: Scope;
  consumer?: Consumer;

  constructor(scope: Scope, dir: string | null | undefined) {
    this.scope = scope;
    this.path = dir || path.join(scope.getPath(), ISOLATED_ENV_ROOT, v4());
    logger.debug(`creating a new isolated environment at ${this.path}`);
  }

  async create(): Promise<void> {
    await fs.ensureDir(this.path);
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
    // add this if statement due to extensions calling this api directly with bitId as string with version
    if (typeof bitId === 'string') {
      bitId = BitId.parse(bitId, true);
    }
    const saveDependenciesAsComponents =
      opts.saveDependenciesAsComponents === undefined ? true : opts.saveDependenciesAsComponents;
    if (!this.consumer) {
      throw new Error('trying to import component without define consumer');
    }
    const componentsWithDependencies = await this.consumer.importComponents(
      BitIds.fromArray([bitId]),
      false,
      saveDependenciesAsComponents
    );
    const componentWithDependencies = componentsWithDependencies[0];
    const writeToPath = opts.writeToPath || this.path;
    const concreteOpts: ManyComponentsWriterParams = {
      consumer: this.consumer,
      componentsWithDependencies,
      writeToPath,
      override: opts.override,
      writePackageJson: opts.writePackageJson,
      writeConfig: opts.writeConfig,
      ignoreBitDependencies: !opts.writeBitDependencies,
      createNpmLinkFiles: opts.createNpmLinkFiles,
      writeDists: opts.writeDists,
      saveDependenciesAsComponents: opts.saveDependenciesAsComponents !== false,
      installNpmPackages: !!opts.installNpmPackages, // convert to boolean
      installPeerDependencies: !!opts.installPeerDependencies, // convert to boolean
      addToRootPackageJson: false,
      installProdPackagesOnly: opts.installProdPackagesOnly,
      verbose: opts.verbose,
      excludeRegistryPrefix: !!opts.excludeRegistryPrefix,
      silentPackageManagerResult: opts.silentPackageManagerResult,
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

  destroy(): Promise<any> {
    logger.debug(`destroying the isolated environment at ${this.path}`);
    logger.info(`environment, deleting ${this.path}`);
    return fs.remove(this.path);
  }

  async destroyIfExist(): Promise<any> {
    const isExist = await fs.pathExists(this.path);
    if (isExist) {
      logger.debug(`destroying existing environment in path ${this.path}`);
      return this.destroy();
    }
    return false;
  }
}
