import chalk from 'chalk';
import R from 'ramda';
import semver from 'semver';
import { isTag } from '@teambit/component-version';
import { getRemoteBitIdsByWildcards } from '../../api/consumer/lib/list-scope';
import { BitId, BitIds } from '../../bit-id';
import loader from '../../cli/loader';
import { BEFORE_IMPORT_ACTION } from '../../cli/loader/loader-messages';
import { COMPONENT_ORIGINS } from '../../constants';
import { Consumer } from '../../consumer';
import GeneralError from '../../error/general-error';
import ShowDoctorError from '../../error/show-doctor-error';
import { RemoteLaneId } from '../../lane-id/lane-id';
import logger from '../../logger/logger';
import Remotes from '../../remotes/remotes';
import { ComponentWithDependencies, Scope } from '../../scope';
import ScopeComponentsImporter from '../../scope/component-ops/scope-components-importer';
import DependencyGraph from '../../scope/graph/scope-graph';
import { Lane, ModelComponent, Version } from '../../scope/models';
import { getScopeRemotes } from '../../scope/scope-remotes';
import { pathNormalizeToLinux } from '../../utils';
import hasWildcard from '../../utils/string/has-wildcard';
import Component from '../component';
import { NothingToImport } from '../exceptions';
import { applyModifiedVersion } from '../versions-ops/checkout-version';
import { FileStatus, getMergeStrategyInteractive, MergeOptions, threeWayMerge } from '../versions-ops/merge-version';
import { FilesStatus, MergeStrategy } from '../versions-ops/merge-version/merge-version';
import { MergeResultsThreeWay } from '../versions-ops/merge-version/three-way-merge';
import ComponentsPendingMerge from './exceptions/components-pending-merge';
import ManyComponentsWriter from './many-components-writer';

export type ImportOptions = {
  ids: string[]; // array might be empty
  verbose: boolean; // default: false
  merge?: boolean; // default: false
  mergeStrategy?: MergeStrategy;
  withEnvironments: boolean; // default: false
  writeToPath?: string;
  writePackageJson: boolean; // default: true
  writeConfig: boolean; // default: false
  writeDists: boolean; // default: true
  override: boolean; // default: false
  installNpmPackages: boolean; // default: true
  objectsOnly: boolean; // default: false
  saveDependenciesAsComponents?: boolean; // default: false,
  importDependenciesDirectly?: boolean; // default: false, normally it imports them as packages or nested, not as imported
  importDependents?: boolean; // default: false,
  fromOriginalScope?: boolean; // default: false, otherwise, it fetches flattened dependencies from their dependents
  skipLane?: boolean; // save on master instead of current lane
  lanes?: { laneIds: RemoteLaneId[]; lanes?: Lane[] };
};
type ComponentMergeStatus = {
  componentWithDependencies: ComponentWithDependencies;
  mergeResults: MergeResultsThreeWay | null | undefined;
};
type ImportedVersions = { [id: string]: string[] };
export type ImportStatus = 'added' | 'updated' | 'up to date';
export type ImportDetails = {
  id: string;
  versions: string[];
  status: ImportStatus;
  filesStatus: FilesStatus | null | undefined;
  missingDeps: BitId[];
};
export type ImportResult = Promise<{
  dependencies: ComponentWithDependencies[];
  envComponents?: Component[];
  importDetails: ImportDetails[];
}>;

export default class ImportComponents {
  consumer: Consumer;
  scope: Scope;
  options: ImportOptions;
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  mergeStatus: { [id: string]: FilesStatus };
  private divergeData: Array<ModelComponent> = [];
  // @ts-ignore
  constructor(consumer: Consumer, options: ImportOptions) {
    this.consumer = consumer;
    this.scope = consumer.scope;
    this.options = options;
  }

