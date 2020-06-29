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
export function ComponentPreview({ component, style }: ComponentPreviewProps) {
  return <iframe style={style} src={component.server.url} />;
}
