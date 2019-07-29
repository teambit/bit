/** @flow */
import R from 'ramda';
import chalk from 'chalk';
import { NothingToImport } from '../exceptions';
import { BitId } from '../../bit-id';
import Component from '../component';
import { Consumer } from '../../consumer';
import { ComponentWithDependencies, Scope } from '../../scope';
import loader from '../../cli/loader';
import { BEFORE_IMPORT_ACTION } from '../../cli/loader/loader-messages';
import logger from '../../logger/logger';
import { filterAsync, pathNormalizeToLinux } from '../../utils';
import GeneralError from '../../error/general-error';
import type { MergeStrategy, FilesStatus } from '../versions-ops/merge-version/merge-version';
import { applyModifiedVersion } from '../versions-ops/checkout-version';
import { threeWayMerge, MergeOptions, FileStatus, getMergeStrategyInteractive } from '../versions-ops/merge-version';
import type { MergeResultsThreeWay } from '../versions-ops/merge-version/three-way-merge';
import ManyComponentsWriter from './many-components-writer';
import { COMPONENT_ORIGINS } from '../../constants';
import hasWildcard from '../../utils/string/has-wildcard';
import { listScope } from '../../api/consumer';

export type ImportOptions = {
  ids: string[], // array might be empty
  verbose: boolean, // default: false
  merge?: boolean, // default: false
  mergeStrategy?: MergeStrategy,
  withEnvironments: boolean, // default: false
  writeToPath?: string,
  writePackageJson: boolean, // default: true
  writeConfig: boolean, // default: false
  configDir?: string,
  writeDists: boolean, // default: true
  override: boolean, // default: false
  installNpmPackages: boolean, // default: true
  objectsOnly: boolean, // default: false
  saveDependenciesAsComponents?: boolean // default: false
};
type ComponentMergeStatus = {
  componentWithDependencies: ComponentWithDependencies,
  mergeResults: ?MergeResultsThreeWay
};
type ImportedVersions = { [id: string]: string[] };
export type ImportStatus = 'added' | 'updated' | 'up to date';
export type ImportDetails = { id: string, versions: string[], status: ImportStatus, filesStatus: ?FilesStatus };
export type ImportResult = Promise<{
  dependencies: ComponentWithDependencies[],
  envComponents?: Component[],
  importDetails: ImportDetails[]
}>;

export default class ImportComponents {
  consumer: Consumer;
  scope: Scope;
  options: ImportOptions;
  mergeStatus: { [id: string]: FilesStatus };
  constructor(consumer: Consumer, options: ImportOptions) {
    this.consumer = consumer;
    this.scope = consumer.scope;
    this.options = options;
  }

  importComponents(): ImportResult {
    loader.start(BEFORE_IMPORT_ACTION);
    this.options.saveDependenciesAsComponents = this.consumer.config.saveDependenciesAsComponents;
    if (!this.options.writePackageJson) {
      // if package.json is not written, it's impossible to install the packages and dependencies as npm packages
      this.options.installNpmPackages = false;
      this.options.saveDependenciesAsComponents = true;
    }
    if (!this.options.ids || R.isEmpty(this.options.ids)) {
      return this.importAccordingToBitMap();
    }
    return this.importSpecificComponents();
  }

  async importSpecificComponents(): ImportResult {
    logger.debug(`importSpecificComponents, Ids: ${this.options.ids.join(', ')}`);
    const bitIds = await this._getBitIds();
    const beforeImportVersions = await this._getCurrentVersions(bitIds);
    await this._throwForPotentialIssues(bitIds);
    const componentsWithDependencies = await this.consumer.importComponents(
      bitIds,
      true,
      this.options.saveDependenciesAsComponents
    );
    await this._writeToFileSystem(componentsWithDependencies);
    const importDetails = await this._getImportDetails(beforeImportVersions, componentsWithDependencies);
    return { dependencies: componentsWithDependencies, importDetails };
  }

