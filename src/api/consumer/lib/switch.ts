import loader from '../../../cli/loader';
import { BEFORE_CHECKOUT } from '../../../cli/loader/loader-messages';
import { DEFAULT_LANE } from '../../../constants';
import { Consumer, loadConsumer } from '../../../consumer';
import createLane from '../../../consumer/lanes/create-lane';
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
  let results;
  if (switchProps.create) {
    await createLane(consumer, switchProps.laneName);
    consumer.scope.lanes.setCurrentLane(switchProps.laneName);
    results = { added: switchProps.laneName };
  } else {
    await populateSwitchProps(consumer, switchProps);
    results = await switchLanes(consumer, switchProps, checkoutProps);
  }

  await consumer.onDestroy();
  return results;
}

async function populateSwitchProps(consumer: Consumer, switchProps: SwitchProps) {
  const lanes = await consumer.scope.listLanes();
  const { laneName, remoteScope } = switchProps;
  if (remoteScope) {
    await populatePropsAccordingToRemoteLane();
  } else {
    populatePropsAccordingToLocalLane();
  }

  async function populatePropsAccordingToRemoteLane() {
    // fetch the remote to update all heads
    const localTrackedLane = consumer.scope.lanes.getLocalTrackedLaneByRemoteName(laneName, remoteScope as string);
    switchProps.localLaneName = switchProps.newLaneName || localTrackedLane || laneName;
    if (consumer.getCurrentLaneId().name === switchProps.localLaneName) {
      throw new GeneralError(`already checked out to "${switchProps.localLaneName}"`);
    }
    const scopeComponentImporter = ScopeComponentsImporter.getInstance(consumer.scope);
    const remoteLaneObjects = await scopeComponentImporter.importFromLanes([
      RemoteLaneId.from(laneName, remoteScope as string),
    ]);
    const remoteLaneComponents = remoteLaneObjects[0].components;
    const laneExistsLocally = lanes.find((l) => l.name === switchProps.localLaneName);
    if (laneExistsLocally) {
      throw new GeneralError(`unable to checkout to a remote lane ${remoteScope}/${laneName}.
    the local lane ${switchProps.localLaneName} already exists, please switch to the local lane first by omitting --remote flag
    then run "bit merge" to merge the remote lane into the local lane`);
    }
    switchProps.ids = remoteLaneComponents.map((l) => l.id.changeVersion(l.head.toString()));
    switchProps.remoteLaneScope = remoteScope;
    switchProps.remoteLaneName = laneName;
    switchProps.remoteLaneComponents = remoteLaneComponents;
    switchProps.localTrackedLane = localTrackedLane || undefined;
  }

  function populatePropsAccordingToLocalLane() {
    switchProps.localLaneName = laneName;
    if (consumer.getCurrentLaneId().name === laneName) {
      throw new GeneralError(`already checked out to "${laneName}"`);
    }
    if (laneName === DEFAULT_LANE) {
      switchProps.ids = consumer.bitMap.getAuthoredAndImportedBitIdsOfDefaultLane();
      return;
    }
    const localLane = lanes.find((lane) => lane.name === laneName);
    if (!localLane) {
      throw new GeneralError(
        `unable to find a local lane "${laneName}", to create a new lane please use --create flag`
      );
    }
    switchProps.ids = localLane.components.map((c) => c.id.changeVersion(c.head.toString()));
  }
}
