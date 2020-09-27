import { PreviewAspect, PreviewRuntime } from '@teambit/preview';

import { connectToParent } from 'penpal';

import { BitBaseEvent } from './bit-base-event';
import { PubsubAspect } from './pubsub.aspect';

export class PubsubPreview {
  private _parentPubsub;

  constructor() {}

  public async updateParentPubsub() {
    return await connectToParent({ timeout: 300 })
      .promise.then((parentPubsub) => {
        this._parentPubsub = parentPubsub;
      })
      .catch((err) => {
        // console.error('-PubsubPreview-', err);
        return this.updateParentPubsub();
      });
  }

  public sub(topicUUID, callback) {
    this._parentPubsub.sub(topicUUID, callback);
  }

  public pub(topicUUID, event: BitBaseEvent<any>) {
    this._parentPubsub.pub(topicUUID, event);
  }

  static runtime = PreviewRuntime;

  static async provider() {
    const pubsubPreview = new PubsubPreview();
    // await pubsubPreview.updateParentPubsub();
    return pubsubPreview;
  }
}

PubsubAspect.addRuntime(PubsubPreview);