  async _getBitIds(): Promise<BitId[]> {
    const bitIds: BitId[] = [];
    await Promise.all(
      this.options.ids.map(async (idStr: string) => {
        if (hasWildcard(idStr)) {
          if (!idStr.includes('/')) {
            throw new GeneralError(
              `import with wildcards expects full scope-name before the wildcards, instead, got "${idStr}"`
            );
          }
          const idSplit = idStr.split('/');
          const scopeName = idSplit[0];
          const namespacesUsingWildcards = R.tail(idSplit).join('/');
          const listResult = await listScope({ scopeName, namespacesUsingWildcards });
          if (!listResult.length) {
            throw new GeneralError(`no components found on the remote scope matching the "${idStr}" pattern`);
          }
          loader.start(BEFORE_IMPORT_ACTION); // it stops the previous loader of BEFORE_REMOTE_LIST
          const ids = listResult.map(result => result.id);
          bitIds.push(...ids);
        } else {
          bitIds.push(BitId.parse(idStr, true)); // we don't support importing without a scope name
        }
      })
    );
    return bitIds;
  }

  async importAccordingToBitMap(): ImportResult {
    this.options.objectsOnly = !this.options.merge && !this.options.override;

    const authoredExportedComponents = this.consumer.bitMap.getAuthoredExportedComponents();
    const importedComponents = this.consumer.bitMap.getAllBitIds([COMPONENT_ORIGINS.IMPORTED]);
    const componentsIdsToImport = [...authoredExportedComponents, ...importedComponents];

    let compiler;
    let tester;

    if (R.isEmpty(componentsIdsToImport)) {
      if (!this.options.withEnvironments) {
        throw new NothingToImport();
      }
      compiler = await this.consumer.compiler;
      tester = await this.consumer.tester;
      if (!tester && !compiler) {
        throw new NothingToImport();
      }
    }
    await this._throwForModifiedOrNewComponents(componentsIdsToImport);
    const beforeImportVersions = await this._getCurrentVersions(componentsIdsToImport);

    let componentsAndDependencies = [];
    if (componentsIdsToImport.length) {
      componentsAndDependencies = await this.consumer.importComponents(componentsIdsToImport, true);
      await this._writeToFileSystem(componentsAndDependencies);
    }
    const importDetails = await this._getImportDetails(beforeImportVersions, componentsAndDependencies);
    if (this.options.withEnvironments) {
      compiler = compiler || (await this.consumer.compiler);
      tester = tester || (await this.consumer.tester);
      const context = { workspaceDir: this.consumer.getPath() };
      const envsArgs = [this.consumer.scope, { verbose: this.options.verbose }, context];
      const envComponents = [];
      if (compiler) {
        envComponents.push(await compiler.install(...envsArgs));
      }
      if (tester) {
        envComponents.push(await tester.install(...envsArgs));
      }
      return {
        dependencies: componentsAndDependencies,
        envComponents: R.flatten(envComponents),
        importDetails
      };
    }

    return { dependencies: componentsAndDependencies, importDetails };
  }

  async _getCurrentVersions(ids: BitId[]): ImportedVersions {
    const versionsP = ids.map(async (id) => {
      const modelComponent = await this.consumer.scope.getModelComponentIfExist(id);
      const idStr = id.toStringWithoutVersion();
      if (!modelComponent) return [idStr, []];
      return [idStr, modelComponent.listVersions()];
    });
    const versions = await Promise.all(versionsP);
    return R.fromPairs(versions);
  }

