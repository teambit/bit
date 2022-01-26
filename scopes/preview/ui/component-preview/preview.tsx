import React, { useRef, IframeHTMLAttributes, useEffect, useState } from 'react';
import { ComponentModel } from '@teambit/component';
import { usePubSubIframe } from '@teambit/pubsub';

import { toPreviewUrl } from './urls';

// omitting 'referrerPolicy' because of an TS error during build. Re-include when needed
export interface ComponentPreviewProps extends Omit<IframeHTMLAttributes<HTMLIFrameElement>, 'src' | 'referrerPolicy'> {
  /**
   * component to preview.
   */
  component: ComponentModel;

  /**
   * preview name.
   */
  previewName?: string;

  /**
   * query params to append at the end of the *hash*. Changing this property will not reload the preview
   *
   * e.g. 'foo=bar&bar=there', or ['foo=bar', 'bar=there']
   */
  queryParams?: string | string[];

  /**
   * enable/disable hot reload for the composition preview.
   */
  hotReload?: boolean;

  /**
   * is preview being rendered in full height and should fit view height to content.
   */
  fullContentHeight?: boolean;
}

/**
 * renders a preview of a component.
 */
// TODO - Kutner fix unused var - 'hotReload' should be used
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function ComponentPreview({
  component,
  previewName,
  queryParams,
  fullContentHeight = false,
  ...rest
}: ComponentPreviewProps) {
  const [iframeRef, iframeHeight] = useIframeContentHeight({ skip: !fullContentHeight });
  usePubSubIframe(iframeRef);

  const url = toPreviewUrl(component, previewName, queryParams);
  return (
    <iframe {...rest} ref={iframeRef} style={{ ...rest.style, height: iframeHeight || rest.style?.height }} src={url} />
  );
}

ComponentPreview.defaultProps = {
  hotReload: true,
};

type CallbackFn = () => void;

function useInterval(callback: CallbackFn, interval: number) {
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
    return;
  }, [interval]);
}

export default function useIframeContentHeight({
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
