/**
 * Please Notice: This file will run in the preview iframe.
 */

import { PreviewRuntime } from '@teambit/preview';
import { isBrowser } from '@teambit/ui-foundation.ui.is-browser';

import { EventEmitter2 } from 'eventemitter2';
import { connectToParent, ErrorCode } from 'penpal';

import { BitBaseEvent } from './bit-base-event';
import { PubSubNoParentError } from './no-parent-error';
import { PubsubAspect } from './pubsub.aspect';
import { Callback } from './types';

type ParentMethods = {
  pub: (topic: string, event: BitBaseEvent<any>) => Promise<any>;
};

export class PubsubPreview {
  private _parentPubsub?: ParentMethods;
  private events = new EventEmitter2();

  public sub(topic: string, callback: Callback) {
    const emitter = this.events;
    emitter.on(topic, callback);

    const unSub = () => {
      emitter.off(topic, callback);
    };
    return unSub;
  }

  public pub(topic: string, event: BitBaseEvent<any>) {
    this.events.emit(topic, event);
    this._parentPubsub?.pub(topic, event).catch((err) => {
      // eslint-disable-next-line no-console
      console.error('[Pubsub.preview]', err);
    });
  }

  private inIframe() {
    try {
      return isBrowser && window.self !== window.top;
    } catch (e) {
      return false;
    }
  }

  private connectToParentPubSub = (retries = 10): Promise<ParentMethods | undefined> => {
    if (retries <= 0) throw new PubSubNoParentError();

    return connectToParent<ParentMethods>({
      timeout: 300,
      methods: {
        pub: this.handleMessageFromParent,
      },
    })
      .promise.then((parentPubsub) => (this._parentPubsub = parentPubsub))
      .catch((e: any) => {
        if (e.code !== ErrorCode.ConnectionTimeout) throw e;

        return this.connectToParentPubSub(retries - 1);
      });
  };

  private handleMessageFromParent = (topic: string, message: BitBaseEvent<any>) => {
    this.events.emit(topic, message);
  };

  static runtime = PreviewRuntime;

  static async provider(): Promise<PubsubPreview> {
    const pubsubPreview = new PubsubPreview();

    if (pubsubPreview.inIframe()) {
      pubsubPreview.connectToParentPubSub().catch((err) => {
        // parent window is not required to accept connections
        if (err instanceof PubSubNoParentError) return;

        // eslint-disable-next-line no-console
        console.error('[Pubsub.preview]', err);
      });
    }

    return pubsubPreview;
  }
}

PubsubAspect.addRuntime(PubsubPreview);
