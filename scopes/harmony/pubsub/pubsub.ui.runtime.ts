import { UIRuntime } from '@teambit/harmony.modules.runtimes';
import { EventEmitter2 } from 'eventemitter2';
import { connectToChild } from 'penpal';
import type { AsyncMethodReturns } from 'penpal/lib/types';
import type { BitBaseEvent } from './bit-base-event';
import { ClickInsideAnIframeEvent } from './click-inside-an-iframe';
import { PubsubAspect } from './pubsub.aspect';
import { createProvider } from './pubsub-context';
import type { Callback } from './types';

type PubOptions = {
  /** forward the event to adjacent windows (including the preview iframe)  */
  propagate?: boolean;
};

type ChildMethods = {
  pub: (topic: string, event: BitBaseEvent<any>) => any;
};
export class PubsubUI {
  private childApi?: AsyncMethodReturns<ChildMethods>;
  private events = new EventEmitter2();

  /**
   * subscribe to events
   */
  public sub = (topic: string, callback: Callback) => {
    const events = this.events;
    events.on(topic, callback);

    const unSub = () => {
      events.off(topic, callback);
    };

    return unSub;
  };

  /**
   * publish event to all subscribers, including nested iframes.
   */
  public pub = (topic: string, event: BitBaseEvent<any>, { propagate }: PubOptions = {}) => {
    this.emitEvent(topic, event);

    // opt-in to forward to iframe, as we would not want 'private' messages automatically passing to iframe
    if (propagate) {
      this.pubToChild(topic, event);
    }
  };

  private connectToIframe = (iframe: HTMLIFrameElement) => {
    const connection = connectToChild<ChildMethods>({
      iframe,
      methods: {
        pub: this.emitChildEvent,
      },
    });

    connection.promise
      .then((childConnection) => (this.childApi = childConnection))
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.error('[Pubsub.ui]', 'failed connecting to child iframe:', err);
      });

    const destroy = () => {
      connection && connection.destroy();
    };
    return destroy;
  };

  getPubSubContext() {
    return createProvider({
      connect: this.connectToIframe,
    });
  }

  /**
   * publish event to all subscribers in this window
   */
  private emitEvent = (topic: string, event: BitBaseEvent<any>) => {
    this.events.emit(topic, event);
  };

  /**
   * publish an event coming from a nested iframe.
   * a click inside the iframe doesn't reach this window, so it's re-dispatched here as a mousedown (e.g. to close open menus).
   */
  private emitChildEvent = (topic: string, event: BitBaseEvent<any>) => {
    this.emitEvent(topic, event);
    if (event.type === ClickInsideAnIframeEvent.TYPE) {
      document.body?.dispatchEvent(new MouseEvent('mousedown', { view: window, bubbles: true, cancelable: true }));
    }
  };

  /**
   * publish event to nested iframes
   */
  private pubToChild = (topic: string, event: BitBaseEvent<any>) => {
    return this.childApi?.pub(topic, event);
  };

  static runtime = UIRuntime;
  static dependencies = [];

  static async provider() {
    return new PubsubUI();
  }
}

PubsubAspect.addRuntime(PubsubUI);
