/* eslint-disable complexity */
import type { IframeHTMLAttributes } from 'react';
import React, { useState, useRef, useEffect } from 'react';
import classNames from 'classnames';
import { compact } from 'lodash';
import { connectToChild } from 'penpal';
import { usePubSubIframe } from '@teambit/pubsub';
import type { ComponentModel } from '@teambit/component';
import { useThemePicker } from '@teambit/base-react.themes.theme-switcher';
import { ERROR_EVENT, LOAD_EVENT } from '@teambit/ui-foundation.ui.rendering.html';
import { toPreviewUrl } from './urls';
import { computePreviewScale } from './compute-preview-scale';
import { useIframeContentHeight } from './use-iframe-content-height';
import styles from './preview.module.scss';

export type OnPreviewLoadProps = { height?: string; width?: string };

type HeightReport = { iframeHeight: number; height: number };
type ViewportSizedContent = { slope: number; offset: number };

/**
 * detects content sized in viewport units (e.g. sections of 100vh). its height is `slope * iframeHeight + offset`,
 * so with a slope of 1 or more every resize of the iframe makes it taller again and it never fits.
 * requires three reports in a row, each grown after the iframe grew, that fit the same line.
 */
function detectViewportSizedContent([first, second, third]: HeightReport[]): ViewportSizedContent | undefined {
  if (!first || !second || !third) return undefined;
  if (second.iframeHeight <= first.iframeHeight || third.iframeHeight <= second.iframeHeight) return undefined;
  const slope = (second.height - first.height) / (second.iframeHeight - first.iframeHeight);
  const nextSlope = (third.height - second.height) / (third.iframeHeight - second.iframeHeight);
  if (slope < 1 || Math.abs(slope - nextSlope) > slope * 0.01) return undefined;
  return { slope: nextSlope, offset: third.height - nextSlope * third.iframeHeight };
}
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
  const [forceVisible, setForceVisible] = useState(false);
  const heightReportsRef = useRef<HeightReport[]>([]);
  const viewportSizedContentRef = useRef<ViewportSizedContent | undefined>(undefined);
  const connectedIframeRef = useRef<HTMLIFrameElement | null>(null);

  /**
   * the iframe height to apply for a size report, or undefined to keep the current one.
   */
  const heightForReport = (report: HeightReport): number | undefined => {
    const viewportSized = viewportSizedContentRef.current;
    const expectedHeight = viewportSized && viewportSized.slope * report.iframeHeight + viewportSized.offset;
    // the same viewport-sized content reporting the iframe's own height back. following it would grow it again
    if (expectedHeight !== undefined && Math.abs(report.height - expectedHeight) <= 2) return undefined;
    viewportSizedContentRef.current = undefined;
    const reports = [...heightReportsRef.current, report].slice(-3);
    heightReportsRef.current = reports;
    const detected = detectViewportSizedContent(reports);
    if (!detected) return report.height;
    viewportSizedContentRef.current = detected;
    // go back to the height the iframe had before it started growing with its content
    return reports[0].iframeHeight;
  };
  // @ts-ignore (https://github.com/frenic/csstype/issues/156)
  // const height = iframeHeight || style?.height;
  usePubSubIframe(pubsub ? currentRef : undefined);
  // const pubsubContext = usePubSub();
  // pubsubContext?.connect(iframeHeight);

  useEffect(() => {
    const handleMessage = (event) => {
      if ((event.data && event.data.event === LOAD_EVENT) || (event.data && event.data.event === 'webpackInvalid')) {
        onLoad && onLoad(event);
      }

      if (event.data && (event.data.event === ERROR_EVENT || event.data.event === 'AI_FIX_REQUEST')) {
        const errorData = event.data.payload;
        onPreviewError?.(errorData);
        setForceVisible(true);
        if (propagateError && window.parent && window !== window.parent) {
          try {
            window.parent.postMessage(
              {
                event: event.data.event,
                payload: {
                  ...errorData,
                  forwardedFrom: {
                    component: component.id,
                    preview: previewName,
                  },
                },
              },
              '*'
            );
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
    const iframe = iframeRef.current;
    // connect once per iframe. the deps go from null to the iframe after the first render, and a second connection
    // receives every size report again, which the viewport-sized content detection can't tell apart from a new one
    if (!iframe || connectedIframeRef.current === iframe) return;
    connectedIframeRef.current = iframe;
    connectToChild({
      iframe,
      methods: {
        pub: (event, message) => {
          if (message.type === 'preview-size') {
            // disable this for now until we figure out how to correctly calculate the height
            // const previewHeight = component.preview?.onlyOverview ? message.data.height - 150 : message.data.height;
            setWidth(message.data.width);
            // setHeight(previewHeight);
            const nextHeight = heightForReport({
              iframeHeight: iframeRef.current?.offsetHeight || 0,
              height: message.data.height,
            });
            if (nextHeight !== undefined) setHeight(nextHeight);
          }
          onLoad && event && onLoad(event, { height: message.data.height, width: message.data.width });
        },
      },
    });
  }, [iframeRef?.current]);

  const theme = useThemePicker();
  const themeParam = theme?.current?.themeName ? `theme=${theme.current.themeName}` : '';

  const baseParams = Array.isArray(queryParams) ? queryParams.concat(themeParam) : compact([queryParams, themeParam]);

  const paramsWithViewport = Array.isArray(baseParams)
    ? baseParams.concat(`viewport=${viewport}`)
    : compact([baseParams, `viewport=${viewport}`]);

  const targetParams = viewport === null ? baseParams : paramsWithViewport;
  const url = toPreviewUrl(component, previewName, isScaling ? targetParams : baseParams, includeEnv);

  // a new preview in the same iframe is measured from scratch
  useEffect(() => {
    heightReportsRef.current = [];
    viewportSizedContentRef.current = undefined;
  }, [url]);
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
  const isWaitingForSize = width === 0 && isScaling && !fullContentHeight && !forceVisible;

  return (
    <div ref={containerRef} className={classNames(styles.preview, className)} style={{ height: forceHeight }}>
      <iframe
        {...rest}
        sandbox={sandbox || undefined}
        ref={currentRef}
        // keep the invisible iframe out of the tab order, the accessibility tree and pointer events
        inert={isWaitingForSize}
        style={{
          ...style,
          height: forceHeight || (isScaling ? finalHeight + innerBottomPadding : legacyIframeHeight),
          width: isScaling ? targetWidth : legacyCurrentWidth,
          // hide with opacity, not visibility. chrome stops rendering a cross-site iframe with visibility: hidden,
          // so its ResizeObserver never fires and the size report this waits for never arrives.
          opacity: isWaitingForSize ? 0 : undefined,
          transform: fullContentHeight ? '' : computePreviewScale(width || 1280, containerWidth || 1280),
          border: 0,
          transformOrigin: 'top left',
        }}
        src={url}
        scrolling={disableScroll ? 'no' : undefined}
      />
    </div>
  );
}
