import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import { Logger, LoggerAspect, LoggerMain } from '@teambit/logger';
import { WorkspaceAspect, OutsideWorkspaceError, Workspace } from '@teambit/workspace';
import { BitError } from '@teambit/bit-error';
import { compact } from 'lodash';
import { BEFORE_CHECKOUT } from '@teambit/legacy/dist/cli/loader/loader-messages';
import { RemoveAspect, RemoveMain } from '@teambit/remove';
import {
  ApplyVersionResults,
  FailedComponents,
  threeWayMerge,
  getMergeStrategyInteractive,
  MergeStrategy,
} from '@teambit/merging';
import { ImporterAspect, ImporterMain } from '@teambit/importer';
import { HEAD, LATEST } from '@teambit/legacy/dist/constants';
import { ComponentWriterAspect, ComponentWriterMain } from '@teambit/component-writer';
import mapSeries from 'p-map-series';
import { ComponentIdList, ComponentID } from '@teambit/component-id';
import { Version, ModelComponent, Lane } from '@teambit/legacy/dist/scope/models';
import { Tmp } from '@teambit/legacy/dist/scope/repositories';
import ComponentNotFoundInPath from '@teambit/legacy/dist/consumer/component/exceptions/component-not-found-in-path';
import { CheckoutCmd } from './checkout-cmd';
import { CheckoutAspect } from './checkout.aspect';
import { applyVersion, ComponentStatus, ComponentStatusBase, throwForFailures } from './checkout-version';
import { RevertCmd } from './revert-cmd';

export type CheckoutProps = {
  version?: string; // if reset/head/latest is true, the version is undefined
  ids?: ComponentID[];
  head?: boolean;
  ancestor?: number; // how many generations to go backward
  latest?: boolean;
  main?: boolean; // relevant for "revert" only
  promptMergeOptions?: boolean;
  mergeStrategy?: MergeStrategy; // strategy to use in case of conflicts
  forceOurs?: boolean; // regardless of conflicts, use ours
  forceTheirs?: boolean; // regardless of conflicts, use theirs
  verbose?: boolean;
  skipNpmInstall?: boolean;
  reset?: boolean; // remove local changes. if set, the version is undefined.
  revert?: boolean; // change the files according to the given version, but don't change the bitmap version and don't try to merge
  all?: boolean; // checkout all ids
  isLane?: boolean;
  lane?: Lane; // currently needed for "bit switch" to tell the "fetch" where to fetch from
  workspaceOnly?: boolean;
  versionPerId?: ComponentID[]; // if given, the ComponentID.version is the version to checkout to.
  skipUpdatingBitmap?: boolean; // needed for stash
  loadStash?: boolean;
  restoreMissingComponents?: boolean; // in case .bitmap has a component and it's missing from the workspace, restore it (from model)
  allowAddingComponentsFromScope?: boolean; // in case the id doesn't exist in .bitmap, add it from the scope (relevant for switch)
  includeLocallyDeleted?: boolean; // include components that were deleted locally. currently enabled for "bit checkout reset" only.
};

export type ComponentStatusBeforeMergeAttempt = ComponentStatusBase & {
  propsForMerge?: {
    currentlyUsedVersion: string;
    componentModel: ModelComponent;
  };
};

export class CheckoutMain {
  constructor(
    private workspace: Workspace,
    private logger: Logger,
    private componentWriter: ComponentWriterMain,
    private importer: ImporterMain,
    private remove: RemoveMain
  ) {}

