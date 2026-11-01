/**
 * Please Notice: This file will run in the preview iframe.
 */

import { PreviewRuntime } from '@teambit/harmony.modules.runtimes';
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
  /**
   * events published while connecting to the parent. sent once the connection is up, dropped if it fails.
   */
  private pendingEvents?: Array<[string, BitBaseEvent<any>]>;

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
    if (!this._parentPubsub) {
      this.pendingEvents?.push([topic, event]);
      return;
    }
    this.pubToParent(this._parentPubsub, topic, event);
  }

  private pubToParent(parentPubsub: ParentMethods, topic: string, event: BitBaseEvent<any>) {
    parentPubsub.pub(topic, event).catch((err) => {
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

  private connectToParentPubSub = (retries = 10): Promise<ParentMethods | undefined> => {
    if (retries <= 0) throw new PubSubNoParentError();

    return connectToParent<ParentMethods>({
      timeout: 300,
      methods: {
        pub: this.handleMessageFromParent,
      },
    })
      .promise.then((parentPubsub) => {
        this._parentPubsub = parentPubsub;
        const pendingEvents = this.pendingEvents || [];
        this.pendingEvents = undefined;
        pendingEvents.forEach(([topic, event]) => this.pubToParent(parentPubsub, topic, event));
        return parentPubsub;
      })
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
      pubsubPreview.pendingEvents = [];
      pubsubPreview.connectToParentPubSub().catch((err) => {
        pubsubPreview.pendingEvents = undefined;
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