  importComponents(): ImportResult {
    loader.start(BEFORE_IMPORT_ACTION);
    this.options.saveDependenciesAsComponents = this.consumer.config._saveDependenciesAsComponents;
    if (!this.options.writePackageJson) {
      // if package.json is not written, it's impossible to install the packages and dependencies as npm packages
      this.options.installNpmPackages = false;
      this.options.saveDependenciesAsComponents = true;
    }
    if (!this.options.lanes && (!this.options.ids || R.isEmpty(this.options.ids))) {
      return this.importAccordingToBitMap();
    }
    return this.importSpecificComponents();
  }

  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  async importSpecificComponents(): ImportResult {
    logger.debug(`importSpecificComponents, Ids: ${this.options.ids.join(', ')}`);
    const bitIds: BitIds = await this._getBitIds();
    const beforeImportVersions = await this._getCurrentVersions(bitIds);
    await this._throwForPotentialIssues(bitIds);
    const componentsWithDependencies = await this.consumer.importComponents(
      bitIds,
      true,
      this.options.saveDependenciesAsComponents
    );
    await this._throwForModifiedOrNewDependencies(componentsWithDependencies);
    const componentsWithDependenciesFiltered = this._filterComponentsWithLowerVersions(componentsWithDependencies);
    await this._fetchDivergeData(componentsWithDependenciesFiltered);
    this._throwForDivergedHistory();
    await this._writeToFileSystem(componentsWithDependenciesFiltered);
    await this._saveLaneDataIfNeeded(componentsWithDependenciesFiltered);
    const importDetails = await this._getImportDetails(beforeImportVersions, componentsWithDependencies);
    return { dependencies: componentsWithDependenciesFiltered, importDetails };
  }

  async _fetchDivergeData(componentsWithDependencies: ComponentWithDependencies[]) {
    await Promise.all(
      componentsWithDependencies.map(async ({ component }) => {
        const modelComponent = await this.scope.getModelComponent(component.id);
        await modelComponent.setDivergeData(this.scope.objects);
        this.divergeData.push(modelComponent);
      })
    );
  }

  _throwForDivergedHistory() {
    if (this.options.merge || this.options.objectsOnly) return;
    const divergedComponents = this.divergeData.filter((modelComponent) =>
      modelComponent.getDivergeData().isDiverged()
    );
    if (divergedComponents.length) {
      const divergeData = divergedComponents.map((modelComponent) => ({
        id: modelComponent.id(),
        snapsLocal: modelComponent.getDivergeData().snapsOnLocalOnly.length,
        snapsRemote: modelComponent.getDivergeData().snapsOnRemoteOnly.length,
      }));
      throw new ComponentsPendingMerge(divergeData);
    }
  }

  /**
   * it can happen for example when importing a component with `--dependent` flag and the component has
   * the same dependent with different versions. we only want the one with the higher version
   */
  _filterComponentsWithLowerVersions(
    componentsWithDependencies: ComponentWithDependencies[]
  ): ComponentWithDependencies[] {
    return componentsWithDependencies.filter((comp) => {
      const sameIdHigherVersion = componentsWithDependencies.find(
        (c) =>
          !c.component.id.isEqual(comp.component.id) &&
          c.component.id.isEqualWithoutVersion(comp.component.id) &&
          isTag(c.component.id.version) &&
          isTag(comp.component.id.version) &&
          semver.gt(c.component.id.version as string, comp.component.id.version as string)
      );
      return !sameIdHigherVersion;
    });
  }

  async _getBitIds(): Promise<BitIds> {
    const bitIds: BitId[] = [];
    if (this.options.lanes) {
      const scopeComponentImporter = ScopeComponentsImporter.getInstance(this.consumer.scope);
      const lanes = await scopeComponentImporter.importLanes(this.options.lanes.laneIds);
      lanes.forEach((lane) => bitIds.push(...lane.toBitIds()));
    } else {
      await Promise.all(
        this.options.ids.map(async (idStr: string) => {
          if (hasWildcard(idStr)) {
            const ids = await getRemoteBitIdsByWildcards(idStr);
            loader.start(BEFORE_IMPORT_ACTION); // it stops the previous loader of BEFORE_REMOTE_LIST
            bitIds.push(...ids);
          } else {
            bitIds.push(BitId.parse(idStr, true)); // we don't support importing without a scope name
          }
        })
      );
    }
    if (this.options.importDependenciesDirectly || this.options.importDependents) {
      const graphs = await this._getComponentsGraphs(bitIds);
      if (this.options.importDependenciesDirectly) {
        const dependenciesIds = this._getDependenciesFromGraph(bitIds, graphs);
        bitIds.push(...dependenciesIds);
      }
      if (this.options.importDependents) {
        const dependentsIds = this._getDependentsFromGraph(bitIds, graphs);
        bitIds.push(...dependentsIds);
      }
    }
    return BitIds.uniqFromArray(bitIds);
  }

