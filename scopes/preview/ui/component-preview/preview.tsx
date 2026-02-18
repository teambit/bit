/* eslint-disable complexity */
import type { IframeHTMLAttributes } from 'react';
import React, { useState, useRef, useEffect } from 'react';
import classNames from 'classnames';
import { compact } from 'lodash';
import { connectToChild } from 'penpal';
import { usePubSubIframe } from '@teambit/pubsub';
import type { ComponentModel } from '@teambit/component';
import { ERROR_EVENT, LOAD_EVENT } from '@teambit/ui-foundation.ui.rendering.html';
import { toPreviewUrl } from './urls';
import { computePreviewScale } from './compute-preview-scale';
import { useIframeContentHeight } from './use-iframe-content-height';
import styles from './preview.module.scss';

const CONNECTION_STATUS_EVENT = 'bit-dev-server-connection-status';
const PREVIEW_SRCDOC_SKELETON = `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0;height:100%;background:#fff;font:13px system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#667085}.chrome{height:24px;border-bottom:1px solid #ececec;background:#fafafa}.body{padding:10px}.bar{height:10px;border-radius:6px;background:linear-gradient(90deg,#f0f0f0 25%,#e3e3e3 50%,#f0f0f0 75%);background-size:200% 100%;animation:s 1.2s ease-in-out infinite;margin-bottom:8px}@keyframes s{from{background-position:200% 0}to{background-position:-200% 0}}</style></head><body><div class="chrome"></div><div class="body"><div class="bar" style="width:62%"></div><div class="bar" style="width:44%"></div><div class="bar" style="width:74%"></div></div></body></html>`;
const MAX_AUTO_RETRIES = 4;
const RETRY_BASE_MS = 1400;

