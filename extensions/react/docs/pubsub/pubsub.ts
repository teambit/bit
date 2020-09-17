import { PreviewAspect, PreviewRuntime } from '@teambit/preview';

import { connectToParent } from 'penpal';

import { BitBaseEvent } from './bitBaseEvent';

export class PubsubDoc {
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
}

export const provider = () => {
  if (!PubsubDoc._singletonPubsub) {
    PubsubDoc._singletonPubsub = new PubsubDoc();
  }
  return PubsubDoc._singletonPubsub;
};
