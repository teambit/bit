import { PreviewAspect, PreviewRuntime } from '@teambit/preview';

import { connectToParent } from 'penpal';

import { BitBaseEvent } from './bit-base-event';
import { PubsubAspect } from './pubsub.aspect';

export class PubsubPreview {
  static _singletonPubsub: any = null;

  private _connection;

  constructor() {
    console.log('START23: ');
    this._connection = connectToParent();
    setInterval(() => {
      this._connection = connectToParent();
    }, 3000);
  }

  sub = (topicUUID, callback) => {
    this._connection.promise.then((parent) => {
      parent.sub(topicUUID, callback);
    });
  };

  pub = (topicUUID, event: BitBaseEvent) => {
    console.log('Event2: ', event);
    this._connection.promise.then((parent) => {
      console.log('Event3: ', event);
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