function reportConnectionStatus(
  online: boolean,
  reason?: 'preview' | 'network',
  options?: { previewKey?: string; previewEnvId?: string }
) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent(CONNECTION_STATUS_EVENT, {
      detail: {
        online,
        reason,
        previewKey: options?.previewKey,
        previewEnvId: options?.previewEnvId,
        timestamp: Date.now(),
      },
    })
  );
}

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
  const [forceVisible, setForceVisible] = useState(false);
  const [isPreviewReady, setIsPreviewReady] = useState(false);
  const [showSlowMessage, setShowSlowMessage] = useState(false);
  const [scheduledSrc, setScheduledSrc] = useState<string | undefined>(undefined);
  const [retryNonce, setRetryNonce] = useState(0);
  const navRafRef = useRef<number | undefined>(undefined);
  const retryTimerRef = useRef<number | undefined>(undefined);
  const retryCountRef = useRef(0);
  const componentId = component.id.toString();
  const previewKey = `${component.id.toString()}:${previewName || 'overview'}`;
  const previewEnvId = component.server?.env || component.environment?.id;
  const hasLoadedOnceRef = useRef(false);
  const prevComponentIdRef = useRef(componentId);
  // @ts-ignore (https://github.com/frenic/csstype/issues/156)
  // const height = iframeHeight || style?.height;
  usePubSubIframe(pubsub ? currentRef : undefined);
  // const pubsubContext = usePubSub();
  // pubsubContext?.connect(iframeHeight);

  const getCurrentIframeWindow = () => {
    const iframeElement = (currentRef as React.MutableRefObject<HTMLIFrameElement | null>)?.current;
    return iframeElement?.contentWindow;
  };

  useEffect(() => {
    let isMounted = true;
    const handleMessage = (event) => {
      if (!isMounted) return;
      const iframeWindow = getCurrentIframeWindow();
      if (iframeWindow && event.source !== iframeWindow) return;
      if ((event.data && event.data.event === LOAD_EVENT) || (event.data && event.data.event === 'webpackInvalid')) {
        if (event.data.event === LOAD_EVENT) {
          reportConnectionStatus(true, 'preview', { previewKey, previewEnvId });
          hasLoadedOnceRef.current = true;
          setIsPreviewReady(true);
        } else {
          // Preview bundle is rebuilding; not a main dev-server offline condition.
          reportConnectionStatus(false, 'preview', { previewKey, previewEnvId });
          setIsPreviewReady(false);
        }
        onLoad && onLoad(event);
      }

      if (event.data && (event.data.event === ERROR_EVENT || event.data.event === 'AI_FIX_REQUEST')) {
        reportConnectionStatus(false, 'preview', { previewKey, previewEnvId });
        const errorData = event.data.payload;
        onPreviewError?.(errorData);
        // Keep skeleton visible for offline/restart paths; avoid exposing raw
        // fallback iframe responses (blank/black/offline text) as "ready" UI.
        setIsPreviewReady(false);
        setShowSlowMessage(true);
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
      isMounted = false;
      window.removeEventListener('message', handleMessage);
    };
  }, [componentId, onLoad, previewKey, previewEnvId, propagateError, onPreviewError]);

  useEffect(() => {
    const iframeElement = iframeRef.current;
    if (!iframeElement) return;
    let isMounted = true;
    const connection = connectToChild({
      iframe: iframeElement,
      methods: {
        pub: (event, message) => {
          if (!isMounted) return;
          if (message.type === 'preview-size') {
            // disable this for now until we figure out how to correctly calculate the height
            // const previewHeight = component.preview?.onlyOverview ? message.data.height - 150 : message.data.height;
            setWidth(message.data.width);
            // setHeight(previewHeight);
            setHeight(message.data.height);
            hasLoadedOnceRef.current = true;
            setIsPreviewReady(true);
          }
          onLoad && event && onLoad(event, { height: message.data.height, width: message.data.width });
        },
      },
    });
    return () => {
      isMounted = false;
      connection.destroy();
    };
  }, [iframeRef]);

  const params = Array.isArray(queryParams)
    ? queryParams.concat(`viewport=${viewport}`)
    : compact([queryParams, `viewport=${viewport}`]);

  const targetParams = viewport === null ? queryParams : params;
  const url = toPreviewUrl(component, previewName, isScaling ? targetParams : queryParams, includeEnv);
  const srcWithRetryNonce =
    retryNonce > 0 ? `${url}${url.includes('?') ? '&' : '?'}bitPreviewRetry=${retryNonce}` : url;
  const isServerCompiling = (component.server as { isCompiling?: boolean } | undefined)?.isCompiling === true;

  const clearNavSchedule = () => {
    if (navRafRef.current) {
      window.cancelAnimationFrame(navRafRef.current);
      navRafRef.current = undefined;
    }
  };
  const clearRetryTimer = () => {
    if (!retryTimerRef.current) return;
    window.clearTimeout(retryTimerRef.current);
    retryTimerRef.current = undefined;
  };

  useEffect(() => {
    const componentChanged = prevComponentIdRef.current !== componentId;
    prevComponentIdRef.current = componentId;
    if (componentChanged) {
      hasLoadedOnceRef.current = false;
      retryCountRef.current = 0;
      setRetryNonce(0);
    }

    setForceVisible(false);
    if (componentChanged || !hasLoadedOnceRef.current) {
      setIsPreviewReady(false);
    }
    setShowSlowMessage(false);
    reportConnectionStatus(false, 'preview', { previewKey, previewEnvId });
  }, [componentId, previewKey, previewEnvId, url]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      setScheduledSrc(srcWithRetryNonce);
      return;
    }

    clearNavSchedule();
    navRafRef.current = window.requestAnimationFrame(() => {
      setScheduledSrc((current) => (current === srcWithRetryNonce ? current : srcWithRetryNonce));
    });

    return () => {
      clearNavSchedule();
    };
  }, [srcWithRetryNonce]);

  // If the preview loaded while the dev server was still spinning up, it can get
  // stuck on an offline/error response. Retry navigation a few times once the
  // server reports it is no longer compiling.
  useEffect(() => {
    clearRetryTimer();
    if (typeof window === 'undefined') return undefined;
    if (isPreviewReady) {
      retryCountRef.current = 0;
      return undefined;
    }
    if (!component.server?.url || isServerCompiling) return undefined;
    if (retryCountRef.current >= MAX_AUTO_RETRIES) return undefined;

    const attempt = retryCountRef.current + 1;
    const delay = RETRY_BASE_MS + attempt * 600;
    retryTimerRef.current = window.setTimeout(() => {
      retryCountRef.current = attempt;
      setRetryNonce((value) => value + 1);
    }, delay);

    return () => {
      clearRetryTimer();
    };
  }, [component.server?.url, isServerCompiling, isPreviewReady]);

  useEffect(() => {
    if (isPreviewReady) return undefined;
    const timeout = window.setTimeout(() => setShowSlowMessage(true), 2200);
    return () => window.clearTimeout(timeout);
  }, [isPreviewReady, url]);

  useEffect(() => {
    return () => {
      clearRetryTimer();
    };
  }, []);

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
      {!isPreviewReady && (
        <div className={styles.loadingPlaceholder} aria-hidden>
          <div className={styles.loadingShimmer}>
            <div className={styles.loadingChrome}>
              <div className={styles.loadingDot} />
              <div className={styles.loadingDot} />
              <div className={styles.loadingDot} />
            </div>
            <div className={styles.loadingCanvas}>
              <div className={styles.loadingBar} style={{ width: '62%' }} />
              <div className={styles.loadingBar} style={{ width: '44%' }} />
              <div className={styles.loadingBar} style={{ width: '74%' }} />
            </div>
            <div className={styles.loadingCaption}>
              {showSlowMessage ? 'Preview is waiting for the dev server.' : 'Loading preview bundle...'}
            </div>
          </div>
        </div>
      )}
      <iframe
        {...rest}
        className={classNames(styles.previewFrame, isPreviewReady && styles.previewFrameReady)}
        sandbox={sandbox || undefined}
        ref={currentRef}
        onLoad={(event) => {
          onLoad && onLoad(event);
        }}
        style={{
          ...style,
          height: forceHeight || (isScaling ? finalHeight + innerBottomPadding : legacyIframeHeight),
          width: isScaling ? targetWidth : legacyCurrentWidth,
          visibility: width === 0 && isScaling && !fullContentHeight && !forceVisible ? 'hidden' : undefined,
          transform: fullContentHeight ? '' : computePreviewScale(width || 1280, containerWidth || 1280),
          border: 0,
          transformOrigin: 'top left',
        }}
        src={scheduledSrc}
        srcDoc={!scheduledSrc ? PREVIEW_SRCDOC_SKELETON : undefined}
        scrolling={disableScroll ? 'no' : undefined}
      />
    </div>
  );
}
