import { UIRuntime, UIAspect, UiUI } from '@teambit/ui';
import { EventEmitter2 } from 'eventemitter2';
import { connectToChild } from 'penpal';
import type { AsyncMethodReturns } from 'penpal/lib/types';
import { BitBaseEvent } from './bit-base-event';
import { PubsubAspect } from './pubsub.aspect';
import { createProvider } from './pubsub-context';
import { Callback } from './types';

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
  public pub = (topic: string, event: BitBaseEvent<any>) => {
    this.events.emit(topic, event);
  };

  private connectToIframe = (iframe: HTMLIFrameElement) => {
    const connection = connectToChild<ChildMethods>({
      iframe,
      methods: {
        pub: this.pub,
      },
    });

    // absorb valid errors like 'connection destroyed'
    connection.promise.then((childConnection) => (this.childApi = childConnection)).catch(() => {});

    const destroy = () => {
      connection && connection.destroy();
    };
    return destroy;
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

PubsubAspect.addRuntime(PubsubUI);
