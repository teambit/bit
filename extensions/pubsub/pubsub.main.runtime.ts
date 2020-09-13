import { MainRuntime } from '@teambit/cli';

import { BitBaseEvent } from '../../custom-types';
import { PubsubAspect } from './pubsub.aspect';

export class PubsubMain {
  private topicMap = {};

  static runtime = MainRuntime;
  static _singletonPubsub: any = null;

  private createOrGetTopic = (topicUUID) => {
    this.topicMap[topicUUID] = this.topicMap[topicUUID] || [];
  };

  subscribeToTopic = (topicUUID, callback) => {
    this.createOrGetTopic(topicUUID);
    this.topicMap[topicUUID].push(callback);
  };

  publishToTopic = (topicUUID, event: BitBaseEvent) => {
    this.createOrGetTopic(topicUUID);
    this.topicMap[topicUUID].forEach((callback) => callback(event));
  };

  static async provider() {
    if (!this._singletonPubsub) {
      this._singletonPubsub = new PubsubMain();
    }
    return this._singletonPubsub;
  }
}

PubsubAspect.addRuntime(PubsubMain);
