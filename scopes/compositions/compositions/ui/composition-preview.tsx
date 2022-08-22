import React, { useMemo } from 'react';
import { ComponentPreview, ComponentPreviewProps } from '@teambit/preview.ui.component-preview';

import { Composition } from '../composition';

interface ComponentCompositionProps extends ComponentPreviewProps {
  /**
   * composition to use for component rendering.
   */
  composition?: Composition;
}


export function ComponentComposition({ composition, queryParams = [], ...rest }: ComponentCompositionProps) {
  const compositionParams = useMemo(
    () => (composition ? [`name=${composition.identifier}`] : []).concat(queryParams),
    [composition?.identifier, queryParams]
  );

  return (
    <ComponentPreview
      {...rest}
      style={{ width: '100%', height: '100%' }}
      previewName="compositions"
      queryParams={compositionParams}
    />
  );
}
