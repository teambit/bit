import React, { useRef, useState, useEffect } from 'react';

export function useIframeContentHeight({
  interval = 250,
  skip,
  viewport
}: {
  interval?: number;
  skip?: boolean;
  viewport?: number|null
}): [React.MutableRefObject<HTMLIFrameElement | null>, number | undefined, number] {
  const iframeRef: React.MutableRefObject<HTMLIFrameElement | null> = useRef(null);
  const [iframeHeight, setIframeHeight] = useState(0);
  const [iframeWidth, setIframeWidth] = useState(0);
  if (skip) return [iframeRef, undefined, iframeWidth];
  let first = true;
  useInterval(() => {
    try {
      const iframe = iframeRef.current;
      // eslint-disable-next-line
      if (viewport !== null) iframe!.contentWindow!.document.body.style.width = 'fit-content';
      if (!first && iframe?.style.height === '5000px') {
        iframe.style.height = '100%';
      }
      const newHeight = iframe!.contentWindow!.document.body.scrollHeight;
      const newWidth = iframe?.contentWindow?.document.body.offsetWidth;
      setIframeHeight(newHeight);
      setIframeWidth(newWidth || 0);
      first = false;
    } catch (_) {
      // eslint-disable-next-line
    }
  }, interval);

  return [iframeRef, iframeHeight, iframeWidth];
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
