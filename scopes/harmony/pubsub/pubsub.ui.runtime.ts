import { UIRuntime, UIAspect, UiUI } from '@teambit/ui';

import { connectToChild } from 'penpal';

import { BitBaseEvent } from './bit-base-event';
import { PubsubAspect } from './pubsub.aspect';

import { createProvider } from './pubsub-context';

export class PubsubUI {
  private topicMap = {};

  private connectToIframe = (iframe: HTMLIFrameElement) => {
    const connection = connectToChild({
      iframe,
      methods: this.pubsubMethods,
    });

    const destroy = () => {
      connection && connection.destroy();
    };
    return destroy;
  };

  private createOrGetTopic = (topicUUID) => {
    this.topicMap[topicUUID] = this.topicMap[topicUUID] || [];
  };

  public sub = (topicUUID, callback) => {
    this.createOrGetTopic(topicUUID);
    this.topicMap[topicUUID].push(callback);
  };

  public pub = (topicUUID, event: BitBaseEvent<any>) => {
    this.createOrGetTopic(topicUUID);
    this.topicMap[topicUUID].forEach((callback) => callback(event));
  };

  private pubsubMethods = {
    sub: this.sub,
    pub: this.pub,
  };

  static runtime = UIRuntime;
  static dependencies = [UIAspect];

  static async provider([uiUI]: [UiUI]) {
    const pubsubUI = new PubsubUI();

    const reactContext = createProvider({
      connect: pubsubUI.connectToIframe,
    });

    uiUI.registerRenderHooks({ reactContext });

    return pubsubUI;
  }
}

PubsubAspect.addRuntime(PubsubUI);
