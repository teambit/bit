import { bitBaseEvent } from '../../custom-types';

import { MainRuntime } from '@teambit/cli';

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

    // console.log('--subscribeToTopic--> topicMap: ', this.topicMap);
  };

  publishToTopic = (topicUUID, event: bitBaseEvent) => {
    this.createOrGetTopic(topicUUID);
    this.topicMap[topicUUID].forEach((callback) => callback(event));

    // console.log('--publishToTopic--> topicMap: ', this.topicMap);
  };

  static async provider() {
    if (!this._singletonPubsub) {
      this._singletonPubsub = new PubsubMain();
    }
    return this._singletonPubsub;
  }
}

PubsubAspect.addRuntime(PubsubMain);
