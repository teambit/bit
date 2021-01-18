import React, { ReactNode } from 'react';
import { UIRuntime, UIAspect, UiUI } from '@teambit/ui';

import { connectToChild } from 'penpal';
import { Connection } from 'penpal/lib/types';

import { BitBaseEvent } from './bit-base-event';
import { PubsubAspect } from './pubsub.aspect';

import { pubsubRegistry, PubSubRegistry } from './pubsub-context';

export class PubsubUI {
  private topicMap = {};

  private connectToIframeWithRetry = (iframe: HTMLIFrameElement, update: (c: Connection) => void, retries = 3) => {
    const connection = connectToChild({
      timeout: 500,
      iframe,
      methods: this.pubsubMethods,
    });

    connection.promise.catch((e) => {
      // make sure not to retry when code === "ConnectionDestroyed"
      if (e.code !== 'ConnectionTimeout') return;

      if (retries <= 0) return;
      this.connectToIframeWithRetry(iframe, update, retries - 1); // recursion!
    });

    update(connection);
  };

  private connectToIframe = (iframe: HTMLIFrameElement) => {
    let connection: Connection;

    this.connectToIframeWithRetry(iframe, (c) => (connection = c));

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

function createProvider(pubSubContext: PubSubRegistry) {
  const PubSubProvider = ({ children }: { children: ReactNode }) => (
    <pubsubRegistry.Provider value={pubSubContext}>{children}</pubsubRegistry.Provider>
  );

  return PubSubProvider;
}

PubsubAspect.addRuntime(PubsubUI);
