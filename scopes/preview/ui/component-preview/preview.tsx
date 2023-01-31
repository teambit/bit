import React, { IframeHTMLAttributes, useState, useRef, useEffect } from 'react';
import classNames from 'classnames';
import { compact } from 'lodash';
import { connectToChild } from 'penpal';
import { usePubSubIframe } from '@teambit/pubsub';
import { ComponentModel } from '@teambit/component';
import { toPreviewUrl } from './urls';
import { computePreviewScale } from './compute-preview-scale';
import { useIframeContentHeight } from './use-iframe-content-height';
import styles from './preview.module.scss';

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
   * add inner padding to the iframe.
   */
   innerBottomPadding?: number;

  /**
   * query params to append at the end of the *hash*. Changing this property will not reload the preview
   *
   * e.g. 'foo=bar&bar=there', or ['foo=bar', 'bar=there']
   */
  queryParams?: string | string[];

  /**
   * event to be fired when iframe loads
   */
  onLoad?: () => void;

  /**
   * establish a pubsub connection to the iframe,
   * allowing sending and receiving messages
   */
  pubsub?: boolean;

  /**
   * class name to override preview style.
   */
  className?: string;

  /**
   * set specific height for the iframe.
   */
  forceHeight?: number | string;

  /**
   * fit the preview to a specific width.
   */
  fitView?: boolean;

  /**
   * viewport
   */
  viewport?: number | null;

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
  className,
  forceHeight,
  queryParams,
  pubsub,
  innerBottomPadding = 0,
  // fitView = 1280,
  viewport = 1280,
  fullContentHeight = false,
  onLoad,
  style,
  ...rest
}: ComponentPreviewProps) {
  const [heightIframeRef, iframeHeight] = useIframeContentHeight({ skip: false, viewport });
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [width, setWidth] = useState(0);
  const [height, setHeight] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const isScaling = component.preview?.isScaling;
  const currentRef = isScaling ? iframeRef : heightIframeRef;
  // @ts-ignore (https://github.com/frenic/csstype/issues/156)
  // const height = iframeHeight || style?.height;
  usePubSubIframe(pubsub ? currentRef : undefined);
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
          (onLoad && event) && onLoad();
        },
      },
    });
  }, [iframeRef?.current]);

  const params = Array.isArray(queryParams)
    ? queryParams.concat(`viewport=${viewport}`)
    : compact([queryParams, `viewport=${viewport}`]);

  const targetParams = viewport === null ? queryParams : params;
  const url = toPreviewUrl(component, previewName, isScaling ? targetParams : queryParams);
  // const currentHeight = fullContentHeight ? '100%' : height || 1024;
  const containerWidth = containerRef.current?.offsetWidth || 0;
  const containerHeight = containerRef.current?.offsetHeight || 0;
  const currentWidth = fullContentHeight ? '100%' : (width || 1280) + 100;
  const legacyCurrentWidth = '100%';
  const targetWidth = currentWidth < containerWidth ? containerWidth : currentWidth;
  const targetHeight = height !== 0 ? height : 5000;
  const finalHeight = !fullContentHeight && targetHeight < containerHeight ? containerHeight : targetHeight;
  const defaultLegacyHeight = forceHeight || 5000;
  const legacyIframeHeight = (iframeHeight || 0) > 400 ? iframeHeight : defaultLegacyHeight;

  return (
    <div ref={containerRef} className={classNames(styles.preview, className)} style={{ height: forceHeight }}>
      <iframe
        {...rest}
        ref={currentRef}
        style={{
          ...style,
          height: forceHeight || (isScaling ? finalHeight + innerBottomPadding : legacyIframeHeight),
          width: isScaling ? targetWidth : legacyCurrentWidth,
          visibility: width === 0 && isScaling && !fullContentHeight ? 'hidden' : undefined,
          transform: fullContentHeight ? '' : computePreviewScale(width, containerWidth),
          border: 0,
          transformOrigin: 'top left',
        }}
        src={url}
      />
    </div>
  );
}
