import React from 'react';
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
   * string in the format of query params. e.g. foo=bar&bar=there
   */
  queryParams?: string;
} & React.IframeHTMLAttributes<HTMLIFrameElement>;

/**
 * renders a preview of a component.
 */
export function ComponentPreview({ component, previewName, queryParams, ...rest }: ComponentPreviewProps) {
  const query = [optional('preview=', previewName), queryParams].filter((x) => !!x).join('&');
  const hash = component.id.fullName + optional('?', query);
  const path = component.server.url;

  return <iframe {...rest} src={`${path}/#${hash}`} />;
}

// aka - bit.utils/string/optional
function optional(prefix = '', str?: string, suffix = '') {
  if (!str) return '';

  return `${prefix}${str}${suffix}`;
}
