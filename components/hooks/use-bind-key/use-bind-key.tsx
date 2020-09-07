import { useEffect, useRef } from 'react';
import Mousetrap, { ExtendedKeyboardEvent } from 'mousetrap';

/** binds a global key to a handler */
export function useKeyBind(
  /** the key to bind to */
  key: string | string[],
  /** key handler */
  handler: (e: ExtendedKeyboardEvent, combo: string) => any,
  /** enable/disable binding */
  enable = true
) {
  const { current: mousetrap } = useRef(new Mousetrap());

  useEffect(() => {
    if (enable) {
      mousetrap.bind(key, handler);
    }

    return () => {
      mousetrap.reset();
    };
  }, [handler, enable]);
}
