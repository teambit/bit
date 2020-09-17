import { UIAspect, UIRuntime } from '@teambit/ui';

import { connectToChild } from 'penpal';

import { BitBaseEvent } from './bitBaseEvent';
import { PubsubAspect } from './pubsub.aspect';

export class PubsubUI {
  private topicMap = {};

  static _singletonPubsub: any = null;

  private _connections;

  private getAllIframes = () => {
    return Array.from(document.getElementsByTagName('iframe'));
  };

  private connectToIframe = (iframe) => {
    return connectToChild({
      iframe,
      // Methods the parent is exposing to the child
      methods: {
        add(num1, num2) {
          //TODO: remove this
          return num1 + num2;
        },
        sub(topicUUID, callback) {
          return this.sub(topicUUID, callback);
        },
        pub(topicUUID, event: BitBaseEvent) {
          return this.pub(topicUUID, event);
        },
      },
    });
  };

  private updateConnectionsList() {
    const _iframes = this.getAllIframes();
    this._connections = _iframes.map((iframe) => this.connectToIframe(iframe));
  }

  private createOrGetTopic = (topicUUID) => {
    this.topicMap[topicUUID] = this.topicMap[topicUUID] || [];
  };

  constructor() {
    this.updateConnectionsList();
  }

  public sub = (topicUUID, callback) => {
    this.updateConnectionsList();

    this.createOrGetTopic(topicUUID);
    this.topicMap[topicUUID].push(callback);
  };

  public pub = (topicUUID, event: BitBaseEvent) => {
    this.updateConnectionsList();

    this.createOrGetTopic(topicUUID);
    this.topicMap[topicUUID].forEach((callback) => callback(event));
  };

  static runtime = UIRuntime;

  static async provider() {
    if (!this._singletonPubsub) {
      this._singletonPubsub = new PubsubUI();
    }
    return this._singletonPubsub;
  }
}

PubsubAspect.addRuntime(PubsubUI);
