import R from 'ramda';

import { Analytics } from '../../../analytics/analytics';
import loader from '../../../cli/loader';
import { Consumer, loadConsumer } from '../../../consumer';
import ImportComponents, { ImportOptions } from '../../../consumer/component-ops/import-components';
import { LanesIsDisabled } from '../../../consumer/lanes/exceptions/lanes-is-disabled';
import GeneralError from '../../../error/general-error';
import { RemoteLaneId } from '../../../lane-id/lane-id';

export default async function fetch(ids: string[], lanes: boolean, components: boolean, fromOriginalScope: boolean) {
  if (!lanes && !components) {
    throw new GeneralError(
      `please provide the type of objects you would like to pull, the options are --components and --lanes`
    );
  }
  loader.start('fetching objects...');
  const consumer: Consumer = await loadConsumer();
  if (consumer.isLegacy) {
    throw new LanesIsDisabled();
  }
  const importOptions: ImportOptions = {
    ids,
    objectsOnly: true,
    verbose: false,
    withEnvironments: false,
    writePackageJson: false,
    writeConfig: false,
    writeDists: false,
    override: false,
    installNpmPackages: false,
    fromOriginalScope,
  };
  const importComponents = new ImportComponents(consumer, importOptions);
  if (lanes) {
    const laneIds = await getLaneIds();
    importOptions.lanes = { laneIds };
  }
  const { dependencies, envComponents, importDetails } = await importComponents.importComponents();
  const bitIds = dependencies.map(R.path(['component', 'id']));
  Analytics.setExtraData('num_components', bitIds.length);
  await consumer.onDestroy();
  return { dependencies, envComponents, importDetails };

  async function getLaneIds(): Promise<RemoteLaneId[]> {
    if (ids.length) {
      return ids.map((id) => {
        const trackLane = consumer.scope.lanes.getRemoteTrackedDataByLocalLane(id);
        if (trackLane) return RemoteLaneId.from(trackLane.remoteLane, trackLane.remoteScope);
        // assuming it's a remote
        return RemoteLaneId.parse(id);
      });
    }
    return consumer.scope.objects.remoteLanes.getAllRemoteLaneIds();
  }
}
