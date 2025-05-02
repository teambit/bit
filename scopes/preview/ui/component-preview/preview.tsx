/* eslint-disable complexity */
import React, { IframeHTMLAttributes, useState, useRef, useEffect } from 'react';
import classNames from 'classnames';
import { compact } from 'lodash';
import { connectToChild } from 'penpal';
import { usePubSubIframe } from '@teambit/pubsub';
import { ComponentModel } from '@teambit/component';
import { ERROR_EVENT, LOAD_EVENT } from '@teambit/ui-foundation.ui.rendering.html';
import { toPreviewUrl } from './urls';
import { computePreviewScale } from './compute-preview-scale';
import { useIframeContentHeight } from './use-iframe-content-height';
import styles from './preview.module.scss';

export type OnPreviewLoadProps = { height?: string; width?: string };
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
  onLoad?: (event?: any, props?: OnPreviewLoadProps) => void;

  /**
   * establish a pubsub connection to the iframe,
   * allowing sending and receiving messages
   */
  pubsub?: boolean;

  /**
   * class name to override preview style.
   */
  className?: string;

  disableScroll?: boolean;

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

  includeEnv?: boolean;

  /**
   * is preview being rendered in full height and should fit view height to content.
   */
  fullContentHeight?: boolean;

  /**
   * propagate error to the parent window from the iframe
   */
  propagateError?: boolean;

  /**
   * custom error handler for preview errors
   */
  onPreviewError?: (errorData: any) => void;
}

/**
 * renders a preview of a component.
 */
export function ComponentPreview({
  component,
  previewName,
  className,
  forceHeight,
  includeEnv = true,
  queryParams,
  disableScroll = false,
  pubsub,
  innerBottomPadding = 0,
  // fitView = 1280,
  viewport = 1280,
  fullContentHeight = false,
  onLoad,
  style,
  sandbox,
  propagateError,
  onPreviewError,
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
    const handleMessage = (event) => {
      if ((event.data && event.data.event === LOAD_EVENT) ||
        (event.data && event.data.event === 'webpackInvalid')
      ) {
        onLoad && onLoad(event);
      }

      if (event.data && (event.data.event === ERROR_EVENT || event.data.event === 'AI_FIX_REQUEST')) {
        const errorData = event.data.payload;
        onPreviewError?.(errorData)

        if (propagateError && window.parent && window !== window.parent) {
          try {
            window.parent.postMessage({
              event: event.data.event,
              payload: {
                ...errorData,
                forwardedFrom: {
                  component: component.id,
                  preview: previewName,
                }
              }
            }, '*');
          } catch (err) {
            // eslint-disable-next-line no-console
            console.error('failed to propagate error to parent', err);
          }
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [component.id.toString(), onLoad, propagateError, onPreviewError]);

  useEffect(() => {
    if (!iframeRef.current) return;
    connectToChild({
      iframe: iframeRef.current,
      methods: {
        pub: (event, message) => {
          if (message.type === 'preview-size') {
            // disable this for now until we figure out how to correctly calculate the height
            // const previewHeight = component.preview?.onlyOverview ? message.data.height - 150 : message.data.height;
            setWidth(message.data.width);
            // setHeight(previewHeight);
            setHeight(message.data.height);
          }
          onLoad && event && onLoad(event, { height: message.data.height, width: message.data.width });
        },
      },
    });
  }, [iframeRef?.current]);

  const params = Array.isArray(queryParams)
    ? queryParams.concat(`viewport=${viewport}`)
    : compact([queryParams, `viewport=${viewport}`]);

  const targetParams = viewport === null ? queryParams : params;
  const url = toPreviewUrl(component, previewName, isScaling ? targetParams : queryParams, includeEnv);
  // const currentHeight = fullContentHeight ? '100%' : height || 1024;
  const containerWidth = containerRef.current?.offsetWidth || 0;
  const containerHeight = containerRef.current?.offsetHeight || 0;
  const currentWidth = fullContentHeight ? '100%' : width || 1280;
  const legacyCurrentWidth = '100%';
  const targetWidth = typeof currentWidth === 'string' ? currentWidth : Math.max(currentWidth, containerWidth);
  const targetHeight = height !== 0 ? height : 5000;
  const finalHeight = !fullContentHeight && targetHeight < containerHeight ? containerHeight : targetHeight;
  const defaultLegacyHeight = forceHeight || 5000;
  const legacyIframeHeight = (iframeHeight || 0) > 400 ? iframeHeight : defaultLegacyHeight;

  return (
    <div ref={containerRef} className={classNames(styles.preview, className)} style={{ height: forceHeight }}>
      <iframe
        {...rest}
        sandbox={sandbox || undefined}
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
        scrolling={disableScroll ? 'no' : undefined}
      />
    </div>
  );
}
