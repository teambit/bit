import React, { IframeHTMLAttributes } from 'react';
import { ComponentModel } from '@teambit/component';
import { usePubSubIframe } from '@teambit/pubsub';

import { toPreviewUrl } from './urls';
import useIframeContentHeight from './use-iframe-content-height';

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
  pubsub = true,
  fullContentHeight = false,
  style,
  ...rest
}: ComponentPreviewProps) {
  const [iframeRef, iframeHeight] = useIframeContentHeight({ skip: !fullContentHeight });
  // @ts-ignore (https://github.com/frenic/csstype/issues/156)
  const height = iframeHeight || style?.height;
  usePubSubIframe(pubsub ? iframeRef : undefined);

  const url = toPreviewUrl(component, previewName, queryParams);

  return <iframe {...rest} ref={iframeRef} style={{ ...style, height }} src={url} />;
}
