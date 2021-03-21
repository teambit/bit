import { ComponentModel } from '@teambit/component';
import { ComponentPreview } from '@teambit/ui.component-preview';
import React from 'react';

import { Composition } from '../composition';

export type ComponentCompositionProps = {
  /**
   * HTML class
   */
  className?: string;

  /**
   * component to render.
   */
  component: ComponentModel;

  /**
   * composition to use for component rendering.
   */
  composition?: Composition;

  /**
   * skip hot reload
   */
  hotReload?: boolean;
};

export function ComponentComposition({ component, composition, hotReload, className }: ComponentCompositionProps) {
  return (
    <ComponentPreview
      className={className}
      component={component}
      style={{ width: '100%', height: '100%' }}
      previewName="compositions"
      queryParams={`${(composition && composition.identifier) || ''}`}
      hotReload={hotReload}
    />
  );
}

ComponentComposition.defaultProps = {
  skipHotReload: true,
};
