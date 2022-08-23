import React, { useRef, useState, useEffect } from 'react';

export function useIframeContentHeight({
  interval = 250,
  skip,
}: {
  interval?: number;
  skip?: boolean;
}): [React.MutableRefObject<HTMLIFrameElement | null>, number | undefined] {
  const iframeRef: React.MutableRefObject<HTMLIFrameElement | null> = useRef(null);
  const [iframeHeight, setIframeHeight] = useState(0);
  if (skip) return [iframeRef, undefined];
  useInterval(() => {
    try {
      const iframe = iframeRef.current;
      // eslint-disable-next-line
      const newHeight = iframe!.contentWindow!.document.body.scrollHeight;
      setIframeHeight(newHeight);
    } catch (_) {
      // eslint-disable-next-line
    }
  }, interval);

  return [iframeRef, iframeHeight];
}

type CallbackFn = () => void;

export function useInterval(callback: CallbackFn, interval: number) {
  const savedCallback = useRef<CallbackFn>(() => callback);

  useEffect(() => {
    savedCallback.current = callback;
  });

  // Set up the interval.
  useEffect(() => {
    function tick() {
      savedCallback.current();
    }
    if (interval !== null) {
      const id = setInterval(tick, interval);
      return () => clearInterval(id);
    }
    // eslint-disable-next-line
    return () => {};
  }, [interval]);
}
