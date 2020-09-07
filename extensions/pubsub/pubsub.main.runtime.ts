import { MainRuntime } from '@teambit/cli';

import { PubsubAspect } from './pubsub.aspect';

export class PubsubMain {
  static runtime = MainRuntime;
  static _singletonPubsub = null;

  createTopic = (topicUUID) => {
    throw 'Not Implemented';
  };

  subscribeToTopic = (topicUUID) => {
    throw 'Not Implemented';
  };

  publishToTopic = (topicUUID) => {
    throw 'Not Implemented';
  };

  static async provider() {
    console.log('hi pubsub');
    if (!this._singletonPubsub) {
      this._singletonPubsub = new PubsubMain();
    }
    return this._singletonPubsub;
  }
}

PubsubAspect.addRuntime(PubsubMain);