  async checkout(checkoutProps: CheckoutProps): Promise<ApplyVersionResults> {
    this.workspace.inInstallContext = true;
    const consumer = this.workspace.consumer;
    const { version, ids, promptMergeOptions } = checkoutProps;
    await this.syncNewComponents(checkoutProps);
    const addedComponents = await this.restoreMissingComponents(checkoutProps);
    const bitIds = ComponentIdList.fromArray(ids?.map((id) => id) || []);
    // don't use Promise.all, it loads the components and this operation must be in sequence.
    const allComponentStatusBeforeMerge = await mapSeries(bitIds, (id) =>
      this.getComponentStatusBeforeMergeAttempt(id, checkoutProps)
    );
    const compsNeedMerge = allComponentStatusBeforeMerge.filter((c) => c.propsForMerge);
    const compsNotNeedMerge = allComponentStatusBeforeMerge.filter((c) => !c.propsForMerge) as ComponentStatus[];

    // in case the requested versions to checkout don't exist locally, import them.
    const toImport = allComponentStatusBeforeMerge
      .map((compStatus) => {
        const idsToImport = [compStatus.id];
        if (compStatus.propsForMerge) {
          idsToImport.push(compStatus.id.changeVersion(compStatus.propsForMerge.currentlyUsedVersion));
        }
        return idsToImport;
      })
      .flat();

    await this.workspace.scope.legacyScope.scopeImporter.importWithoutDeps(ComponentIdList.fromArray(toImport), {
      cache: true,
      lane: checkoutProps.lane,
    });

    const getComponentsStatusOfMergeNeeded = async (): Promise<ComponentStatus[]> => {
      const tmp = new Tmp(consumer.scope);
      try {
        const afterMergeAttempt = await Promise.all(compsNeedMerge.map((c) => this.getMergeStatus(c, checkoutProps)));
        await tmp.clear();
        return afterMergeAttempt;
      } catch (err: any) {
        await tmp.clear();
        throw err;
      }
    };

    const compStatusMergeNeeded = await getComponentsStatusOfMergeNeeded();

    const allComponentsStatus: ComponentStatus[] = [...compStatusMergeNeeded, ...compsNotNeedMerge];
    const componentWithConflict = allComponentsStatus.find(
      (component) => component.mergeResults && component.mergeResults.hasConflicts
    );
    if (componentWithConflict) {
      if (!promptMergeOptions && !checkoutProps.mergeStrategy) {
        throw new BitError(
          `automatic merge has failed for component ${componentWithConflict.id.toStringWithoutVersion()}.\nplease use "--auto-merge-resolve" with 'manual', 'ours' or 'theirs' to resolve the conflict/s`
        );
      }
      if (!checkoutProps.mergeStrategy) checkoutProps.mergeStrategy = await getMergeStrategyInteractive();
    }

    throwForFailures(allComponentsStatus);

    const failedComponents: FailedComponents[] = allComponentsStatus
      .filter((componentStatus) => componentStatus.unchangedMessage)
      .filter((componentStatus) => !componentStatus.shouldBeRemoved)
      .map((componentStatus) => ({
        id: componentStatus.id,
        unchangedMessage: componentStatus.unchangedMessage as string,
        unchangedLegitimately: componentStatus.unchangedLegitimately,
      }));

    const succeededComponents = allComponentsStatus.filter((componentStatus) => !componentStatus.unchangedMessage);
    // do not use Promise.all for applyVersion. otherwise, it'll write all components in parallel,
    // which can be an issue when some components are also dependencies of others
    const checkoutPropsLegacy = { ...checkoutProps, ids: checkoutProps.ids?.map((id) => id) };
    const componentsResults = await mapSeries(succeededComponents, ({ id, currentComponent, mergeResults }) => {
      return applyVersion(consumer, id, currentComponent, mergeResults, checkoutPropsLegacy);
    });

    const componentsLegacy = compact(componentsResults.map((c) => c.component));

    let newFromLane: ComponentID[] | undefined;
    let newFromLaneAdded = false;
    if (checkoutProps.head) {
      newFromLane = await this.getNewComponentsFromLane(checkoutProps.ids || []);
      if (!checkoutProps.workspaceOnly) {
        const compsNewFromLane = await Promise.all(
          newFromLane.map((id) => consumer.loadComponentFromModelImportIfNeeded(id))
        );
        componentsLegacy.push(...compsNewFromLane);
        newFromLaneAdded = true;
      }
    }

    const leftUnresolvedConflicts = componentWithConflict && checkoutProps.mergeStrategy === 'manual';
    let componentWriterResults;
    if (componentsLegacy.length) {
      const manyComponentsWriterOpts = {
        components: componentsLegacy,
        skipDependencyInstallation: checkoutProps.skipNpmInstall || leftUnresolvedConflicts,
        verbose: checkoutProps.verbose,
        resetConfig: checkoutProps.reset,
        skipUpdatingBitMap: checkoutProps.skipUpdatingBitmap || checkoutProps.revert,
        shouldUpdateWorkspaceConfig: true,
        reasonForBitmapChange: 'checkout',
        mergeStrategy: checkoutProps.mergeStrategy,
      };
      componentWriterResults = await this.componentWriter.writeMany(manyComponentsWriterOpts);
    }

    const appliedVersionComponents = componentsResults.map((c) => c.applyVersionResult);

    const componentIdsToRemove = allComponentsStatus
      .filter((componentStatus) => componentStatus.shouldBeRemoved)
      .map((c) => c.id.changeVersion(undefined));

    if (componentIdsToRemove.length) {
      await this.remove.removeLocallyByIds(componentIdsToRemove, { force: true, reasonForRemoval: 'checkout' });
    }

    return {
      components: appliedVersionComponents,
      removedComponents: componentIdsToRemove,
      addedComponents,
      version,
      failedComponents,
      leftUnresolvedConflicts,
      newFromLane: newFromLane?.map((n) => n.toString()),
      newFromLaneAdded,
      workspaceConfigUpdateResult: componentWriterResults?.workspaceConfigUpdateResult,
      installationError: componentWriterResults?.installationError,
      compilationError: componentWriterResults?.compilationError,
    };
  }

