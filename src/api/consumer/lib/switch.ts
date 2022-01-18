import logger from '@teambit/legacy/dist/logger/logger';
import loader from '../../../cli/loader';
import { BEFORE_CHECKOUT } from '../../../cli/loader/loader-messages';
import { DEFAULT_LANE } from '../../../constants';
import { Consumer, loadConsumer } from '../../../consumer';
import { LanesIsDisabled } from '../../../consumer/lanes/exceptions/lanes-is-disabled';
import switchLanes, { SwitchProps } from '../../../consumer/lanes/switch-lanes';
import { CheckoutProps } from '../../../consumer/versions-ops/checkout-version';
import { ApplyVersionResults } from '../../../consumer/versions-ops/merge-version';
import GeneralError from '../../../error/general-error';
import { RemoteLaneId } from '../../../lane-id/lane-id';
import ScopeComponentsImporter from '../../../scope/component-ops/scope-components-importer';

export default async function switchAction(
  switchProps: SwitchProps,
  checkoutProps: CheckoutProps
): Promise<ApplyVersionResults> {
  loader.start(BEFORE_CHECKOUT);
  const consumer: Consumer = await loadConsumer();
  if (consumer.isLegacy) throw new LanesIsDisabled();
  await populateSwitchProps(consumer, switchProps);
  const results = await switchLanes(consumer, switchProps, checkoutProps);

  await consumer.onDestroy();
  return results;
}

async function populateSwitchProps(consumer: Consumer, switchProps: SwitchProps) {
  const lanes = await consumer.scope.listLanes();
  const isDefaultLane = switchProps.laneName === DEFAULT_LANE;

  const localLane = lanes.find((lane) => lane.name === switchProps.laneName);

  if (isDefaultLane || localLane) {
    populatePropsAccordingToLocalLane();
  } else {
    await populatePropsAccordingToRemoteLane();
  }

  async function populatePropsAccordingToRemoteLane() {
    let remoteLaneId: RemoteLaneId;
    try {
      remoteLaneId = RemoteLaneId.parse(switchProps.laneName);
    } catch (e) {
      throw new GeneralError(
        `invalid lane id "${switchProps.laneName}", the lane ${switchProps.laneName} doesn't exist.`
      );
    }
    if (remoteLaneId.name === DEFAULT_LANE) {
      throw new GeneralError(`invalid remote lane id "${switchProps.laneName}". to switch to the main lane on remote, 
      run "bit switch main" and then "bit import".`);
    }
    // fetch the remote to update all heads
    const localTrackedLane = consumer.scope.lanes.getLocalTrackedLaneByRemoteName(
      remoteLaneId.name,
      remoteLaneId.scope as string
    );
    switchProps.localLaneName = switchProps.newLaneName || localTrackedLane || remoteLaneId.name;
    if (consumer.getCurrentLaneId().name === switchProps.localLaneName) {
      throw new GeneralError(`already checked out to "${switchProps.localLaneName}"`);
    }
    const scopeComponentImporter = ScopeComponentsImporter.getInstance(consumer.scope);
    const remoteLaneObjects = await scopeComponentImporter.importFromLanes([remoteLaneId]);
    if (remoteLaneObjects.length === 0) {
      throw new GeneralError(
        `invalid lane id "${switchProps.laneName}", the lane ${switchProps.laneName} doesn't exist.`
      );
    }
    const remoteLaneComponents = remoteLaneObjects[0].components;
    const laneExistsLocally = lanes.find((l) => l.name === switchProps.localLaneName);
    if (laneExistsLocally) {
      throw new GeneralError(`unable to checkout to a remote lane ${switchProps.remoteScope}/${switchProps.laneName}.
    the local lane ${switchProps.localLaneName} already exists, please switch to the local lane first by omitting the <scope-name>
    then run "bit merge" to merge the remote lane into the local lane`);
    }
    switchProps.remoteLaneName = remoteLaneId.name;
    switchProps.laneName = remoteLaneId.name;
    switchProps.remoteLaneScope = remoteLaneId.scope;
    switchProps.remoteScope = remoteLaneId.scope;
    switchProps.ids = remoteLaneComponents.map((l) => l.id.changeVersion(l.head.toString()));
    switchProps.remoteLaneComponents = remoteLaneComponents;
    switchProps.localTrackedLane = localTrackedLane || undefined;
  }

  function populatePropsAccordingToLocalLane() {
    switchProps.localLaneName = switchProps.laneName;
    if (consumer.getCurrentLaneId().name === switchProps.laneName) {
      throw new GeneralError(`already checked out to "${switchProps.laneName}"`);
    }
    if (switchProps.laneName === DEFAULT_LANE) {
      switchProps.ids = consumer.bitMap.getAuthoredAndImportedBitIdsOfDefaultLane();
      return;
    }
    if (!localLane) {
      throw new GeneralError(
        `unable to find a local lane "${switchProps.laneName}", to create a new lane please run "bit lane create"`
      );
    }
    switchProps.ids = localLane.components.map((c) => c.id.changeVersion(c.head.toString()));
  }
}
