import { Writable } from 'stream';
import { logger } from '@teambit/legacy.logger';
import {
  ObjectItem,
  BitObject,
  Repository,
  Lane,
  LaneHistory,
  ModelComponent,
  Version,
  VersionHistory,
} from '@teambit/scope.objects';
import { WriteObjectsQueue } from './write-objects-queue';
import { ComponentsPerRemote } from '../component-ops/multiple-component-merger';

const TIMEOUT_MINUTES_WARNING = 3;
const TIMEOUT_MINUTES_EXIT = 30;

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
  private timeoutId: NodeJS.Timeout;
  private intervalCounter = 0;
  constructor(
    private repo: Repository,
    private remoteName: string,
    private objectsQueue: WriteObjectsQueue,
    private componentsPerRemote: ComponentsPerRemote
  ) {
    super({ objectMode: true });
    if (!this.componentsPerRemote[remoteName]) this.componentsPerRemote[remoteName] = [];
    this.timeoutId = setInterval(
      () => {
        this.intervalCounter += 1;
        const timeLapsedInMinutes = this.intervalCounter * TIMEOUT_MINUTES_WARNING;
        const msg = `fetching from ${remoteName} takes more than ${timeLapsedInMinutes} minutes. make sure the remote is responsive`;
        logger.warn(msg);
        logger.console(`\n${msg}`, 'warn', 'yellow');
        if (timeLapsedInMinutes > TIMEOUT_MINUTES_EXIT) {
          throw new Error(`fetching from ${remoteName} takes more than ${TIMEOUT_MINUTES_EXIT} minutes. exiting...`);
        }
      },
      TIMEOUT_MINUTES_WARNING * 60 * 1000
    );
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
      logger.error(`found an issue during write of ${obj.ref.toString()}`, err);
      return callback(err);
    }
  }

  async _final(callback) {
    clearInterval(this.timeoutId);
    callback();
  }

  private async writeObjectToFs(obj: ObjectItem) {
    const bitObject = await BitObject.parseObject(obj.buffer);
    if (bitObject instanceof Lane) {
      throw new Error('ObjectsWritable does not support lanes');
    }
    if (bitObject instanceof ModelComponent) {
      this.addComponentToComponentsPerRemote(bitObject);
    } else if (bitObject instanceof VersionHistory) {
      // technically it's mutable, but it's ok to have it in the same queue with high concurrency because the merge is
      // simple enough and can't interrupt others
      await this.objectsQueue.addImmutableObject(obj.ref.toString(), () => this.mergeVersionHistory(bitObject));
    } else if (bitObject instanceof LaneHistory) {
      // technically it's mutable, but it's ok to have it in the same queue with high concurrency because the merge is
      // simple enough and can't interrupt others
      await this.objectsQueue.addImmutableObject(obj.ref.toString(), () => this.mergeLaneHistory(bitObject));
    } else if (bitObject instanceof Version) {
      // technically it's mutable, but it's ok to have it in the same queue with high concurrency because the merge is
      // simple enough and can't interrupt others
      await this.objectsQueue.addImmutableObject(obj.ref.toString(), () => this.mergeVersionObject(bitObject));
    } else {
      await this.objectsQueue.addImmutableObject(obj.ref.toString(), () => this.writeImmutableObject(bitObject));
    }
  }

  private async writeImmutableObject(bitObject: BitObject) {
    await this.repo.writeObjectsToTheFS([bitObject]);
  }

  private addComponentToComponentsPerRemote(component: ModelComponent) {
    const componentIsPersistPendingAlready = this.repo.objects[component.hash().toString()];
    if (componentIsPersistPendingAlready) {
      // this happens during tag/snap, when all objects are waiting in the repo.objects and only once the tag/snap is
      // completed, all objects are persisted at once. we don't want the import process to interfere and save
      // components objects during the tag/snap.
      return;
    }
    this.componentsPerRemote[this.remoteName].push(component);
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

  private async mergeLaneHistory(laneHistory: LaneHistory) {
    const existingLaneHistory = (await this.repo.load(laneHistory.hash())) as LaneHistory | undefined;
    if (existingLaneHistory) {
      existingLaneHistory.merge(laneHistory);
      await this.repo.writeObjectsToTheFS([existingLaneHistory]);
    } else {
      await this.repo.writeObjectsToTheFS([laneHistory]);
    }
  }

  private async mergeVersionObject(version: Version) {
    const existingVersion = (await this.repo.load(version.hash())) as Version | undefined;
    const isExistingNewer = existingVersion && existingVersion.lastModified() > version.lastModified();
    if (isExistingNewer) return;
    await this.repo.writeObjectsToTheFS([version]);
  }
}
