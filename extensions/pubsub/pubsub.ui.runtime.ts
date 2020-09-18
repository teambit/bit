import { UIAspect, UIRuntime } from '@teambit/ui';

import { connectToChild } from 'penpal';

import { BitBaseEvent } from './bit-base-event';
import { PubsubAspect } from './pubsub.aspect';

export class PubsubUI {
  private topicMap = {};

  static _singletonPubsub: any = null;

  private _connections;

  private getAllIframes = () => {
    return Array.from(document.getElementsByTagName('iframe'));
  };

  private connectToIframe = (iframe) => {
    // console.log('iframe1: ', iframe);
    const self = this;
    return connectToChild({
      iframe,
      // Methods the parent is exposing to the child
      methods: {
        add(num1, num2) {
          //TODO: remove this
          return num1 + num2;
        },
        sub(topicUUID, callback) {
          return self.sub(topicUUID, callback);
        },
        pub(topicUUID, event: BitBaseEvent) {
          console.log('Event4: ', event);
          return self.pub(topicUUID, event);
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
    console.log('START2: ');
    this.updateConnectionsList();
    setTimeout(() => {this.updateConnectionsList();}, 500);

    // setInterval(() => {
    //   this.updateConnectionsList();
    // }, 3000);

    console.log('this._connections ', this._connections);
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
