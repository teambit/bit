/** @flow */
import v4 from 'uuid';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import R from 'ramda';
import { Scope, ComponentWithDependencies } from '../scope';
import { BitId } from '../bit-id';
import { ISOLATED_ENV_ROOT } from '../constants';
import { mkdirp, outputFile } from '../utils';
import logger from '../logger/logger';
import { Consumer } from '../consumer';
import type { PathOsBased } from '../utils/path';
import writeComponents from '../consumer/component-ops/write-components';
import VersionDependencies from '../scope/version-dependencies';

import { write } from '../consumer/component/package-json';
import { installNpmPackagesForComponents } from '../npm-client/install-packages';
import execa from 'execa';
import promiseLimit from 'promise-limit';

const limit = promiseLimit(10);

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

const createSandboxStub = () => {
  const dir = path.join(os.tmpdir(), ISOLATED_ENV_ROOT, v4());
  try {
    fs.emptydirSync(dir);
    fs.rmdirSync(dir);
  } catch (e) {}
  fs.ensureDirSync(dir);
  return Promise.resolve({
    async updateFs(files) {
      Object.keys(files).forEach((fileName) => {
        const contents = files[fileName];
        const fileFullPath = `${dir}/${fileName}`;
        try {
          fs.ensureDirSync(path.dirname(fileFullPath));
        } catch (e) {}
        fs.writeFileSync(fileFullPath, contents);
      });
    },
    async exec(command, options) {
      const { stdout } = await execa.shell(command, { cwd: dir });
      return stdout;
    },
    getSandboxFolder() {
      // this is a temporary helper method for the purposes of the PNP POC - please do not use in prod code
      return dir;
    }
  });
};

export default class Environment {
  path: PathOsBased;
  scope: Scope;
  consumer: Consumer;

  constructor(scope: Scope, dir: ?string) {
    this.scope = scope;
    this.path = dir || path.join(scope.getPath(), ISOLATED_ENV_ROOT, v4());
    this.yarnlock = fs.readFileSync(`${__dirname}/../../src/environment/yarn.lock`); // this is temporary for experimenting, do not commit this
    this.pnpjs = fs.readFileSync(`${__dirname}/../../src/environment/.pnp.js`); // this is temporary for experimenting, do not commit this
    this.execJestPnp = fs.readFileSync(`${__dirname}/../../src/environment/exec-jest-pnp.js`);
    this.pnpFolderPath = `${__dirname}/../../src/environment/.pnp`;
    logger.debug(`creating a new isolated environment at ${this.path}`);
  }

  async create(sandbox): Promise<void> {
    await mkdirp(this.path);
    this.consumer = await Consumer.createWithExistingScope(this.path, this.scope, true);
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
      bitId = await BitId.parse(bitId, true);
    }
    const componentsWithDependencies = await this.consumer.importComponents([bitId]);
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
      saveDependenciesAsComponents: opts.saveDependenciesAsComponents !== false,
      writeDists: opts.dist,
      installNpmPackages: !!opts.installPackages, // convert to boolean
      installPeerDependencies: !!opts.installPackages, // convert to boolean
      addToRootPackageJson: false,
      verbose: opts.verbose,
      excludeRegistryPrefix: !!opts.excludeRegistryPrefix,
      silentPackageManagerResult: opts.silentPackageManagerResult
    };
    await writeComponents(concreteOpts);
    await Environment.markEnvironmentAsInstalled(writeToPath);
    return componentWithDependencies;
  }

  /**
   * isolate a given component end to end. Including importing the dependencies and installing the npm
   * packages.
   *
   * @param {BitId} the component id to isolate
   * @param {IsolateOptions} opts
   * @return {Promise.<Component>}
   */
  isolateComponentToSandbox(component: Component, opts: IsolateOptions): Promise<ComponentWithDependencies> {
    return limit(async () => {
      const sandbox = await createSandboxStub();
      await sandbox.updateFs(
        component.files.reduce((toUpdate, cFile) => {
          const { relativePath, content } = cFile.toReadableString();
          return Object.assign({}, toUpdate, {
            [relativePath]: content
          });
        }, {})
      ); // TODO: also write dependency files
      const componentPackageJson = await write(this.consumer, component, this.consumer.getPath());
      componentPackageJson.version = componentPackageJson.version === 'latest' ? '1.0.0' : componentPackageJson.version;
      // TODO: ^^ fix this - npm would not install a non-semver version range
      await sandbox.updateFs({
        'package.json': componentPackageJson.toJson(), // TODO: various fields in package.json (eg. babel configuration)
        'yarn.lock': this.yarnlock,
        '.pnp.js': this.pnpjs,
        'exec-jest-pnp.js': this.execJestPnp
      });
      const sandboxFolder = sandbox.getSandboxFolder();
      await fs.copy(this.pnpFolderPath, `${sandboxFolder}/.pnp`);
      return sandbox;
    });
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
