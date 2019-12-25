import pMapSeries from 'p-map-series';
import { Consumer } from '../..';
import { BitId, BitIds } from '../../../bit-id';
import LaneId from '../../../lane-id/lane-id';
import { Version, Lane } from '../../../scope/models';
import threeWayMerge, { MergeResultsThreeWay } from './three-way-merge';
import { Ref } from '../../../scope/objects';
import { MergeStrategy, getMergeStrategyInteractive, ApplyVersionResults } from './merge-version';
import Component from '../../component/consumer-component';
import { Tmp } from '../../../scope/repositories';
import GeneralError from '../../../error/general-error';
import checkoutVersion from '../checkout-version';
import { applyVersion } from './snap-merge';

type ComponentStatus = {
  componentFromFS?: Component | null;
  componentFromModel?: Version;
  id: BitId;
  failureMessage?: string;
  mergeResults?: MergeResultsThreeWay;
};

export default async function mergeLanes({
  consumer,
  mergeStrategy,
  laneName,
  remoteName,
  abort,
  resolve
}: {
  consumer: Consumer;
  mergeStrategy: MergeStrategy;
  laneName: string;
  remoteName: string | null;
  abort: boolean;
  resolve: boolean;
}): Promise<ApplyVersionResults> {
  const currentLaneId = consumer.getCurrentLaneId();
  if (!remoteName && laneName === currentLaneId.name) {
    throw new GeneralError(`unable to switch to lane "${laneName}", you're already checked out to this lane`);
  }
  const localLaneId = consumer.getCurrentLaneId();
  const localLane = currentLaneId.isDefault() ? null : await consumer.scope.loadLane(localLaneId);
  const laneId = new LaneId({ name: laneName });
  let bitIds: BitId[];
  let otherLane: Lane | null;
  let remoteLane;
  let otherLaneName: string;
  if (remoteName) {
    remoteLane = await consumer.scope.objects.remoteLanes.getRemoteLane(remoteName, laneId);
    if (!remoteLane.length) {
      throw new GeneralError(
        `unable to switch to "${laneName}" of "${remoteName}", the remote lane was not found or not fetched locally`
      );
    }
    bitIds = await consumer.scope.objects.remoteLanes.getRemoteBitIds(remoteName, laneId);
    otherLaneName = `${remoteName}/${laneId.name}`;
  } else {
    otherLane = await consumer.scope.loadLane(laneId);
    if (!otherLane) throw new GeneralError(`unable to switch to "${laneName}", the lane was not found`);
    bitIds = otherLane.components.map(c => c.id);
    otherLaneName = laneId.name;
  }
  if (resolve || abort) {
    const ids = getIdsForUnresolved(consumer, bitIds);
    return resolve ? resolveMerge(consumer, ids) : abortMerge(consumer, ids);
  }
  const allComponentsStatus = await getAllComponentsStatus();
  const componentWithConflict = allComponentsStatus.find(
    component => component.mergeResults && component.mergeResults.hasConflicts
  );
  if (componentWithConflict && !mergeStrategy) {
    mergeStrategy = await getMergeStrategyInteractive();
  }
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  const failedComponents: FailedComponents[] = allComponentsStatus
    .filter(componentStatus => componentStatus.failureMessage)
    .map(componentStatus => ({ id: componentStatus.id, failureMessage: componentStatus.failureMessage }));

  const succeededComponents = allComponentsStatus.filter(componentStatus => !componentStatus.failureMessage);
  // do not use Promise.all for applyVersion. otherwise, it'll write all components in parallel,
  // which can be an issue when some components are also dependencies of others
  const componentsResults = await pMapSeries(succeededComponents, ({ componentFromFS, id, mergeResults }) => {
    return applyVersion({
      consumer,
      componentFromFS,
      id,
      mergeResults,
      mergeStrategy,
      remoteHead: new Ref(id.version),
      remoteName,
      laneId,
      localLane
    });
  });

  consumer.scope.objects.add(localLane);
  await consumer.scope.objects.persist();

  await consumer.scope.objects.unmergedComponents.write();

  await snapResolvedComponents(consumer);

  return { components: componentsResults, failedComponents };

  async function getAllComponentsStatus(): Promise<ComponentStatus[]> {
    const tmp = new Tmp(consumer.scope);
    try {
      const componentsStatus = await Promise.all(
        bitIds.map(bitId => getComponentStatus(consumer, bitId, localLane, {}, otherLaneName))
      );
      await tmp.clear();
      return componentsStatus;
    } catch (err) {
      await tmp.clear();
      throw err;
    }
  }
}

