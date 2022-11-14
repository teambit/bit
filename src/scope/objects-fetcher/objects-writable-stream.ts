import { Writable } from 'stream';
import { LaneId, DEFAULT_LANE } from '@teambit/lane-id';
import { BitObject, Repository } from '../objects';
import logger from '../../logger/logger';
import { ModelComponentMerger } from '../component-ops/model-components-merger';
import { Lane, ModelComponent, VersionHistory } from '../models';
import { SourceRepository } from '../repositories';
import { ObjectItem } from '../objects/object-list';
import { WriteObjectsQueue } from './write-objects-queue';
import { WriteComponentsQueue } from './write-components-queue';

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
  constructor(
    private repo: Repository,
    private sources: SourceRepository,
    private remoteName: string,
    private objectsQueue: WriteObjectsQueue,
    private componentsQueue: WriteComponentsQueue
  ) {
    super({ objectMode: true });
  }
  async _write(obj: ObjectItem, _, callback: Function) {
    logger.trace('ObjectsWritable.write', obj.ref);
    if (!obj.ref || !obj.buffer) {
      return callback(new Error('objectItem expected to have "ref" and "buffer" props'));
    }
    try {
      await this.writeObjectToFs(obj);
      return callback();
    } catch (err: any) {
      return callback(err);
    }
  }

  private async writeObjectToFs(obj: ObjectItem) {
    const bitObject = await BitObject.parseObject(obj.buffer);
    if (bitObject instanceof Lane) {
      throw new Error('ObjectsWritable does not support lanes');
    }
    if (bitObject instanceof ModelComponent) {
      await this.componentsQueue.addComponent(bitObject.id(), () => this.writeComponentObject(bitObject));
    } else if (bitObject instanceof VersionHistory) {
      // technically it's mutable, but it's ok to have it in the same queue with high concurrency because the merge is
      // simple enough and can't interrupt others
      await this.objectsQueue.addImmutableObject(obj.ref.toString(), () => this.mergeVersionHistory(bitObject));
    } else {
      await this.objectsQueue.addImmutableObject(obj.ref.toString(), () => this.writeImmutableObject(bitObject));
    }
  }

  private async writeImmutableObject(bitObject: BitObject) {
    await this.repo.writeObjectsToTheFS([bitObject]);
  }

  private async writeComponentObject(modelComponent: ModelComponent) {
    const component = await this.mergeModelComponent(modelComponent, this.remoteName);
    const componentIsPersistPendingAlready = this.repo.objects[component.hash().toString()];
    if (componentIsPersistPendingAlready) {
      // this happens during tag/snap, when all objects are waiting in the repo.objects and only once the tag/snap is
      // completed, all objects are persisted at once. we don't want the import process to interfere and save
      // components objects during the tag/snap.
      return;
    }
    await this.repo.writeObjectsToTheFS([component]);
    await this.repo.remoteLanes.addEntriesFromModelComponents(LaneId.from(DEFAULT_LANE, this.remoteName), [component]);
  }

  /**
   * merge the imported component with the existing component in the local scope.
   * when importing a component, save the remote head into the remote main ref file.
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

  private async mergeVersionHistory(versionHistory: VersionHistory) {
    const existingVersionHistory = (await this.repo.load(versionHistory.hash())) as VersionHistory | undefined;
    if (existingVersionHistory) {
      existingVersionHistory.merge(versionHistory);
      await this.repo.writeObjectsToTheFS([existingVersionHistory]);
    } else {
      await this.repo.writeObjectsToTheFS([versionHistory]);
    }
  }
}
