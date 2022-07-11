import R from 'ramda';

import { InvalidScopeName, InvalidScopeNameFromRemote } from '@teambit/legacy-bit-id';
import logger from '@teambit/legacy/dist/logger/logger';
import { LaneId } from '@teambit/lane-id';
import ScopeComponentsImporter from '../../../scope/component-ops/scope-components-importer';
import { Analytics } from '../../../analytics/analytics';
import loader from '../../../cli/loader';
import { Consumer, loadConsumer } from '../../../consumer';
import ImportComponents, { ImportOptions } from '../../../consumer/component-ops/import-components';
import GeneralError from '../../../error/general-error';
import { Lane } from '../../../scope/models';
import { ScopeNotFoundOrDenied } from '../../../remotes/exceptions/scope-not-found-or-denied';
import { LaneNotFound } from '../../scope/lib/exceptions/lane-not-found';

export default async function fetch(ids: string[], lanes: boolean, components: boolean, fromOriginalScope: boolean) {
  if (!lanes && !components) {
    throw new GeneralError(
      `please provide the type of objects you would like to pull, the options are --components and --lanes`
    );
  }
  loader.start('fetching objects...');
  const consumer: Consumer = await loadConsumer();
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
  if (lanes) {
    importOptions.lanes = await getLanes();
    importOptions.ids = [];
  }
  const importComponents = new ImportComponents(consumer, importOptions);
  const { dependencies, envComponents, importDetails } = await importComponents.importComponents();
  const bitIds = dependencies.map(R.path(['component', 'id']));
  Analytics.setExtraData('num_components', bitIds.length);
  await consumer.onDestroy();
  return { dependencies, envComponents, importDetails };

  async function getLanes(): Promise<{ laneIds: LaneId[]; lanes: Lane[] }> {
    const result: { laneIds: LaneId[]; lanes: Lane[] } = { laneIds: [], lanes: [] };
    let remoteLaneIds: LaneId[] = [];
    if (ids.length) {
      remoteLaneIds = ids.map((id) => {
        const trackLane = consumer.scope.lanes.getRemoteTrackedDataByLocalLane(id);
        if (trackLane) return LaneId.from(trackLane.remoteLane, trackLane.remoteScope);
        return LaneId.parse(id);
      });
    } else {
      remoteLaneIds = await consumer.scope.objects.remoteLanes.getAllRemoteLaneIds();
    }
    const scopeComponentImporter = ScopeComponentsImporter.getInstance(consumer.scope);
    try {
      const remoteLanes = await scopeComponentImporter.importLanes(remoteLaneIds);
      result.laneIds.push(...remoteLaneIds);
      result.lanes.push(...remoteLanes);
    } catch (err) {
      if (
        err instanceof InvalidScopeName ||
        err instanceof ScopeNotFoundOrDenied ||
        err instanceof LaneNotFound ||
        err instanceof InvalidScopeNameFromRemote
      ) {
        // the lane could be a local lane so no need to throw an error in such case
        loader.stop();
        logger.console(`unable to get lane's data from a remote due to an error:\n${err.message}`, 'warn', 'yellow');
      } else {
        throw err;
      }
    }

    return result;
  }
}
