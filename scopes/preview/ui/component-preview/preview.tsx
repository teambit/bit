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