  /**
   * if .bitmap entry exists but the rootDir is missing from the filesystem, find the component in the scope and restore it.
   * returns the restored component ids.
   */
  async restoreMissingComponents(checkoutProps: CheckoutProps): Promise<ComponentID[] | undefined> {
    if (checkoutProps.reset) {
      checkoutProps.restoreMissingComponents = true;
    }
    if (!checkoutProps.restoreMissingComponents) return undefined;
    const ids = checkoutProps.ids || [];
    const missing: ComponentID[] = [];
    await Promise.all(
      ids.map(async (id) => {
        const bitMapEntry = this.workspace.bitMap.getBitmapEntry(id, { ignoreVersion: true });
        if (bitMapEntry.noFilesError && bitMapEntry.noFilesError instanceof ComponentNotFoundInPath) {
          delete bitMapEntry.noFilesError;
          missing.push(id);
        }
      })
    );
    if (!missing.length) return undefined;
    const comps = await this.workspace.scope.getMany(missing);
    await this.componentWriter.writeMany({
      components: comps.map((c) => c.state._consumer),
      skipDependencyInstallation: true,
      skipUpdatingBitMap: true,
    });

    return missing;
  }

  async checkoutByCLIValues(componentPattern: string, checkoutProps: CheckoutProps): Promise<ApplyVersionResults> {
    const { revert, head } = checkoutProps;
    this.logger.setStatusLine(revert ? 'reverting components...' : BEFORE_CHECKOUT);
    if (!this.workspace) throw new OutsideWorkspaceError();
    const consumer = this.workspace.consumer;
    await this.importer.importCurrentObjects(); // important. among others, it fetches the remote lane object and its new components.
    if (head) await this.makeLaneComponentsAvailableOnMain();
    await this.parseValues(componentPattern, checkoutProps);
    const checkoutResults = await this.checkout(checkoutProps);
    await consumer.onDestroy(`checkout (${componentPattern})`);
    return checkoutResults;
  }

  private async syncNewComponents({ ids, head }: CheckoutProps) {
    if (!head) return;
    const notExported = ids?.filter((id) => !this.workspace.isExported(id)).map((id) => id.changeScope(id.scope));
    const scopeComponentsImporter = this.workspace.consumer.scope.scopeImporter;
    try {
      await scopeComponentsImporter.importWithoutDeps(ComponentIdList.fromArray(notExported || []).toVersionLatest(), {
        cache: false,
        reason: 'for making sure the new components are really new and are not out-of-sync',
        includeUnexported: true,
      });
    } catch (err) {
      // don't stop the process. it's possible that the scope doesn't exist yet because these are new components
      this.logger.error(`unable to sync new components, if these components are really new, ignore the error`, err);
    }
  }

