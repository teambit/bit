import { createContext, useContext, useEffect, RefObject } from 'react';

export interface PubSubRegistry {
  /**
   * starts a connection to an iframe child.
   * Returns a destroy() function that will break the connection.
   */
  connect(ref: HTMLIFrameElement): () => void;
}

export const pubsubRegistry = createContext<PubSubRegistry | undefined>(undefined);

export function usePubSub() {
  return useContext(pubsubRegistry);
}

export function usePubSubIframe(ref: RefObject<HTMLIFrameElement>) {
  const pubSub = usePubSub();

  useEffect(() => {
    if (!ref.current || !pubSub) return () => {};

    const destroyConnection = pubSub.connect(ref.current);
    return destroyConnection;
  }, [ref.current, pubSub]);
}
