/**
 * Please Notice: This file will run in the preview iframe.
 */

import { PreviewRuntime } from '@teambit/preview';
import { isBrowser } from '@teambit/ui.is-browser';

import { connectToParent } from 'penpal';

import { BitBaseEvent } from './bit-base-event';
import { PubsubAspect } from './pubsub.aspect';

type ParentMethods = {
  sub: (topicUUID: string, event: any) => Promise<void>;
  pub: (topicUUID: string, event: any) => Promise<void>;
};

export class PubsubPreview {
  private _parentPubsub?: ParentMethods;

  private inIframe() {
    try {
      return isBrowser && window.self !== window.top;
    } catch (e) {
      return true;
    }
  }

  private connectToParentPubSub = (retries = 10) => {
    if (retries <= 0) return undefined;

    return connectToParent<ParentMethods>({ timeout: 300 })
      .promise.then((parentPubsub) => {
        return (this._parentPubsub = parentPubsub);
      })
      .catch((e: any) => {
        if (e.code !== 'ConnectionTimeout') return undefined;

        return this.connectToParentPubSub(retries - 1);
      });
  };

  public sub(topicUUID, callback) {
    if (!this._parentPubsub) return undefined;

    return this._parentPubsub?.sub(topicUUID, callback);
  }

  public pub(topicUUID, event: BitBaseEvent<any>) {
    if (!this._parentPubsub) return undefined;

    return this._parentPubsub.pub(topicUUID, event);
  }

  static runtime = PreviewRuntime;

  static async provider() {
    const pubsubPreview = new PubsubPreview();

    if (pubsubPreview.inIframe()) {
      return pubsubPreview.connectToParentPubSub();
    }

    return pubsubPreview;
  }
}

PubsubAspect.addRuntime(PubsubPreview);
