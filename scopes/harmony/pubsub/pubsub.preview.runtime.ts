/**
 * Please Notice: This file will run in the preview iframe.
 */

import { PreviewRuntime } from '@teambit/preview';
import { isBrowser } from '@teambit/ui-foundation.ui.is-browser';

import { EventEmitter2 } from 'eventemitter2';
import { connectToParent, ErrorCode } from 'penpal';

import type { BitBaseEvent } from './bit-base-event';
import { PubSubNoParentError } from './no-parent-error';
import { PubsubAspect } from './pubsub.aspect';
import type { Callback } from './types';

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
    } catch {
      return false;
    }
  }

  /**
   * A pooled grid thumbnail realm (hash carries `thumbnail=true`, set by preview-canvas.ts). Its
   * host creates iframes with raw DOM and never answers the penpal handshake, so connecting would
   * only burn ten 300ms-timeout retries during boot. Size reaches the pool as a plain postMessage
   * (see preview.preview.runtime) and errors via the injected error-reporting script - neither
   * needs this connection. The pool never re-points a realm at a non-thumbnail hash, so skipping
   * the connection for the realm's lifetime is safe.
   */
  private isThumbnailRealm() {
    try {
      if (!isBrowser) return false;
      const [, query = ''] = (window.location.hash || '').slice(1).split('?');
      return new URLSearchParams(query).get('thumbnail') === 'true';
    } catch {
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

    if (pubsubPreview.inIframe() && !pubsubPreview.isThumbnailRealm()) {
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
