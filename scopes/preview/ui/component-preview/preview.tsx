import React, { CSSProperties, createRef } from 'react';
import { ComponentModel } from '@teambit/component';
import { usePubSubIframe } from '@teambit/pubsub';

import { toPreviewUrl } from './urls';

export interface ComponentPreviewProps extends Omit<React.IframeHTMLAttributes<HTMLIFrameElement>, 'src'> {
  /**
   * component to preview.
   */
  component: ComponentModel;

  /**
   * preview name.
   */
  previewName?: string;

  /**
   * string in the format of query params. e.g. foo=bar&bar=there
   */
  queryParams?: string;

  /**
   * enable/disable hot reload for the composition preview.
   */
  hotReload?: boolean;
}

/**
 * renders a preview of a component.
 */
export function ComponentPreview({ component, previewName, queryParams, hotReload, ...rest }: ComponentPreviewProps) {
  const ref = createRef<HTMLIFrameElement>();
  usePubSubIframe(ref);

  const url = toPreviewUrl(component, previewName, queryParams);

  return <iframe {...rest} ref={ref} src={url} />;
}

ComponentPreview.defaultProps = {
  hotReload: true,
};
