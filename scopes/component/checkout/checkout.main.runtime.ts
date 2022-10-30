import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import { Logger, LoggerAspect, LoggerMain } from '@teambit/logger';
import WorkspaceAspect, { Workspace } from '@teambit/workspace';
import { BitId } from '@teambit/legacy-bit-id';
import { BitError } from '@teambit/bit-error';
import { BEFORE_CHECKOUT } from '@teambit/legacy/dist/cli/loader/loader-messages';
import { HEAD, LATEST } from '@teambit/legacy/dist/constants';
import {
  applyVersion,
  markFilesToBeRemovedIfNeeded,
  ComponentStatus,
  deleteFilesIfNeeded,
} from '@teambit/legacy/dist/consumer/versions-ops/checkout-version';
import {
  ApplyVersionResults,
  FailedComponents,
  getMergeStrategyInteractive,
  MergeStrategy,
  threeWayMerge,
} from '@teambit/legacy/dist/consumer/versions-ops/merge-version';
import GeneralError from '@teambit/legacy/dist/error/general-error';
import { ConsumerNotFound } from '@teambit/legacy/dist/consumer/exceptions';
import mapSeries from 'p-map-series';
import { BitIds } from '@teambit/legacy/dist/bit-id';
import { ComponentWithDependencies } from '@teambit/legacy/dist/scope';
import Version from '@teambit/legacy/dist/scope/models/version';
import { Tmp } from '@teambit/legacy/dist/scope/repositories';
import ManyComponentsWriter from '@teambit/legacy/dist/consumer/component-ops/many-components-writer';
import { MergeResultsThreeWay } from '@teambit/legacy/dist/consumer/versions-ops/merge-version/three-way-merge';
import ConsumerComponent from '@teambit/legacy/dist/consumer/component';
import { ComponentID } from '@teambit/component-id';
import { CheckoutCmd } from './checkout-cmd';
import { CheckoutAspect } from './checkout.aspect';

export type CheckoutProps = {
  version?: string; // if reset is true, the version is undefined
  ids?: ComponentID[];
  head?: boolean;
  promptMergeOptions?: boolean;
  mergeStrategy?: MergeStrategy | null;
  verbose?: boolean;
  skipNpmInstall?: boolean;
  reset?: boolean; // remove local changes. if set, the version is undefined.
  all?: boolean; // checkout all ids
  isLane?: boolean;
};

type CheckoutTo = 'head' | 'reset' | string;

export class CheckoutMain {
  constructor(private workspace: Workspace, private logger: Logger) {}

  async checkout(checkoutProps: CheckoutProps): Promise<ApplyVersionResults> {
    const consumer = this.workspace.consumer;
    const { version, ids, promptMergeOptions } = checkoutProps;
    await this.syncNewComponents(checkoutProps);
    const bitIds = BitIds.fromArray(ids?.map((id) => id._legacy) || []);
    await consumer.scope.import(bitIds, false);
    const { components } = await consumer.loadComponents(bitIds);

    const getAllComponentsStatus = async (): Promise<ComponentStatus[]> => {
      const tmp = new Tmp(consumer.scope);
      try {
        const componentsStatusP = components.map((component) => this.getComponentStatus(component, checkoutProps));
        const componentsStatus = await Promise.all(componentsStatusP);
        await tmp.clear();
        return componentsStatus;
      } catch (err: any) {
        await tmp.clear();
        throw err;
      }
    };

    const allComponentsStatus: ComponentStatus[] = await getAllComponentsStatus();
    const componentWithConflict = allComponentsStatus.find(
      (component) => component.mergeResults && component.mergeResults.hasConflicts
    );
    if (componentWithConflict) {
      if (!promptMergeOptions && !checkoutProps.mergeStrategy) {
        throw new GeneralError(
          `automatic merge has failed for component ${componentWithConflict.id.toStringWithoutVersion()}.\nplease use "--manual" to manually merge changes or use "--theirs / --ours" to choose one of the conflicted versions`
        );
      }
      if (!checkoutProps.mergeStrategy) checkoutProps.mergeStrategy = await getMergeStrategyInteractive();
    }
    const failedComponents: FailedComponents[] = allComponentsStatus
      .filter((componentStatus) => componentStatus.failureMessage)
      .map((componentStatus) => ({
        id: componentStatus.id,
        failureMessage: componentStatus.failureMessage as string,
        unchangedLegitimately: componentStatus.unchangedLegitimately,
      }));

    const succeededComponents = allComponentsStatus.filter((componentStatus) => !componentStatus.failureMessage);
    // do not use Promise.all for applyVersion. otherwise, it'll write all components in parallel,
    // which can be an issue when some components are also dependencies of others
    const checkoutPropsLegacy = { ...checkoutProps, ids: checkoutProps.ids?.map((id) => id._legacy) };
    const componentsResults = await mapSeries(succeededComponents, ({ id, componentFromFS, mergeResults }) => {
      return applyVersion(consumer, id, componentFromFS, mergeResults, checkoutPropsLegacy);
    });

    markFilesToBeRemovedIfNeeded(succeededComponents, componentsResults);

    const componentsWithDependencies = componentsResults
      .map((c) => c.component)
      .filter((c) => c) as ComponentWithDependencies[];
    const leftUnresolvedConflicts = componentWithConflict && checkoutProps.mergeStrategy === 'manual';
    if (componentsWithDependencies.length) {
      const manyComponentsWriter = new ManyComponentsWriter({
        consumer,
        componentsWithDependencies,
        installNpmPackages: !checkoutProps.skipNpmInstall && !leftUnresolvedConflicts,
        override: true,
        verbose: checkoutProps.verbose,
        resetConfig: checkoutProps.reset,
      });
      await manyComponentsWriter.writeAll();
      await deleteFilesIfNeeded(componentsResults, consumer);
    }

    const appliedVersionComponents = componentsResults.map((c) => c.applyVersionResult);

    return { components: appliedVersionComponents, version, failedComponents, leftUnresolvedConflicts };
  }

