import React, { CSSProperties, createRef } from 'react';
import { ComponentModel } from '@teambit/component';
import { usePubSubIframe } from '@teambit/pubsub';

import { toPreviewUrl } from './urls';

export type ComponentPreviewProps = {
  /**
   * component to preview.
   */
  component: ComponentModel;

  /**
   * preview name.
   */
  previewName?: string;

  /**
   * preview style.
   */
  style?: CSSProperties;

  /**
   * string in the format of query params. e.g. foo=bar&bar=there
   */
  queryParams?: string;

  /**
   * enable/disable hot reload for the composition preview.
   */
  hotReload?: boolean;
};

/**
 * renders a preview of a component.
 */
export function ComponentPreview({ component, style, previewName, queryParams }: ComponentPreviewProps) {
  const ref = createRef<HTMLIFrameElement>();
  usePubSubIframe(ref);

  const url = toPreviewUrl(component, previewName, queryParams);

  return <iframe ref={ref} style={style} src={url} />;
}

ComponentPreview.defaultProps = {
  hotReload: true,
};
