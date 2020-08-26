import { ComponentModel } from '@teambit/component';
import { queryString } from '@teambit/toolbox.query-string';
import React, { CSSProperties } from 'react';

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
export function ComponentPreview({ component, style, previewName, queryParams, hotReload }: ComponentPreviewProps) {
  const serverUrl = `/api/${component.id.fullName}/@/preview`;
  const host = (component.server && component.server.url) || serverUrl;
  const qs = queryString({
    hot: hotReload.toString(),
  });

  const url = `${host}?${qs}#${component.id.fullName}${`?preview=${previewName}&${queryParams && queryParams}` || ''}`;

  return <iframe style={style} src={url} />;
}

ComponentPreview.defaultProps = {
  hotReload: true,
};
