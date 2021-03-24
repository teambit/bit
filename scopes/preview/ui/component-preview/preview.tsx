import React, { createRef, IframeHTMLAttributes } from 'react';
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
}

/**
 * renders a preview of a component.
 */
// TODO - Kutner fix unused var - 'hotReload' should be used
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function ComponentPreview({ component, previewName, queryParams, hotReload, ...rest }: ComponentPreviewProps) {
  const ref = createRef<HTMLIFrameElement>();
  usePubSubIframe(ref);

  const url = toPreviewUrl(component, previewName, queryParams);

  return <iframe {...rest} ref={ref} src={url} />;
}

ComponentPreview.defaultProps = {
  hotReload: true,
};