async function getComponentStatus(
  consumer: Consumer,
  id: BitId,
  localLane: Lane | null,
  mergeProps = {},
  otherLaneName: string
): Promise<ComponentStatus> {
  const componentStatus: ComponentStatus = { id };
  const returnFailure = (msg: string) => {
    componentStatus.failureMessage = msg;
    return componentStatus;
  };
  const modelComponent = await consumer.scope.getModelComponentIfExist(id);
  if (!modelComponent) {
    throw new GeneralError(
      `component ${id.toString()} is on the lane but its objects were not found, please re-import the lane`
    );
  }
  const unmerged = consumer.scope.objects.unmergedComponents.getEntry(id.name);
  if (unmerged && unmerged.resolved === false) {
    return returnFailure(
      `component ${id.toStringWithoutVersion()} has conflicts that need to be resolved first, please use bit merge --resolve/--abort`
    );
  }
  const version = id.version as string;
  const existingBitMapId = consumer.bitMap.getBitIdIfExist(id, { ignoreVersion: true });
  const componentOnLane: Version = await modelComponent.loadVersion(version, consumer.scope.objects);
  if (!existingBitMapId) {
    // @todo: add this flag to bit-merge
    if (mergeProps.skipLaneComponentsNotInWorkspace) {
      return returnFailure(`component ${id.toStringWithoutVersion()} is not in the workspace`);
    }
    // @ts-ignore
    return { componentFromFS: null, componentFromModel: componentOnLane, id, mergeResults: null };
  }
  const currentlyUsedVersion = existingBitMapId.version;
  if (currentlyUsedVersion === version) {
    return returnFailure(`component ${id.toStringWithoutVersion()} is already merged`);
  }
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  // const baseComponent: Version = await modelComponent.loadVersion(currentlyUsedVersion, consumer.scope.objects);
  const component = await consumer.loadComponent(existingBitMapId);
  const componentModificationStatus = await consumer.getComponentStatusById(component.id);
  // let mergeResults: MergeResultsThreeWay | null | undefined;
  if (componentModificationStatus.modified) {
    throw new GeneralError(
      `unable to merge ${id.toStringWithoutVersion()}, the component is modified, please snap/tag it first`
    );
  }
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  // return { componentFromFS: component, componentFromModel: componentOnLane, id, mergeResults };
  const repo = consumer.scope.objects;
  // await modelComponent.populateLocalAndRemoteHeads(repo, laneId, lane, remoteLaneId, remoteName);
  if (localLane) {
    modelComponent.laneHeadLocal = localLane.getComponentHead(modelComponent.toBitId());
    if (modelComponent.laneHeadLocal && modelComponent.laneHeadLocal.toString() !== existingBitMapId.version) {
      throw new GeneralError(
        `unable to merge ${id.toStringWithoutVersion()}, the component is checkout to a different version than the lane head. please run "bit checkout your-lane --lane" first`
      );
    }
  }
  modelComponent.laneHeadRemote = new Ref(id.version as string);
  await modelComponent.setDivergeData(repo);
  const divergeResult = modelComponent.getDivergeData();
  const isTrueMerge = modelComponent.isTrueMergePending();
  if (!isTrueMerge) {
    if (modelComponent.isLocalAhead()) {
      // do nothing!
      return returnFailure(`component ${component.id.toString()} is ahead, nothing to merge`);
    }
    if (modelComponent.isRemoteAhead()) {
      // just override with the model data
      return { componentFromFS: component, componentFromModel: componentOnLane, id, mergeResults: null };
    }
    // we know that localHead and remoteHead are set, so if none of them is ahead they must be equal
    return returnFailure(`component ${component.id.toString()} is already merged`);
  }
  const baseSnap = divergeResult.commonSnapBeforeDiverge as Ref; // must be set when isTrueMerge
  const baseComponent: Version = await modelComponent.loadVersion(baseSnap.toString(), repo);
  const remoteHead: Ref = modelComponent.laneHeadRemote as Ref;
  const currentComponent: Version = await modelComponent.loadVersion(remoteHead.toString(), repo);
  // threeWayMerge expects `otherComponent` to be Component and `currentComponent` to be Version
  // since it doesn't matter whether we take the changes from base to current or the changes from
  // base to other, here we replace the two. the result is going to be the same.
  const mergeResults = await threeWayMerge({
    consumer,
    otherComponent: component, // this is actually the current
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    otherLabel: `${currentlyUsedVersion} (local)`,
    currentComponent, // this is actually the other
    currentLabel: `${remoteHead.toString()} (${otherLaneName})`,
    baseComponent
  });
  return { componentFromFS: component, id: component.id, mergeResults };
}

async function snapResolvedComponents(consumer: Consumer) {
  const resolvedComponents = consumer.scope.objects.unmergedComponents.getResolvedComponents();
  if (!resolvedComponents.length) return;
  const ids = BitIds.fromArray(resolvedComponents.map(r => new BitId(r.id)));
  await consumer.snap({
    ids
  });
}

async function abortMerge(consumer: Consumer, ids: BitId[]): Promise<ApplyVersionResults> {
  // @ts-ignore not clear yet what to do with other flags
  const results = await checkoutVersion(consumer, { ids, reset: true });
  ids.forEach(id => consumer.scope.objects.unmergedComponents.removeComponent(id.name));
  await consumer.scope.objects.unmergedComponents.write();
  return { abortedComponents: results.components };
}

async function resolveMerge(consumer: Consumer, ids: BitId[]): Promise<ApplyVersionResults> {
  const { snappedComponents } = await consumer.snap({
    ids: BitIds.fromArray(ids),
    resolveUnmerged: true
  });
  return { snappedComponents };
}

function getIdsForUnresolved(consumer: Consumer, bitIds?: BitId[]): BitId[] {
  if (bitIds) {
    bitIds.forEach(id => {
      const entry = consumer.scope.objects.unmergedComponents.getEntry(id.name);
      if (!entry || entry.resolved) {
        throw new GeneralError(`unable to merge-resolve ${id.toString()}, it is not marked as unresolved`);
      }
    });
    return bitIds;
  }
  const unresolvedComponents = consumer.scope.objects.unmergedComponents.getUnresolvedComponents();
  if (!unresolvedComponents.length) throw new GeneralError(`all components are resolved already, nothing to do`);
  return unresolvedComponents.map(u => new BitId(u.id));
}
