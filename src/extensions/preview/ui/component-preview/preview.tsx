import React, { CSSProperties } from 'react';
import { ComponentModel } from '../../../component/ui';

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
};

/**
 * renders a preview of a component.
 */
export function ComponentPreview({ component, style, previewName, queryParams }: ComponentPreviewProps) {
  const serverUrl = `http://localhost:4001/${component.id.fullName}/@/preview`;

  const url = `${(component.server && component.server.url) || serverUrl}/#${component.id.fullName}${
    `?preview=${previewName}&${queryParams && queryParams}` || ''
  }`;

  return <iframe style={style} src={url} />;
}
