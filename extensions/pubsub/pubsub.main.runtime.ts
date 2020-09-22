import { MainRuntime } from '@teambit/cli';

import { BitBaseEvent } from './bitBaseEvent';
import { PubsubAspect } from './pubsub.aspect';

export class PubsubMain {
  private topicMap = {};

  private createOrGetTopic = (topicUUID) => {
    this.topicMap[topicUUID] = this.topicMap[topicUUID] || [];
  };

  sub = (topicUUID, callback) => {
    this.createOrGetTopic(topicUUID);
    this.topicMap[topicUUID].push(callback);
  };

  pub = (topicUUID, event: BitBaseEvent) => {
    this.createOrGetTopic(topicUUID);
    this.topicMap[topicUUID].forEach((callback) => callback(event));
  };

  static runtime = MainRuntime;

  static async provider() {
    return new PubsubMain();
  }
}

PubsubAspect.addRuntime(PubsubMain);
