/** @flow */
import R from 'ramda';
import chalk from 'chalk';
import { NothingToImport } from '../exceptions';
import { BitId, BitIds } from '../../bit-id';
import Component from '../component';
import { Consumer } from '../../consumer';
import { ComponentWithDependencies } from '../../scope';
import loader from '../../cli/loader';
import { BEFORE_IMPORT_ACTION } from '../../cli/loader/loader-messages';
import logger from '../../logger/logger';
import { filterAsync } from '../../utils';

export type ImportOptions = {
  ids?: string[],
  verbose: boolean,
  withEnvironments: boolean,
  writeToPath?: string,
  writePackageJson: boolean,
  writeBitJson: boolean,
  writeDists: boolean,
  force: boolean,
  installNpmPackages: boolean,
  objectsOnly: boolean,
  saveDependenciesAsComponents?: boolean
};

export type ImportResult = Promise<{ dependencies: ComponentWithDependencies[], envDependencies?: Component[] }>;

export default class ImportComponents {
  constructor(consumer: Consumer, options: ImportOptions) {
    this.consumer = consumer;
    this.options = options;
  }

  importComponents(): ImportResult {
    loader.start(BEFORE_IMPORT_ACTION);
    this.options.saveDependenciesAsComponents = this.consumer.bitJson.saveDependenciesAsComponents;
    if (!this.options.writePackageJson) {
      // if package.json is not written, it's impossible to install the packages and dependencies as npm packages
      this.options.installNpmPackages = false;
      this.options.saveDependenciesAsComponents = true;
    }
    if (!this.options.ids || R.isEmpty(this.options.ids)) {
      return this.importAccordingToBitJsonAndBitMap();
    }
    return this.importSpecificComponents();
  }

  async importSpecificComponents(): ImportResult {
    logger.debug(`importSpecificComponents, Ids: ${this.options.ids.join(', ')}`);
    // $FlowFixMe - we check if there are bitIds before we call this function
    const bitIds = this.options.ids.map(raw => BitId.parse(raw));
    if (!this.options.force) {
      await this.warnForModifiedOrNewComponents(bitIds);
    }
    const componentsWithDependencies = await this.consumer.scope.getManyWithAllVersions(bitIds, false);
    await this.consumer.writeToComponentsDir({
      componentsWithDependencies,
      writeToPath: this.options.writeToPath,
      withPackageJson: this.options.writePackageJson,
      withBitJson: this.options.writeBitJson,
      dist: this.options.writeDists,
      saveDependenciesAsComponents: this.options.saveDependenciesAsComponents,
      installNpmPackages: this.options.installNpmPackages,
      verbose: this.options.verbose
    });
    return { dependencies: componentsWithDependencies };
  }

  async importAccordingToBitJsonAndBitMap(): ImportResult {
    const dependenciesFromBitJson = BitIds.fromObject(this.consumer.bitJson.dependencies);
    const componentsFromBitMap = this.consumer.bitMap.getAuthoredExportedComponents();

    if ((R.isNil(dependenciesFromBitJson) || R.isEmpty(dependenciesFromBitJson)) && R.isEmpty(componentsFromBitMap)) {
      if (!this.options.withEnvironments) {
        return Promise.reject(new NothingToImport());
      } else if (R.isNil(this.consumer.testerId) && R.isNil(this.consumer.compilerId)) {
        return Promise.reject(new NothingToImport());
      }
    }
    if (!this.options.force) {
      const allComponentsIds = dependenciesFromBitJson.concat(componentsFromBitMap);
      await this.warnForModifiedOrNewComponents(allComponentsIds);
    }

    let componentsAndDependenciesBitJson = [];
    let componentsAndDependenciesBitMap = [];
    if (dependenciesFromBitJson) {
      componentsAndDependenciesBitJson = await this.consumer.scope.getManyWithAllVersions(
        dependenciesFromBitJson,
        false
      );
      await this.consumer.writeToComponentsDir({
        componentsWithDependencies: componentsAndDependenciesBitJson,
        withPackageJson: this.options.writePackageJson,
        withBitJson: this.options.writeBitJson,
        dist: this.options.writeDists,
        saveDependenciesAsComponents: this.options.saveDependenciesAsComponents,
        installNpmPackages: this.options.installNpmPackages,
        verbose: this.options.verbose
      });
    }
    if (componentsFromBitMap.length) {
      componentsAndDependenciesBitMap = await this.consumer.scope.getManyWithAllVersions(componentsFromBitMap, false);
      // Don't write the package.json for an authored component, because its dependencies probably managed by the root
      // package.json. Also, don't install npm packages for the same reason.
      await this.consumer.writeToComponentsDir({
        componentsWithDependencies: componentsAndDependenciesBitMap,
        force: false,
        withPackageJson: false,
        installNpmPackages: false,
        withBitJson: this.options.writeBitJson,
        dist: this.options.writeDists
      });
    }
    const componentsAndDependencies = [...componentsAndDependenciesBitJson, ...componentsAndDependenciesBitMap];
    if (this.options.withEnvironments) {
      const envComponents = await this.consumer.scope.installEnvironment({
        ids: [this.consumer.testerId, this.consumer.compilerId],
        verbose: this.options.verbose
      });
      return {
        dependencies: componentsAndDependencies,
        envDependencies: envComponents
      };
    }
    return { dependencies: componentsAndDependencies };
  }

  async warnForModifiedOrNewComponents(ids: BitId[]) {
    const modifiedComponents = await filterAsync(ids, (id) => {
      return this.consumer.getComponentStatusById(id).then(status => status.modified || status.newlyCreated);
    });

    if (modifiedComponents.length) {
      return Promise.reject(
        chalk.yellow(
          `unable to import the following components due to local changes, use --force flag to override your local changes\n${modifiedComponents.join(
            '\n'
          )} `
        )
      );
    }
    return Promise.resolve();
  }
}
