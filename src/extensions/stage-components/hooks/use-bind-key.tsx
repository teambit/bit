import { useEffect, useRef } from 'react';
import Mousetrap from 'mousetrap';

/** binds a global key to a handler */
export function useKeyBind(
  /** the key to bind to */
  key: string | string[],
  /** key handler */
  handler: (e: ExtendedKeyboardEvent, combo: string) => any,
  /** enable/disable binding */
  when: boolean = true
) {
  const { current: mousetrap } = useRef(new Mousetrap());

  useEffect(() => {
    if (when) {
      mousetrap.bind(key, handler);
    }

    return () => {
      mousetrap.reset();
    };
  }, [handler, when]);
}