  _getDependenciesFromGraph(bitIds: BitId[], graphs: DependencyGraph[]): BitId[] {
    const dependencies = bitIds.map((bitId) => {
      const componentGraph = graphs.find((graph) => graph.scopeName === bitId.scope);
      if (!componentGraph) {
        throw new Error(`unable to find a graph for ${bitId.toString()}`);
      }
      const dependenciesInfo = componentGraph.getDependenciesInfo(bitId);
      return dependenciesInfo.map((d) => d.id);
    });
    return R.flatten(dependencies);
  }

  _getDependentsFromGraph(bitIds: BitId[], graphs: DependencyGraph[]): BitId[] {
    const dependents = bitIds.map((bitId) => {
      const componentGraph = graphs.find((graph) => graph.scopeName === bitId.scope);
      if (!componentGraph) {
        throw new Error(`unable to find a graph for ${bitId.toString()}`);
      }
      const dependentsInfo = componentGraph.getDependentsInfo(bitId);
      return dependentsInfo.map((d) => d.id);
    });
    return R.flatten(dependents);
  }

  async _getComponentsGraphs(bitIds: BitId[]): Promise<DependencyGraph[]> {
    const remotes: Remotes = await getScopeRemotes(this.consumer.scope);
    return remotes.scopeGraphs(bitIds, this.consumer.scope);
  }

  async importAccordingToBitMap(): ImportResult {
    this.options.objectsOnly = !this.options.merge && !this.options.override;

    const authoredExportedComponents = this.consumer.bitMap.getAuthoredExportedComponents();
    // this is probably not needed anymore because the build-one-graph already imports all
    // missing objects.
    // const idsOfDepsInstalledAsPackages = await this.getIdsOfDepsInstalledAsPackages();
    // @todo: when .bitmap has a remote-lane, it should import the lane object as well
    const importedComponents = this.consumer.bitMap.getAllIdsAvailableOnLane([COMPONENT_ORIGINS.IMPORTED]);
    const componentsIdsToImport = BitIds.fromArray([
      ...authoredExportedComponents,
      ...importedComponents,
      // ...idsOfDepsInstalledAsPackages,
    ]);

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

    let componentsAndDependencies: ComponentWithDependencies[] = [];
    if (componentsIdsToImport.length) {
      // change all ids version to 'latest'. otherwise, it tries to import local tags/snaps from a remote
      const idsWithLatestVersion = componentsIdsToImport.toVersionLatest();
      componentsAndDependencies =
        !this.consumer.isLegacy && this.options.objectsOnly
          ? await this.consumer.importComponentsObjectsHarmony(componentsIdsToImport, this.options.fromOriginalScope)
          : await this.consumer.importComponents(BitIds.fromArray(idsWithLatestVersion), true);
      await this._throwForModifiedOrNewDependencies(componentsAndDependencies);
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
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        envComponents.push(await compiler.install(...envsArgs));
      }
      if (tester) {
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        envComponents.push(await tester.install(...envsArgs));
      }
      return {
        dependencies: componentsAndDependencies,
        envComponents: R.flatten(envComponents),
        importDetails,
      };
    }

