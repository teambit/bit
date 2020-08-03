import { useEffect, useRef } from 'react';
import Mousetrap from 'mousetrap';

export function bindKey(
  key: string | string[],
  handler: (e: ExtendedKeyboardEvent, combo: string) => any,
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
