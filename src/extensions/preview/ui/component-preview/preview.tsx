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
  // TODO - fix this - this is to not break the app when these props are undefined
  if (!component?.server?.url) return null;
  if (!component?.id?.fullName) return null;
  const url = `${component.server.url}/#${component.id.fullName}${`?preview=${previewName}&${queryParams &&
    queryParams}` || ''}`;

  return <iframe style={style} src={url} />;
}
