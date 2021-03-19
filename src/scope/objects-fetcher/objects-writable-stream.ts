import { Writable } from 'stream';
import { BitObject, Repository } from '../objects';
import { DEFAULT_LANE } from '../../constants';
import { RemoteLaneId } from '../../lane-id/lane-id';
import logger from '../../logger/logger';
import { ModelComponentMerger } from '../component-ops/model-components-merger';
import { Lane, ModelComponent } from '../models';
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
    } catch (err) {
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
    } else {
      await this.objectsQueue.addImmutableObject(obj.ref.toString(), () => this.writeImmutableObject(bitObject));
    }
  }

  private async writeImmutableObject(bitObject: BitObject) {
    await this.repo.writeObjectsToTheFS([bitObject]);
  }

  private async writeComponentObject(modelComponent: ModelComponent) {
    const component = await this.mergeModelComponent(modelComponent, this.remoteName);
    await this.repo.writeObjectsToTheFS([component]);
    await this.repo.remoteLanes.addEntriesFromModelComponents(RemoteLaneId.from(DEFAULT_LANE, this.remoteName), [
      component,
    ]);
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
