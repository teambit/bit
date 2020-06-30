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
};

/**
 * renders a preview of a component.
 */
export function ComponentPreview({ component, style, previewName }: ComponentPreviewProps) {
  const url = `${component.server.url}/#${component.id}${`?preview=${previewName}` || ''}`;

  return <iframe style={style} src={url} />;
}
