import { PreviewAspect, PreviewRuntime } from '@teambit/preview';

import { connectToParent } from 'penpal';

import { BitBaseEvent } from './bit-base-event';
import { PubsubAspect } from './pubsub.aspect';

export class PubsubPreview {
  static _singletonPubsub: PubsubPreview | null = null;

  private _parentPubsub;

  constructor() {}

  public updateParentPubsub = async () => {
    this._parentPubsub = await connectToParent({timeout: 300}).promise.then((parentPubsub) => {
      return parentPubsub
    }).catch((err) => {
      console.error(err);
    });
  };

  sub = (topicUUID, callback) => {
    this._parentPubsub.sub(topicUUID, callback);
  };

  pub = (topicUUID, event: BitBaseEvent) => {
    this._parentPubsub.pub(topicUUID, event);
  };

  static runtime = PreviewRuntime;

  static async provider() {
    if (!this._singletonPubsub) {
      this._singletonPubsub = new PubsubPreview();
      
      setTimeout(async() => {
        if(this._singletonPubsub)
        await this._singletonPubsub.updateParentPubsub();
      }, 0);
    }
    return this._singletonPubsub;
  }
}

PubsubAspect.addRuntime(PubsubPreview);