  /**
   * get import details, includes the diff between the versions array before import and after import
   */
  async _getImportDetails(
    currentVersions: ImportedVersions,
    components: ComponentWithDependencies[]
  ): Promise<ImportDetails[]> {
    const detailsP = components.map(async (component) => {
      const id = component.component.id;
      const idStr = id.toStringWithoutVersion();
      const beforeImportVersions = currentVersions[idStr];
      if (!beforeImportVersions) {
        throw new Error(
          `_getImportDetails failed finding ${idStr} in currentVersions, which has ${Object.keys(currentVersions).join(
            ', '
          )}`
        );
      }
      const modelComponent = await this.consumer.scope.getModelComponentIfExist(id);
      if (!modelComponent) throw new GeneralError(`imported component ${idStr} was not found in the model`);
      const afterImportVersions = modelComponent.listVersions();
      const versionDifference = R.difference(afterImportVersions, beforeImportVersions);
      const getStatus = (): ImportStatus => {
        if (!versionDifference.length) return 'up to date';
        if (!beforeImportVersions.length) return 'added';
        return 'updated';
      };
      const filesStatus = this.mergeStatus && this.mergeStatus[idStr] ? this.mergeStatus[idStr] : null;
      return { id: idStr, versions: versionDifference, status: getStatus(), filesStatus };
    });
    return Promise.all(detailsP);
  }

  async _throwForPotentialIssues(ids: BitId[]): Promise<void> {
    await this._throwForModifiedOrNewComponents(ids);
    this._throwForDifferentComponentWithSameName(ids);
  }

  async _throwForModifiedOrNewComponents(ids: BitId[]) {
    // the typical objectsOnly option is when a user cloned a project with components tagged to the source code, but
    // doesn't have the model objects. in that case, calling getComponentStatusById() may return an error as it relies
    // on the model objects when there are dependencies
    if (this.options.override || this.options.objectsOnly || this.options.merge) return Promise.resolve();
    const modifiedComponents = await filterAsync(ids, (id) => {
      return this.consumer.getComponentStatusById(id).then(status => status.modified || status.newlyCreated);
    });

    if (modifiedComponents.length) {
      throw new GeneralError(
        chalk.yellow(
          `unable to import the following components due to local changes, use --override flag to override your local changes\n${modifiedComponents.join(
            '\n'
          )} `
        )
      );
    }
    return Promise.resolve();
  }

  /**
   * Model Component id() calculation uses id.toString() for the hash.
   * If an imported component has scope+name equals to a local name, both will have the exact same
   * hash and they'll override each other.
   */
  _throwForDifferentComponentWithSameName(ids: BitId[]): void {
    ids.forEach((id: BitId) => {
      const existingId = this.consumer.getParsedIdIfExist(id.toStringWithoutVersion());
      if (existingId && !existingId.hasScope()) {
        throw new GeneralError(`unable to import ${id.toString()}. the component name conflicted with your local component with the same name.
        it's fine to have components with the same name as long as their scope names are different.
        Make sure to export your component first to get a scope and then try importing again`);
      }
    });
  }

  async _getMergeStatus(componentWithDependencies: ComponentWithDependencies): Promise<ComponentMergeStatus> {
    const component = componentWithDependencies.component;
    const componentStatus = await this.consumer.getComponentStatusById(component.id);
    const mergeStatus: ComponentMergeStatus = { componentWithDependencies, mergeResults: null };
    if (!componentStatus.modified) return mergeStatus;
    const componentModel = await this.consumer.scope.sources.get(component.id);
    if (!componentModel) {
      throw new GeneralError(`component ${component.id.toString()} wasn't found in the model`);
    }
    const existingBitMapBitId = this.consumer.bitMap.getBitId(component.id, { ignoreVersion: true });
    const fsComponent = await this.consumer.loadComponent(existingBitMapBitId);
    const currentlyUsedVersion = existingBitMapBitId.version;
    const baseComponent: Component = await this.consumer.loadComponentFromModel(existingBitMapBitId);
    const currentComponent: Component = await this.consumer.loadComponentFromModel(component.id);
    const mergeResults = await threeWayMerge({
      consumer: this.consumer,
      otherComponent: fsComponent,
      otherVersion: currentlyUsedVersion,
      currentComponent, // $FlowFixMe
      currentVersion: component.id.version,
      baseComponent
    });
    mergeStatus.mergeResults = mergeResults;
    return mergeStatus;
  }

