import pMap from 'p-map';
import pMapSeries from 'p-map-series';
import { Writable } from 'stream';
import { BitObject, Repository } from '.';
import { CONCURRENT_COMPONENTS_LIMIT, DEFAULT_LANE } from '../../constants';
import { RemoteLaneId } from '../../lane-id/lane-id';
import logger from '../../logger/logger';
import { ModelComponentMerger } from '../component-ops/model-components-merger';
import { Lane, ModelComponent } from '../models';
import { SourceRepository } from '../repositories';
import { ObjectItem } from './object-list';

/**
 * first, write all immutable objects, such as files/sources/versions into the filesystem, as they arrive.
 * even if the process will crush later and the component-object won't be written, there is no
 * harm of writing these objects.
 * then, merge the component objects and write them to the filesystem. the index.json is written
 * as well to make sure they're indexed immediately, even if the process crushes on the next remote.
 * finally, take care of the lanes. the remote-lanes are not written at this point, only once all
 * remotes are processed. see @writeManyObjectListToModel.
 */
export class ObjectsWritable extends Writable {
  private mutableObjects: BitObject[] = [];
  lanes: Lane[] = [];
  constructor(private repo: Repository, private sources: SourceRepository, private remoteName: string) {
    super({ objectMode: true });
  }
  async _write(obj: ObjectItem, _, callback: Function) {
    logger.trace('ObjectsWritable.write', obj.ref);
    if (!obj.ref || !obj.buffer) {
      return callback(new Error('objectItem expected to have "ref" and "buffer" props'));
    }
    await this.writeImmutableObjectToFs(obj);
    return callback();
  }
  async _final(callback) {
    try {
      await this.writeMutableObjectsToFS();
      callback();
    } catch (err) {
      callback(err);
    }
  }
  private async writeImmutableObjectToFs(obj) {
    const bitObject = await BitObject.parseObject(obj.buffer);
    const isImmutable = !(bitObject instanceof ModelComponent) && !(bitObject instanceof Lane);
    if (isImmutable) await this.repo.writeObjectsToTheFS([bitObject]);
    else this.mutableObjects.push(bitObject);
  }
  private async writeMutableObjectsToFS() {
    const components = this.mutableObjects.filter((obj) => obj instanceof ModelComponent);
    const mergedComponents = await pMap(
      components,
      (component) => this.mergeModelComponent(component as ModelComponent, this.remoteName),
      {
        concurrency: CONCURRENT_COMPONENTS_LIMIT,
      }
    );
    await this.repo.writeObjectsToTheFS(mergedComponents);
    await this.repo.remoteLanes.addEntriesFromModelComponents(
      RemoteLaneId.from(DEFAULT_LANE, this.remoteName),
      mergedComponents
    );

    const laneObjects = this.mutableObjects.filter((obj) => obj instanceof Lane) as Lane[];
    await pMapSeries(laneObjects, async (lane) => {
      if (!lane.scope) {
        throw new Error(`scope.addObjectListToRepo scope is missing from a lane ${lane.name}`);
      }
      await this.repo.remoteLanes.syncWithLaneObject(lane.scope, lane);
      this.lanes.push(lane);
    });
  }

  /**
   * merge the imported component with the existing component in the local scope.
   * when importing a component, save the remote head into the remote master ref file.
   * unless this component arrived as a cache of the dependent, which its head might be wrong
   */
  private async mergeModelComponent(incomingComp: ModelComponent, remoteName: string): Promise<ModelComponent> {
    const isIncomingFromOrigin = remoteName === incomingComp.scope;
    const existingComp = await this.sources._findComponent(incomingComp);
    if (!existingComp || (existingComp && incomingComp.isEqual(existingComp))) {
      if (isIncomingFromOrigin) incomingComp.remoteHead = incomingComp.head;
      return incomingComp;
    }
    const modelComponentMerger = new ModelComponentMerger(existingComp, incomingComp, true, isIncomingFromOrigin);
    const { mergedComponent } = await modelComponentMerger.merge();
    if (isIncomingFromOrigin) mergedComponent.remoteHead = incomingComp.head;
    return mergedComponent;
  }
}
