import { PreviewAspect, PreviewRuntime } from '@teambit/preview';

import { connectToParent } from 'penpal';

import { BitBaseEvent } from './bitBaseEvent';
import { PubsubAspect } from './pubsub.aspect';

export class PubsubPreview {
  static _singletonPubsub: any = null;

  private _connection;

  constructor() {
    this._connection = connectToParent();
  }

  sub = (topicUUID, callback) => {
    this._connection.promise.then((parent) => {
      parent.sub(topicUUID, callback);
    });
  };

  pub = (topicUUID, event: BitBaseEvent) => {
    this._connection.promise.then((parent) => {
      parent.pub(topicUUID, event);
    });
  };

  static runtime = PreviewRuntime;

  static async provider() {
    if (!this._singletonPubsub) {
      this._singletonPubsub = new PubsubPreview();
    }
    return this._singletonPubsub;
  }
}

PubsubAspect.addRuntime(PubsubPreview);