  private async makeLaneComponentsAvailableOnMain() {
    const unavailableOnMain = await this.workspace.getUnavailableOnMainComponents();
    if (!unavailableOnMain.length) return;
    this.workspace.bitMap.makeComponentsAvailableOnMain(unavailableOnMain);
  }

  private async parseValues(componentPattern: string, checkoutProps: CheckoutProps) {
    if (checkoutProps.head && !componentPattern) {
      if (checkoutProps.all) {
        this.logger.console(`"--all" is deprecated for "bit checkout ${HEAD}", please omit it.`);
      }
      checkoutProps.all = true;
    }
    if (checkoutProps.latest && !componentPattern) {
      if (checkoutProps.all) {
        this.logger.console(`"--all" is deprecated for "bit checkout ${LATEST}", please omit it.`);
      }
      checkoutProps.all = true;
    }
    if (componentPattern && checkoutProps.all) {
      throw new BitError('please specify either [component-pattern] or --all, not both');
    }
    if (!componentPattern && !checkoutProps.all) {
      throw new BitError('please specify [component-pattern] or use --all flag');
    }
    if (checkoutProps.workspaceOnly && !checkoutProps.head) {
      throw new BitError(`--workspace-only flag can only be used with "head" (bit checkout head --workspace-only)`);
    }
    if (checkoutProps.reset || checkoutProps.head) {
      checkoutProps.includeLocallyDeleted = true;
    }

    const getIds = async () => {
      if (componentPattern) {
        return this.workspace.idsByPattern(componentPattern, true, {
          includeDeleted: checkoutProps.includeLocallyDeleted,
        });
      }
      return checkoutProps.includeLocallyDeleted ? this.workspace.listIdsIncludeRemoved() : this.workspace.listIds();
    };

    const idsOnWorkspace = await getIds();

    const currentLane = await this.workspace.consumer.getCurrentLaneObject();
    const currentLaneIds = currentLane?.toComponentIds();
    const ids = currentLaneIds ? idsOnWorkspace.filter((id) => currentLaneIds.hasWithoutVersion(id)) : idsOnWorkspace;
    checkoutProps.ids = ids.map((id) => (checkoutProps.head || checkoutProps.latest ? id.changeVersion(LATEST) : id));
  }

  private async getNewComponentsFromLane(ids: ComponentID[]): Promise<ComponentID[]> {
    // current lane object is up to date due to the previous `importCurrentObjects()` call
    const lane = await this.workspace.consumer.getCurrentLaneObject();
    if (!lane) {
      return [];
    }
    const laneBitIds = lane.toComponentIds();
    const newComponentIds = laneBitIds.filter((bitId) => !ids.find((id) => id.isEqualWithoutVersion(bitId)));
    const nonRemovedNewIds: ComponentID[] = [];
    await Promise.all(
      newComponentIds.map(async (id) => {
        const isRemoved = await this.workspace.scope.isComponentRemoved(id);
        if (!isRemoved) nonRemovedNewIds.push(id);
      })
    );
    return nonRemovedNewIds;
  }

