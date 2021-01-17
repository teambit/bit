import { ComponentModel } from '@teambit/component';
import { usePubSubIframe } from '@teambit/pubsub';
import React, { CSSProperties, createRef, useEffect } from 'react';

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
  hotReload: boolean;
};

/**
 * renders a preview of a component.
 */
export function ComponentPreview({ component, style, previewName, queryParams }: ComponentPreviewProps) {
  const ref = createRef<HTMLIFrameElement>();
  usePubSubIframe(ref);

  const serverUrl = `/api/${component.id.toString()}/~aspect/preview`;
  // const compWithVersion = component.id.version !== 'latest' ? `${component.id.fullName}@${component.id.version}`: component.id.fullName;

  const url = `${(component.server && component.server.url) || serverUrl}/#${component.id.toString()}${
    `?preview=${previewName}&${queryParams && queryParams}` || ''
  }`;

  return <iframe ref={ref} style={style} src={url} />;
}

ComponentPreview.defaultProps = {
  hotReload: true,
};