  async checkoutByCLIValues(
    to: CheckoutTo,
    componentPattern: string,
    checkoutProps: CheckoutProps
  ): Promise<ApplyVersionResults> {
    this.logger.setStatusLine(BEFORE_CHECKOUT);
    if (!this.workspace) throw new ConsumerNotFound();
    const consumer = this.workspace.consumer;
    await this.parseValues(to, componentPattern, checkoutProps);
    const checkoutResults = await this.checkout(checkoutProps);
    await consumer.onDestroy();
    return checkoutResults;
  }

  private async syncNewComponents({ ids, head }: CheckoutProps) {
    if (!head) return;
    const notExported = ids?.filter((id) => !id._legacy.hasScope()).map((id) => id._legacy.changeScope(id.scope));
    const scopeComponentsImporter = this.workspace.consumer.scope.scopeImporter;
    try {
      await scopeComponentsImporter.importManyDeltaWithoutDeps(BitIds.fromArray(notExported || []), true);
    } catch (err) {
      // don't stop the process. it's possible that the scope doesn't exist yet because these are new components
      this.logger.error(`unable to sync new components due to an error`, err);
    }
  }

  private async parseValues(to: CheckoutTo, componentPattern: string, checkoutProps: CheckoutProps) {
    if (to === HEAD) checkoutProps.head = true;
    else if (to === LATEST) throw new BitError(`"latest" was deprecated a while ago, please use "head" instead`);
    else if (to === 'reset') checkoutProps.reset = true;
    else {
      if (!BitId.isValidVersion(to)) throw new BitError(`the specified version "${to}" is not a valid version`);
      checkoutProps.version = to;
    }
    if (checkoutProps.head && !componentPattern) {
      if (checkoutProps.all) {
        this.logger.console(`"--all" is deprecated for "bit checkout ${HEAD}", please omit it.`);
      }
      checkoutProps.all = true;
    }
    if (componentPattern && checkoutProps.all) {
      throw new GeneralError('please specify either [component-pattern] or --all, not both');
    }
    if (!componentPattern && !checkoutProps.all) {
      throw new GeneralError('please specify [component-pattern] or use --all flag');
    }
    const ids = componentPattern ? await this.workspace.idsByPattern(componentPattern) : await this.workspace.listIds();
    checkoutProps.ids = ids.map((id) => (checkoutProps.head ? id.changeVersion(LATEST) : id));
  }