    return { dependencies: componentsAndDependencies, importDetails };
  }

  /**
   * author might require bit-components that were installed via a package-manager. in that case,
   * the objects are not imported until bit build or bit tag was running. this makes sure to get
   * the objects on 'bit import', so then in the UI, they'll be shown nicely.
   */
  async getIdsOfDepsInstalledAsPackages() {
    if (!this.options.objectsOnly) {
      // this is needed only when importing objects. we don't want these components to be written to the fs
      return [];
    }
    const authoredNonExportedComponentsIds = this.consumer.bitMap.getAuthoredNonExportedComponents();
    const { components: authoredNonExportedComponents } = await this.consumer.loadComponents(
      BitIds.fromArray(authoredNonExportedComponentsIds),
      false
    );
    const dependencies: BitId[] = R.flatten(authoredNonExportedComponents.map((c) => c.getAllDependenciesIds()));
    const missingDeps: BitId[] = [];
    await Promise.all(
      dependencies.map(async (dep) => {
        if (!dep.hasScope()) return;
        const isInScope = await this.scope.isComponentInScope(dep);
        if (!isInScope) missingDeps.push(dep);
      })
    );
    return missingDeps;
  }

  async _getCurrentVersions(ids: BitIds): Promise<ImportedVersions> {
    const versionsP = ids.map(async (id) => {
      const modelComponent = await this.consumer.scope.getModelComponentIfExist(id.changeVersion(undefined));
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
      if (!modelComponent) throw new ShowDoctorError(`imported component ${idStr} was not found in the model`);
      const afterImportVersions = modelComponent.listVersions();
      const versionDifference = R.difference(afterImportVersions, beforeImportVersions);
      const getStatus = (): ImportStatus => {
        if (!versionDifference.length) return 'up to date';
        if (!beforeImportVersions.length) return 'added';
        return 'updated';
      };
      const filesStatus = this.mergeStatus && this.mergeStatus[idStr] ? this.mergeStatus[idStr] : null;
      return {
        id: idStr,
        versions: versionDifference,
        status: getStatus(),
        filesStatus,
        missingDeps: component.missingDependencies,
      };
    });
    return Promise.all(detailsP);
  }

  async _throwForPotentialIssues(ids: BitIds): Promise<void> {
    await this._throwForModifiedOrNewComponents(ids);
    this._throwForDifferentComponentWithSameName(ids);
  }

  async _throwForModifiedOrNewComponents(ids: BitIds): Promise<void> {
    // the typical objectsOnly option is when a user cloned a project with components tagged to the source code, but
    // doesn't have the model objects. in that case, calling getComponentStatusById() may return an error as it relies
    // on the model objects when there are dependencies
    if (this.options.override || this.options.objectsOnly || this.options.merge) return;
    const componentsStatuses = await this.consumer.getManyComponentsStatuses(ids);
    const modifiedComponents = componentsStatuses
      .filter(({ status }) => status.modified || status.newlyCreated)
      .map((c) => c.id);
    if (modifiedComponents.length) {
      throw new GeneralError(
        chalk.yellow(
          `unable to import the following components due to local changes, use --merge flag to merge your local changes or --override to override them\n${modifiedComponents.join(
            '\n'
          )} `
        )
      );
    }
  }

  async _throwForModifiedOrNewDependencies(componentsAndDependencies: ComponentWithDependencies[]) {
    const allDependenciesIds = R.flatten(
      componentsAndDependencies.map((componentAndDependencies) =>
        componentAndDependencies.component.dependencies.getAllIds()
      )
    );
    await this._throwForModifiedOrNewComponents(allDependenciesIds);
  }

  /**
   * Model Component id() calculation uses id.toString() for the hash.
   * If an imported component has scopereadonly name equals to a local name, both will have the exact same
   * hash and they'll override each other.
   */
  _throwForDifferentComponentWithSameName(ids: BitIds): void {
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
    const componentModel = await this.consumer.scope.getModelComponent(component.id);
    const existingBitMapBitId = this.consumer.bitMap.getBitId(component.id, { ignoreVersion: true });
    const fsComponent = await this.consumer.loadComponent(existingBitMapBitId);
    const currentlyUsedVersion = existingBitMapBitId.version;
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    const baseComponent: Version = await componentModel.loadVersion(currentlyUsedVersion, this.consumer.scope.objects);
    const currentComponent: Version = await componentModel.loadVersion(
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      component.id.version,
      this.consumer.scope.objects
    );
    const mergeResults = await threeWayMerge({
      consumer: this.consumer,
      otherComponent: fsComponent,
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      otherLabel: `${currentlyUsedVersion} modified`,
      currentComponent,
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      currentLabel: component.id.version,
      baseComponent,
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
  _updateComponentFilesPerMergeStrategy(componentMergeStatus: ComponentMergeStatus): FilesStatus | null | undefined {
    const mergeResults = componentMergeStatus.mergeResults;
    if (!mergeResults) return null;
    const component = componentMergeStatus.componentWithDependencies.component;
    const files = component.files;

    const filesStatus = {};
    if (mergeResults.hasConflicts && this.options.mergeStrategy === MergeOptions.ours) {
      // don't write the files to the filesystem, only bump the bitmap version.
      files.forEach((file) => {
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        filesStatus[pathNormalizeToLinux(file.relative)] = FileStatus.unchanged;
      });
      this.consumer.bitMap.updateComponentId(component.id);
      this.consumer.bitMap.hasChanged = true;
      return filesStatus;
    }
    if (mergeResults.hasConflicts && this.options.mergeStrategy === MergeOptions.theirs) {
      // the local changes will be overridden (as if the user entered --override flag for this component)
      files.forEach((file) => {
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        filesStatus[pathNormalizeToLinux(file.relative)] = FileStatus.updated;
      });
      return filesStatus;
    }
    return applyModifiedVersion(
      component.files,
      mergeResults,
      this.options.mergeStrategy,
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      component.originallySharedDir
    );
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
      (component) => component.mergeResults && component.mergeResults.hasConflicts
    );
    if (componentWithConflict && !this.options.mergeStrategy) {
      this.options.mergeStrategy = await getMergeStrategyInteractive();
    }
    this.mergeStatus = {};

    const componentsToWrite = componentsStatus.map((componentStatus) => {
      const filesStatus: FilesStatus | null | undefined = this._updateComponentFilesPerMergeStrategy(componentStatus);
      const componentWithDependencies = componentStatus.componentWithDependencies;
      if (!filesStatus) return componentWithDependencies;
      this.mergeStatus[componentWithDependencies.component.id.toStringWithoutVersion()] = filesStatus;
      const unchangedFiles = Object.keys(filesStatus).filter((file) => filesStatus[file] === FileStatus.unchanged);
      if (unchangedFiles.length === Object.keys(filesStatus).length) {
        // all files are unchanged
        return null;
      }
      return componentWithDependencies;
    });
    const removeNulls = R.reject(R.isNil);
    return removeNulls(componentsToWrite);
  }

  _shouldSaveLaneData(): boolean {
    if (this.options.skipLane || this.options.objectsOnly) {
      return false;
    }
    const currentLaneId = this.consumer.getCurrentLaneId();
    return !currentLaneId.isDefault();
  }

  async _saveLaneDataIfNeeded(componentsWithDependencies: ComponentWithDependencies[]): Promise<void> {
    if (!this._shouldSaveLaneData()) {
      return;
    }
    const currentLane = await this.consumer.getCurrentLaneObject();
    if (!currentLane) {
      return; // user on master
    }
    await Promise.all(
      componentsWithDependencies.map(async (compWithDeps) => {
        const allComps = [compWithDeps.component, ...compWithDeps.allDependencies];
        const updateAllCompsP = allComps.map(async (comp) => {
          const modelComponent = await this.scope.getModelComponent(comp.id);
          const ref = modelComponent.getRef(comp.id.version as string);
          if (!ref) throw new Error(`_saveLaneDataIfNeeded unable to get ref for ${comp.id.toString()}`);
          currentLane.addComponent({ id: comp.id, head: ref });
        });
        await Promise.all(updateAllCompsP);
      })
    );
    await this.scope.lanes.saveLane(currentLane);
  }

  async _writeToFileSystem(componentsWithDependencies: ComponentWithDependencies[]) {
    if (this.options.objectsOnly) {
      return;
    }
    const componentsToWrite = await this.updateAllComponentsAccordingToMergeStrategy(componentsWithDependencies);
    const manyComponentsWriter = new ManyComponentsWriter({
      consumer: this.consumer,
      componentsWithDependencies: componentsToWrite,
      writeToPath: this.options.writeToPath,
      writePackageJson: this.options.writePackageJson,
      addToRootPackageJson: this.options.writePackageJson, // no point to add to root if it doesn't have package.json
      writeConfig: this.options.writeConfig,
      writeDists: this.options.writeDists,
      installNpmPackages: this.options.installNpmPackages,
      verbose: this.options.verbose,
      override: this.options.override,
      saveOnLane: this._shouldSaveLaneData(),
    });
    await manyComponentsWriter.writeAll();
  }
}
