/**
 * Please Notice: This file will run in the preview iframe.
 */

// TODO: Use log aspect - currently do not work with the legacy log.
// TODO: Decide and configure a consistent this alias.
/* eslint-disable no-console, @typescript-eslint/no-this-alias */

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

        console.debug('parentPubsub', parentPubsub); // TODO: use log aspect
      })
      .catch((err) => {
        console.error('Attempt to connect to the parent window failed', err); // TODO: use log aspect
        return this.updateParentPubsub();
      });
  }

  // TODO[uri]: need to run on every possibility of adding new IFrames
  // TODO[uri]: Role back to 'focus' event?
  public async updateParentPubsubWithRetry() {
    window.addEventListener('load', () => {
      this.init();
    });
  }

  public init() {
    const _this = this;
    // Making sure parent call connect-to-child before the child call connect-to-parent
    setTimeout(() => {
      _this.updateParentPubsub();
    }, 0);
  }

  public sub(topicUUID, callback) {
    this._parentPubsub
      ? this._parentPubsub.sub(topicUUID, callback)
      : console.error(`Parent Pubsub is ${this._parentPubsub}`);
  }

  public pub(topicUUID, event: BitBaseEvent<any>) {
    this._parentPubsub
      ? this._parentPubsub.pub(topicUUID, event)
      : console.error(`Parent Pubsub is ${this._parentPubsub}`);
  }

  static runtime = PreviewRuntime;

  static async provider() {
    const pubsubPreview = new PubsubPreview();
    pubsubPreview.updateParentPubsubWithRetry();
    return pubsubPreview;
  }
}

PubsubAspect.addRuntime(PubsubPreview);