  private async getComponentStatus(
    component: ConsumerComponent,
    checkoutProps: CheckoutProps
  ): Promise<ComponentStatus> {
    const consumer = this.workspace.consumer;
    const { version, head: latestVersion, reset } = checkoutProps;
    const repo = consumer.scope.objects;
    const componentModel = await consumer.scope.getModelComponentIfExist(component.id);
    const componentStatus: ComponentStatus = { id: component.id };
    const returnFailure = (msg: string, unchangedLegitimately = false) => {
      componentStatus.failureMessage = msg;
      componentStatus.unchangedLegitimately = unchangedLegitimately;
      return componentStatus;
    };
    if (!componentModel) {
      return returnFailure(`component ${component.id.toString()} is new, no version to checkout`, true);
    }
    const unmerged = repo.unmergedComponents.getEntry(component.name);
    if (!reset && unmerged) {
      return returnFailure(
        `component ${component.id.toStringWithoutVersion()} is in during-merge state, please snap/tag it first (or use bit merge --resolve/--abort)`
      );
    }
    const getNewVersion = async (): Promise<string> => {
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      if (reset) return component.id.version;
      // @ts-ignore if !reset the version is defined
      return latestVersion ? componentModel.latestIncludeRemote(repo) : version;
    };
    const newVersion = await getNewVersion();
    if (version && !latestVersion) {
      const hasVersion = await componentModel.hasVersion(version, repo);
      if (!hasVersion)
        return returnFailure(`component ${component.id.toStringWithoutVersion()} doesn't have version ${version}`);
    }
    const existingBitMapId = consumer.bitMap.getBitId(component.id, { ignoreVersion: true });
    const currentlyUsedVersion = existingBitMapId.version;
    if (!currentlyUsedVersion) {
      return returnFailure(`component ${component.id.toStringWithoutVersion()} is new`);
    }
    if (version && currentlyUsedVersion === version) {
      // it won't be relevant for 'reset' as it doesn't have a version
      return returnFailure(`component ${component.id.toStringWithoutVersion()} is already at version ${version}`);
    }
    if (latestVersion && currentlyUsedVersion === newVersion) {
      return returnFailure(
        `component ${component.id.toStringWithoutVersion()} is already at the latest version, which is ${newVersion}`,
        true
      );
    }
    const currentVersionObject: Version = await componentModel.loadVersion(currentlyUsedVersion, repo);
    const isModified = await consumer.isComponentModified(currentVersionObject, component);
    if (!isModified && reset) {
      return returnFailure(`component ${component.id.toStringWithoutVersion()} is not modified`);
    }
    // this is tricky. imagine the user is 0.0.2+modification and wants to checkout to 0.0.1.
    // the base is 0.0.1, as it's the common version for 0.0.1 and 0.0.2. however, if we let git merge-file use the 0.0.1
    // as the base, then, it'll get the changes done since 0.0.1 to 0.0.1, which is nothing, and put them on top of
    // 0.0.2+modification. in other words, it won't make any change.
    // this scenario of checking out while there are modified files, is forbidden in Git. here, we want to simulate a similar
    // experience of "git stash", then "git checkout", then "git stash pop". practically, we want the changes done on 0.0.2
    // to be added to 0.0.1
    // if there is no modification, it doesn't go the threeWayMerge anyway, so it doesn't matter what the base is.
    const baseVersion = currentlyUsedVersion;
    const baseComponent: Version = await componentModel.loadVersion(baseVersion, repo);
    let mergeResults: MergeResultsThreeWay | null | undefined;
    // if the component is not modified, no need to try merge the files, they will be written later on according to the
    // checked out version. same thing when no version is specified, it'll be reset to the model-version later.
    if (!reset && isModified) {
      const otherComponent: Version = await componentModel.loadVersion(newVersion, repo);
      mergeResults = await threeWayMerge({
        consumer,
        otherComponent,
        otherLabel: newVersion,
        currentComponent: component,
        currentLabel: `${currentlyUsedVersion} modified`,
        baseComponent,
      });
    }
    const versionRef = componentModel.getRef(newVersion);
    // @ts-ignore
    const componentVersion = await consumer.scope.getObject(versionRef.hash);
    const newId = component.id.changeVersion(newVersion);
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return { componentFromFS: component, componentFromModel: componentVersion, id: newId, mergeResults };
  }

  static slots = [];
  static dependencies = [CLIAspect, WorkspaceAspect, LoggerAspect];

  static runtime = MainRuntime;

  static async provider([cli, workspace, loggerMain]: [CLIMain, Workspace, LoggerMain]) {
    const logger = loggerMain.createLogger(CheckoutAspect.id);
    const checkoutMain = new CheckoutMain(workspace, logger);
    cli.register(new CheckoutCmd(checkoutMain));
    return checkoutMain;
  }
}

CheckoutAspect.addRuntime(CheckoutMain);

export default CheckoutMain;
