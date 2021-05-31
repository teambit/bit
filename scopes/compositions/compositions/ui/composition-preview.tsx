import React, { useMemo } from 'react';
import { ComponentModel } from '@teambit/component';
import { ComponentPreview } from '@teambit/preview.ui.component-preview';

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
   * Additional query params to append at the end of the *hash*. Changing this property will not reload the composition.
   */
  queryParams?: string | string[];

  /**
   * skip hot reload
   */
  hotReload?: boolean;
};

export function ComponentComposition({
  component,
  composition,
  hotReload,
  className,
  queryParams = [],
}: ComponentCompositionProps) {
  const compositionParams = useMemo(() => (composition ? [composition.identifier] : []).concat(queryParams), [
    composition?.identifier,
    queryParams,
  ]);

  return (
    <ComponentPreview
      className={className}
      component={component}
      style={{ width: '100%', height: '100%' }}
      previewName="compositions"
      queryParams={compositionParams}
      hotReload={hotReload}
    />
  );
}

ComponentComposition.defaultProps = {
  skipHotReload: true,
};
