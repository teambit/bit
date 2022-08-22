import React, { IframeHTMLAttributes, useState, useRef, useEffect } from 'react';
import { connectToChild } from 'penpal';
import { ComponentModel } from '@teambit/component';
import { toPreviewUrl } from './urls';
import { computePreviewScale } from './compute-preview-scale';
import { compact } from 'lodash';

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
   * establish a pubsub connection to the iframe,
   * allowing sending and receiving messages
   */
  pubsub?: boolean;

  /**
   * fit the preview to a specific width.
   */
  fitView?: boolean;

  /**
   * is preview being rendered in full height and should fit view height to content.
   */
  fullContentHeight?: boolean;
}

/**
 * renders a preview of a component.
 */
export function ComponentPreview({
  component,
  previewName,
  queryParams,
  // pubsub = true,
  fullContentHeight = false,
  style,
  ...rest
}: ComponentPreviewProps) {
  // const [iframeRef, iframeHeight] = useIframeContentHeight({ skip: !fullContentHeight });
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [width, setWidth] = useState(0);
  const [height, setHeight] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  // @ts-ignore (https://github.com/frenic/csstype/issues/156)
  // const height = iframeHeight || style?.height;
  // usePubSubIframe(pubsub ? iframeRef : undefined);
  // const pubsubContext = usePubSub();
  // pubsubContext?.connect(iframeHeight);
  useEffect(() => {
    if (!iframeRef.current) return;
    connectToChild({
      iframe: iframeRef.current,
      methods: {
        pub: (event, message) => {
          if (message.type === 'preview-size') {
            setWidth(message.data.width);
            setHeight(message.data.height);
          }
        },
      },
    });
  });
  // usePubSubIframe(iframeRef);

  const params = Array.isArray(queryParams)
    ? queryParams.concat('viewport=1280')
    : compact([queryParams, 'viewport=1280']);
  const url = toPreviewUrl(component, previewName, params);
  // const currentHeight = fullContentHeight ? '100%' : height || 1024;
  const containerWidth = containerRef.current?.offsetWidth || 0;
  const currentWidth = fullContentHeight ? '100%' : width || 1280;

  return (
    <div ref={containerRef}>
      <iframe
        {...rest}
        ref={iframeRef}
        style={{
          ...style,
          height: height !== 0 ? height : 5000,
          width: currentWidth < containerWidth ? containerWidth : currentWidth,
          transform: fullContentHeight ? '' : computePreviewScale(width, containerWidth),
          transformOrigin: 'top left',
        }}
        src={url}
      />
    </div>
  );
}