  // eslint-disable-next-line complexity
  private async getComponentStatusBeforeMergeAttempt(
    id: ComponentID,
    checkoutProps: CheckoutProps
  ): Promise<ComponentStatusBeforeMergeAttempt> {
    const consumer = this.workspace.consumer;
    const {
      version,
      head: headVersion,
      ancestor,
      reset,
      revert,
      main,
      latest: latestVersion,
      versionPerId,
      forceOurs,
      forceTheirs,
      loadStash,
    } = checkoutProps;
    const repo = consumer.scope.objects;

    let existingBitMapId = consumer.bitMap.getComponentIdIfExist(id, { ignoreVersion: true });
    const getComponent = async () => {
      try {
        const results = await consumer.loadComponents(ComponentIdList.fromArray([id]));
        if (results.components[0]) return results.components[0];
        if (checkoutProps.includeLocallyDeleted && results.removedComponents[0]) {
          return results.removedComponents[0];
        }
      } catch (err) {
        if (checkoutProps.allowAddingComponentsFromScope && !existingBitMapId) return undefined;
        throw err;
      }
      return undefined;
    };
    const component = await getComponent();
    if (component) {
      // the component might fix an out-of-sync issue and as a result, the id has changed
      id = component.id;
      existingBitMapId = consumer.bitMap.getComponentIdIfExist(id, { ignoreVersion: true });
    }

    const componentModel = await consumer.scope.getModelComponentIfExist(id);
    const componentStatus: ComponentStatusBeforeMergeAttempt = { id };
    const returnFailure = (msg: string, unchangedLegitimately = false) => {
      componentStatus.unchangedMessage = msg;
      componentStatus.unchangedLegitimately = unchangedLegitimately;
      return componentStatus;
    };
    if (!componentModel) {
      return returnFailure(`component ${id.toString()} is new, no version to checkout`, true);
    }
    if (main && !componentModel.head) {
      return returnFailure(`component ${id.toString()} is not available on main`);
    }
    const unmerged = repo.unmergedComponents.getEntry(id);
    if (!reset && unmerged) {
      return returnFailure(
        `component ${id.toStringWithoutVersion()} is in during-merge state, please snap/tag it first (or use bit merge --resolve/--abort)`
      );
    }

    const getNewVersion = async (): Promise<string> => {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      if (reset) return component!.id.version as string;
      if (headVersion) return componentModel.headIncludeRemote(repo);
      if (ancestor) {
        const previousParent = await componentModel.getRefOfAncestor(repo, ancestor);
        return componentModel.getTagOfRefIfExists(previousParent)?.toString() || previousParent.toString();
      }
      // we verified previously that head exists in case of "main"
      if (main) return componentModel.head?.toString() as string;
      if (latestVersion) {
        const latest = componentModel.latestVersionIfExist();
        return latest || componentModel.headIncludeRemote(repo);
      }
      if (versionPerId) {
        return versionPerId.find((bitId) => bitId.isEqualWithoutVersion(id))?.version as string;
      }

      // if all above are false, the version is defined
      return version as string;
    };
    const newVersion = await getNewVersion();
    if (version && !headVersion) {
      const hasVersion = await componentModel.hasVersion(version, repo);
      if (!hasVersion) return returnFailure(`component ${id.toStringWithoutVersion()} doesn't have version ${version}`);
    }
    const currentlyUsedVersion = existingBitMapId?.version;
    if (existingBitMapId && !currentlyUsedVersion) {
      return returnFailure(`component ${id.toStringWithoutVersion()} is new`);
    }
    if (version && currentlyUsedVersion === version) {
      // it won't be relevant for 'reset' as it doesn't have a version
      return returnFailure(`component ${id.toStringWithoutVersion()} is already at version ${version}`, true);
    }
    if (headVersion && currentlyUsedVersion === newVersion) {
      return returnFailure(
        `component ${id.toStringWithoutVersion()} is already at the latest version, which is ${newVersion}`,
        true
      );
    }
    if (!reset) {
      const divergeDataForMergePending = await componentModel.getDivergeDataForMergePending(repo);
      const isMergePending = divergeDataForMergePending.isDiverged();
      if (isMergePending) {
        return returnFailure(`component is merge-pending and cannot be checked out, run "bit status" for more info`);
      }
    }
    let isModified = false;
    if (currentlyUsedVersion) {
      const currentVersionObject: Version = await componentModel.loadVersion(currentlyUsedVersion, repo);
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      isModified = await consumer.isComponentModified(currentVersionObject, component!);
      const isRemoved = component && component.isRemoved();
      if (!isModified && !isRemoved && reset) {
        return returnFailure(`component ${id.toStringWithoutVersion()} is not modified`, true);
      }
    }

    const versionRef = componentModel.getRef(newVersion);
    if (!versionRef) throw new Error(`unable to get ref ${newVersion} from ${componentModel.id()}`);
    const componentVersion = (await consumer.scope.getObject(versionRef.hash)) as Version | undefined;
    if (componentVersion?.isRemoved()) {
      if (existingBitMapId) componentStatus.shouldBeRemoved = true;
      return returnFailure(`component has been removed`, true);
    }

    const newId = id.changeVersion(newVersion);

    if (reset || (!isModified && !loadStash) || revert || !currentlyUsedVersion || forceTheirs || forceOurs) {
      // if the component is not modified, no need to try merge the files, they will be written later on according to the
      // checked out version. same thing when no version is specified, it'll be reset to the model-version later.
      // in case of "loadStash", we want to merge the stashed modifications regardless whether it's modified currently.

      // if !currentlyUsedVersion it only exists in the model, so just write it. (happening during bit-switch/bit-lane-import)
      return { currentComponent: component, componentFromModel: componentVersion, id: newId };
    }

    const propsForMerge = {
      currentlyUsedVersion,
      componentModel,
    };

    return { currentComponent: component, componentFromModel: componentVersion, id: newId, propsForMerge };
  }

