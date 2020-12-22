// TODO: Use log aspect - currently do not work with the legacy log.
// TODO: Decide and configure a consistent this alias.
/* eslint-disable @typescript-eslint/no-this-alias */

import { UIRuntime } from '@teambit/ui';

import { connectToChild } from 'penpal';
import MutationObserver from 'mutation-observer';

import { BitBaseEvent } from './bit-base-event';
import { PubsubAspect } from './pubsub.aspect';

export class PubsubUI {
  private topicMap = {};
  private _childs;

  private getAllIframes = () => {
    return Array.from(document.getElementsByTagName('iframe'));
  };

  private connectToIframe = async (iframe) => {
    const _this = this;

    return connectToChild({
      timeout: 500,
      iframe,
      methods: {
        sub(topicUUID, callback) {
          return _this.sub(topicUUID, callback);
        },
        pub(topicUUID, event: BitBaseEvent<any>) {
          return _this.pub(topicUUID, event);
        },
      },
    })
      .promise.then((child) => child)
      .catch(() => {
        return this.connectToIframe(iframe);
      });
  };

  private updateConnectionsList() {
    const _iframes = this.getAllIframes();
    return _iframes.map((iframe) => this.connectToIframe(iframe));
  }

  private createOrGetTopic = (topicUUID) => {
    this.topicMap[topicUUID] = this.topicMap[topicUUID] || [];
  };

  public async updateConnectionListWithRetry() {
    this.updateConnectionsList();
    const config = { childList: true, subtree: true };

    // TODO - consider collecting iframes using a react context, instead of using MutationObserver
    const observer = new MutationObserver((e: MutationRecord[]) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const addedIframes = e
        .map((x) => Array.from(x.addedNodes).filter((element) => element.nodeName === 'IFRAME'))
        .flat();
      this.updateConnectionsList();
    });
    observer.observe(document.body, config);
  }

  public sub = (topicUUID, callback) => {
    this.createOrGetTopic(topicUUID);
    this.topicMap[topicUUID].push(callback);
  };

  public pub = (topicUUID, event: BitBaseEvent<any>) => {
    this.createOrGetTopic(topicUUID);
    this.topicMap[topicUUID].forEach((callback) => callback(event));
  };

  static runtime = UIRuntime;

  static async provider() {
    const pubsubUI = new PubsubUI();
    if (typeof window !== 'undefined') {
      await pubsubUI.updateConnectionListWithRetry();
    }
    return pubsubUI;
  }
}

PubsubAspect.addRuntime(PubsubUI);
