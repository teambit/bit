/**
 * Please Notice: This file will run in the preview iframe.
 */

import { PreviewRuntime } from '@teambit/preview';
import { isBrowser } from '@teambit/ui.is-browser';

import { connectToParent } from 'penpal';

import { BitBaseEvent } from './bit-base-event';
import { PubsubAspect } from './pubsub.aspect';

export class PubsubPreview {
  private _parentPubsub;

  protected inIframe() {
    try {
      return isBrowser && window.self !== window.top;
    } catch (e) {
      return true;
    }
  }

  private updateParentPubsub = (retries = 3) => {
    if (retries <= 0) return undefined;

    return connectToParent({ timeout: 1 })
      .promise.then((parentPubsub) => {
        return (this._parentPubsub = parentPubsub);
      })
      .catch((e: any) => {
        if (e.code !== 'ConnectionTimeout') return undefined;

        return this.updateParentPubsub(retries - 1);
      });
  };

  public sub(topicUUID, callback) {
    if (this._parentPubsub) {
      this._parentPubsub.sub(topicUUID, callback);
    }
  }

  public pub(topicUUID, event: BitBaseEvent<any>) {
    if (this._parentPubsub) {
      this._parentPubsub.pub(topicUUID, event);
    }
  }

  static runtime = PreviewRuntime;

  static async provider() {
    const pubsubPreview = new PubsubPreview();
    if (pubsubPreview.inIframe()) {
      window.addEventListener('load', pubsubPreview.updateParentPubsub());
    }

    return pubsubPreview;
  }
}

PubsubAspect.addRuntime(PubsubPreview);
