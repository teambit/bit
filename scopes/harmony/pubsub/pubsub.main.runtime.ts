import { MainRuntime } from '@teambit/cli';

import { BitBaseEvent } from './bit-base-event';
import { PubsubAspect } from './pubsub.aspect';

export class PubsubMain {
  private topicMap = {};

  private createOrGetTopic = (topicUUID) => {
    this.topicMap[topicUUID] = this.topicMap[topicUUID] || [];
  };

  public sub(topicUUID, callback) {
    this.createOrGetTopic(topicUUID);
    this.topicMap[topicUUID].push(callback);
  }

  public pub(topicUUID, event: BitBaseEvent<any>) {
    this.createOrGetTopic(topicUUID);
    this.topicMap[topicUUID].forEach((callback) => callback(event));
  }

  unsubscribeAll(topicId: string) {
    delete this.topicMap[topicId];
  }

  static runtime = MainRuntime;

  static async provider() {
    return new PubsubMain();
  }
}

PubsubAspect.addRuntime(PubsubMain);
