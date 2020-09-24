import { MainRuntime } from '@teambit/cli';

import { BitBaseEvent } from './bit-base-event';
import { PubsubAspect } from './pubsub.aspect';

export class PubsubMain {
  private topicMap = {};

<<<<<<< HEAD
  static _singletonPubsub: any = null;

=======
>>>>>>> master
  private createOrGetTopic = (topicUUID) => {
    this.topicMap[topicUUID] = this.topicMap[topicUUID] || [];
  };

<<<<<<< HEAD
  sub = (topicUUID, callback) => {
    this.createOrGetTopic(topicUUID);
    this.topicMap[topicUUID].push(callback);
  };

  pub = (topicUUID, event: BitBaseEvent) => {
    this.createOrGetTopic(topicUUID);
    this.topicMap[topicUUID].forEach((callback) => callback(event));
  };
=======
  public sub(topicUUID, callback) {
    this.createOrGetTopic(topicUUID);
    this.topicMap[topicUUID].push(callback);
  }

  public pub(topicUUID, event: BitBaseEvent<any>) {
    this.createOrGetTopic(topicUUID);
    this.topicMap[topicUUID].forEach((callback) => callback(event));
  }
>>>>>>> master

  static runtime = MainRuntime;

  static async provider() {
<<<<<<< HEAD
    if (!this._singletonPubsub) {
      this._singletonPubsub = new PubsubMain();
    }
    return this._singletonPubsub;
=======
    return new PubsubMain();
>>>>>>> master
  }
}

PubsubAspect.addRuntime(PubsubMain);