  /**
   * 1) when there are conflicts and the strategy is "ours", don't write the imported component to
   * the filesystem, only update bitmap.
   *
   * 2) when there are conflicts and the strategy is "theirs", override the local changes by the
   * imported component. (similar to --override)
   *
   * 3) when there is no conflict or there are conflicts and the strategy is manual, write the files
   * according to the merge result. (done by applyModifiedVersion())
   */
  _updateComponentFilesPerMergeStrategy(componentMergeStatus: ComponentMergeStatus): ?FilesStatus {
    const mergeResults = componentMergeStatus.mergeResults;
    if (!mergeResults) return null;
    const component = componentMergeStatus.componentWithDependencies.component;
    const files = component.files;

    const filesStatus = {};
    if (mergeResults.hasConflicts && this.options.mergeStrategy === MergeOptions.ours) {
      // don't write the files to the filesystem, only bump the bitmap version.
      files.forEach((file) => {
        filesStatus[pathNormalizeToLinux(file.relative)] = FileStatus.unchanged;
      });
      this.consumer.bitMap.updateComponentId(component.id);
      this.consumer.bitMap.hasChanged = true;
      return filesStatus;
    }
    if (mergeResults.hasConflicts && this.options.mergeStrategy === MergeOptions.theirs) {
      // the local changes will be overridden (as if the user entered --override flag for this component)
      files.forEach((file) => {
        filesStatus[pathNormalizeToLinux(file.relative)] = FileStatus.updated;
      });
      return filesStatus;
    }
    return applyModifiedVersion(component.files, mergeResults, this.options.mergeStrategy);
  }

  /**
   * update the component files if they are modified and there is a merge strategy.
   * returns only the components that need to be written to the filesystem
   */
  async updateAllComponentsAccordingToMergeStrategy(
    componentsWithDependencies: ComponentWithDependencies[]
  ): Promise<ComponentWithDependencies[]> {
    if (!this.options.merge) return componentsWithDependencies;
    const componentsStatusP = componentsWithDependencies.map((componentWithDependencies: ComponentWithDependencies) => {
      return this._getMergeStatus(componentWithDependencies);
    });
    const componentsStatus = await Promise.all(componentsStatusP);
    const componentWithConflict = componentsStatus.find(
      component => component.mergeResults && component.mergeResults.hasConflicts
    );
    if (componentWithConflict && !this.options.mergeStrategy) {
      this.options.mergeStrategy = await getMergeStrategyInteractive();
    }
    this.mergeStatus = {};

    const componentsToWrite = componentsStatus.map((componentStatus) => {
      const filesStatus: ?FilesStatus = this._updateComponentFilesPerMergeStrategy(componentStatus);
      const componentWithDependencies = componentStatus.componentWithDependencies;
      if (!filesStatus) return componentWithDependencies;
      this.mergeStatus[componentWithDependencies.component.id.toStringWithoutVersion()] = filesStatus;
      const unchangedFiles = Object.keys(filesStatus).filter(file => filesStatus[file] === FileStatus.unchanged);
      if (unchangedFiles.length === Object.keys(filesStatus).length) {
        // all files are unchanged
        return null;
      }
      return componentWithDependencies;
    });
    const removeNulls = R.reject(R.isNil);
    return removeNulls(componentsToWrite);
  }

  async _writeToFileSystem(componentsWithDependencies: ComponentWithDependencies[]) {
    if (this.options.objectsOnly) return;
    const componentsToWrite = await this.updateAllComponentsAccordingToMergeStrategy(componentsWithDependencies);
    if (this.options.writeConfig && !this.options.configDir) {
      this.options.configDir = this.consumer.dirStructure.ejectedEnvsDirStructure;
    }
    const manyComponentsWriter = new ManyComponentsWriter({
      consumer: this.consumer,
      componentsWithDependencies: componentsToWrite,
      writeToPath: this.options.writeToPath,
      writePackageJson: this.options.writePackageJson,
      writeConfig: this.options.writeConfig,
      configDir: this.options.configDir,
      writeDists: this.options.writeDists,
      installNpmPackages: this.options.installNpmPackages,
      verbose: this.options.verbose,
      override: this.options.override
    });
    await manyComponentsWriter.writeAll();
  }
}
