/**
 * Please Notice: This file will run in the preview iframe.
 */

// TODO: Use log aspect - currently do not work with the legacy log.
// TODO: Decide and configure a consistent this alias.
/* eslint-disable @typescript-eslint/no-this-alias */

import { PreviewRuntime } from '@teambit/preview';

import { connectToParent } from 'penpal';

import { BitBaseEvent } from './bit-base-event';
import { PubsubAspect } from './pubsub.aspect';

export class PubsubPreview {
  private _parentPubsub;

  public async updateParentPubsub() {
    return connectToParent({ timeout: 300 })
      .promise.then((parentPubsub) => {
        this._parentPubsub = parentPubsub;
      })
      .catch(() => {
        return this.updateParentPubsub();
      });
  }

  public init = () => {
    window.addEventListener('load', () => {

      // Making sure parent call connect-to-child before the child call connect-to-parent
      // (not sure if its needed anymore)
      setTimeout(() => {
        this.updateParentPubsub();
      }, 0);
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
    if (typeof window !== 'undefined') {
      pubsubPreview.init();
    }

    return pubsubPreview;
  }
}

PubsubAspect.addRuntime(PubsubPreview);