  private async getMergeStatus(
    { currentComponent: componentFromFS, componentFromModel, id, propsForMerge }: ComponentStatusBeforeMergeAttempt,
    checkoutProps: CheckoutProps
  ): Promise<ComponentStatus> {
    if (!propsForMerge) throw new Error(`propsForMerge is missing for ${id.toString()}`);
    if (!componentFromFS) throw new Error(`componentFromFS is missing for ${id.toString()}`);
    const consumer = this.workspace.consumer;
    const repo = consumer.scope.objects;
    const { currentlyUsedVersion, componentModel } = propsForMerge;

    // this is tricky. imagine the user is 0.0.2+modification and wants to checkout to 0.0.1.
    // the base is 0.0.1, as it's the common version for 0.0.1 and 0.0.2. however, if we let git merge-file use the 0.0.1
    // as the base, then, it'll get the changes done since 0.0.1 to 0.0.1, which is nothing, and put them on top of
    // 0.0.2+modification. in other words, it won't make any change.
    // this scenario of checking out while there are modified files, is forbidden in Git. here, we want to simulate a similar
    // experience of "git stash", then "git checkout", then "git stash pop". practically, we want the changes done on 0.0.2
    // to be added to 0.0.1
    // if there is no modification, it doesn't go the threeWayMerge anyway, so it doesn't matter what the base is.
    let baseVersion = currentlyUsedVersion;
    const newVersion = id.version as string;
    let baseComponent: Version = await componentModel.loadVersion(baseVersion, repo);
    const otherComponent: Version = await componentModel.loadVersion(newVersion, repo);
    const { loadStash } = checkoutProps;
    if (loadStash && otherComponent.parents.length) {
      // for stash, we want the stashed modifications to be added on top of the current version.
      // for this to happen, the "base" must be the parent of the stashed version.
      const parent = otherComponent.parents[0];
      baseVersion = parent.toString();
      baseComponent = await componentModel.loadVersion(baseVersion, repo);
    }

    const mergeResults = await threeWayMerge({
      scope: consumer.scope,
      otherComponent,
      otherLabel: loadStash ? 'stash' : newVersion,
      currentComponent: componentFromFS,
      currentLabel: `${currentlyUsedVersion} modified`,
      baseComponent,
    });

    return { currentComponent: componentFromFS, componentFromModel, id, mergeResults };
  }

  static slots = [];
  static dependencies = [CLIAspect, WorkspaceAspect, LoggerAspect, ComponentWriterAspect, ImporterAspect, RemoveAspect];

  static runtime = MainRuntime;

  static async provider([cli, workspace, loggerMain, compWriter, importer, remove]: [
    CLIMain,
    Workspace,
    LoggerMain,
    ComponentWriterMain,
    ImporterMain,
    RemoveMain
  ]) {
    const logger = loggerMain.createLogger(CheckoutAspect.id);
    const checkoutMain = new CheckoutMain(workspace, logger, compWriter, importer, remove);
    cli.register(new CheckoutCmd(checkoutMain), new RevertCmd(checkoutMain));
    return checkoutMain;
  }
}

CheckoutAspect.addRuntime(CheckoutMain);

export default CheckoutMain;
